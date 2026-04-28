"""
TNRD Excel Downloader
---------------------
Downloads configured Excel reports from tnrd.tn.gov.in on a schedule,
then pushes the parsed data into Firebase Firestore so the Vercel
dashboard can display it in real-time.

Authentication strategy
-----------------------
The site uses CAPTCHA on its login form, so automated login is unreliable.
The preferred approach is to store the PHP session cookie and reuse it:

  1. Log in manually in your browser.
  2. Open DevTools → Application → Cookies → https://tnrd.tn.gov.in
  3. Copy the value of the PHPSESSID cookie.
  4. Set it as the TNRD_SESSION_COOKIE environment variable / GitHub Secret.

The script uses that cookie directly — no login needed.
When the session expires (usually after a few hours of inactivity), repeat
the steps above and update the secret.

If TNRD_SESSION_COOKIE is not set, the script falls back to username/password
login (password is MD5-hashed as the site expects). This only works when the
captcha happens to be absent or skippable — treat it as a last resort.

Usage:
  python scripts/tnrd_downloader.py              # run scheduler (blocks)
  python scripts/tnrd_downloader.py --now        # download all reports once and exit
  python scripts/tnrd_downloader.py --id <id>    # download one report by ID and exit
"""

import hashlib
import os
import sys
import json
import logging
import argparse
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
import schedule
import time
import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("tnrd")

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
CONFIG_FILE  = SCRIPT_DIR / "download_schedule.json"
DOWNLOAD_DIR = SCRIPT_DIR / "downloaded_excels"
DOWNLOAD_DIR.mkdir(exist_ok=True)

# ── Config ───────────────────────────────────────────────────────────────────
def load_config() -> dict:
    with open(CONFIG_FILE, encoding="utf-8") as f:
        cfg = json.load(f)

    cfg["credentials"]["username"] = (
        os.environ.get("TNRD_USERNAME") or cfg["credentials"].get("username", "")
    )
    cfg["credentials"]["password"] = (
        os.environ.get("TNRD_PASSWORD") or cfg["credentials"].get("password", "")
    )
    return cfg


# ── Firebase ─────────────────────────────────────────────────────────────────
_db = None

def get_firestore():
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        sa_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        project = os.environ.get("FIREBASE_PROJECT_ID", "")

        if sa_json:
            cred = credentials.Certificate(json.loads(sa_json))
        elif sa_path and Path(sa_path).exists():
            cred = credentials.Certificate(sa_path)
        else:
            cred = credentials.ApplicationDefault()

        firebase_admin.initialize_app(cred, {"projectId": project} if project else {})

    _db = firestore.client()
    return _db


# ── HTTP Session ──────────────────────────────────────────────────────────────
class TnrdSession:
    """
    Authenticated requests.Session for tnrd.tn.gov.in.

    Priority order:
      1. TNRD_SESSION_COOKIE env var  →  inject PHPSESSID directly (no login)
      2. Username + password          →  POST to logincheck.php (MD5 password,
                                         multipart/form-data). Requires captcha
                                         to be absent — use as fallback only.
    """

    BASE_URL = "https://tnrd.tn.gov.in"

    def __init__(self, username: str, password: str):
        self._username = username
        self._password = password
        self._session  = requests.Session()
        self._session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/147.0.0.0 Safari/537.36"
            ),
            "Origin":  self.BASE_URL,
            "Referer": self.BASE_URL + "/",
        })
        self._ready = False

    def _inject_session_cookie(self):
        """Use a pre-existing PHPSESSID — no login form needed."""
        cookie_val = os.environ.get("TNRD_SESSION_COOKIE", "").strip()
        if not cookie_val:
            return False

        self._session.cookies.set("PHPSESSID", cookie_val, domain="tnrd.tn.gov.in")
        log.info("Using stored session cookie (TNRD_SESSION_COOKIE).")
        self._ready = True
        return True

    def _login_with_password(self, login_cfg: dict):
        """Fall back: POST username + MD5(password) to logincheck.php."""
        url    = login_cfg["url"]
        ufield = login_cfg.get("username_field", "uname")
        pfield = login_cfg.get("password_field", "pwd")

        # The site sends the password as MD5 hex digest, not plain text.
        pwd_hash = hashlib.md5(self._password.encode()).hexdigest()

        payload = {
            ufield: self._username,
            pfield: pwd_hash,
        }
        payload.update(login_cfg.get("extra_fields", {}))

        log.info("Attempting password login to %s …", url)

        # Site uses multipart/form-data (not application/x-www-form-urlencoded)
        if login_cfg.get("multipart", True):
            resp = self._session.post(url, files={k: (None, v) for k, v in payload.items()}, timeout=30, allow_redirects=True)
        else:
            resp = self._session.post(url, data=payload, timeout=30, allow_redirects=True)

        resp.raise_for_status()

        fail_check = login_cfg.get("failure_contains", "invalid")
        if fail_check and fail_check.lower() in resp.text.lower():
            raise RuntimeError(
                f"Login failed — response contains '{fail_check}'. "
                "The site may be showing a CAPTCHA. "
                "Set TNRD_SESSION_COOKIE instead (see script docstring)."
            )

        self._ready = True
        log.info("Password login succeeded.")

    def _ensure_ready(self, login_cfg: dict):
        if self._ready:
            return
        if not self._inject_session_cookie():
            self._login_with_password(login_cfg)

    def _session_expired(self, resp: requests.Response) -> bool:
        """Return True if the server redirected us back to the login page."""
        ct = resp.headers.get("Content-Type", "")
        if "html" not in ct:
            return False
        login_indicators = ["logincheck", "login", "session expired", "please login"]
        text_lower = resp.text.lower()
        return any(ind in text_lower for ind in login_indicators)

    def download(self, report: dict, login_cfg: dict) -> bytes:
        """Download a single report. Returns raw bytes (Excel file)."""
        self._ensure_ready(login_cfg)

        url    = report["url"]
        method = report.get("method", "GET").upper()

        today_str = datetime.now().strftime(report.get("date_format", "%d-%m-%Y"))

        def _sub(v):
            return v.replace("{today}", today_str) if isinstance(v, str) else v

        params = {k: _sub(v) for k, v in report.get("params", {}).items()}
        data   = {k: _sub(v) for k, v in report.get("form_data", {}).items()}

        log.info("Downloading '%s' …", report["name"])

        resp = self._make_request(method, url, params, data)
        resp.raise_for_status()

        if self._session_expired(resp):
            log.warning("Session expired — refreshing and retrying.")
            self._ready = False
            # Force re-inject cookie (value may have been updated in the env)
            if not self._inject_session_cookie():
                self._login_with_password(login_cfg)
            resp = self._make_request(method, url, params, data)
            resp.raise_for_status()

            if self._session_expired(resp):
                raise RuntimeError(
                    "Session is still expired after refresh. "
                    "Update TNRD_SESSION_COOKIE with a fresh PHPSESSID value."
                )

        return resp.content

    def _make_request(self, method, url, params, data):
        if method == "GET":
            return self._session.get(url, params=params, timeout=60)
        return self._session.post(url, params=params, data=data, timeout=60)


# ── Excel Parsing ─────────────────────────────────────────────────────────────
def parse_excel(raw_bytes: bytes, report: dict) -> list[dict[str, Any]]:
    sheet_name = report.get("sheet_name", 0)
    header_row = report.get("header_row", 0)

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        df = pd.read_excel(tmp_path, sheet_name=sheet_name, header=header_row)
        df.dropna(how="all", inplace=True)
        df.dropna(axis=1, how="all", inplace=True)
        df.columns = [str(c).strip() for c in df.columns]
        df = df.where(pd.notna(df), other=None)
        rows = df.to_dict(orient="records")
        log.info("  Parsed %d rows from '%s'", len(rows), report["name"])
        return rows
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ── Firestore Upload ──────────────────────────────────────────────────────────
def push_to_firestore(report: dict, rows: list[dict], raw_bytes: bytes):
    db         = get_firestore()
    report_id  = report["id"]
    collection = report.get("firebase_collection", "tnrd_reports")
    now        = datetime.now(timezone.utc)

    meta_ref = db.collection(collection).document(report_id)
    meta_ref.set({
        "id":            report_id,
        "name":          report["name"],
        "downloadedAt":  now,
        "rowCount":      len(rows),
        "status":        "success",
        "scheduleAt":    report.get("schedule_times", []),
        "fileSizeBytes": len(raw_bytes),
    }, merge=True)

    rows_ref   = meta_ref.collection("rows")
    batch_size = 400

    _delete_collection(rows_ref, batch_size=batch_size)

    for i in range(0, len(rows), batch_size):
        batch = db.batch()
        for j, row in enumerate(rows[i:i + batch_size]):
            batch.set(rows_ref.document(str(i + j)), _coerce(row))
        batch.commit()

    log.info("  Pushed %d rows → Firestore '%s/%s'", len(rows), collection, report_id)


def _delete_collection(col_ref, batch_size=400):
    docs = list(col_ref.limit(batch_size).stream())
    for doc in docs:
        doc.reference.delete()
    if len(docs) >= batch_size:
        _delete_collection(col_ref, batch_size)


def _coerce(obj):
    import numpy as np
    if isinstance(obj, dict):
        return {k: _coerce(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_coerce(v) for v in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return None if np.isnan(obj) else float(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    try:
        if pd.isna(obj):
            return None
    except (TypeError, ValueError):
        pass
    return obj


def mark_failed(report: dict, error: str):
    try:
        db = get_firestore()
        db.collection(report.get("firebase_collection", "tnrd_reports")) \
          .document(report["id"]) \
          .set({"status": "error", "lastError": error,
                "errorAt": datetime.now(timezone.utc)}, merge=True)
    except Exception as e:
        log.error("Could not write failure status: %s", e)


# ── Jobs ──────────────────────────────────────────────────────────────────────
def run_report(report: dict, session: TnrdSession, login_cfg: dict):
    log.info("=== Starting: %s (%s) ===", report["name"], report["id"])
    try:
        raw  = session.download(report, login_cfg)

        if os.environ.get("TNRD_SAVE_LOCAL", "").lower() in ("1", "true", "yes"):
            out = DOWNLOAD_DIR / f"{report['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            out.write_bytes(raw)
            log.info("  Saved: %s", out)

        rows = parse_excel(raw, report)
        push_to_firestore(report, rows, raw)
        log.info("=== Done: %s ===", report["name"])
    except Exception as exc:
        log.error("=== FAILED: %s – %s ===", report["name"], exc, exc_info=True)
        mark_failed(report, str(exc))


def run_all(cfg: dict):
    session = TnrdSession(cfg["credentials"]["username"], cfg["credentials"]["password"])
    for report in cfg["reports"]:
        if report.get("enabled", True):
            run_report(report, session, cfg["login"])
        else:
            log.info("Skipping disabled report: %s", report["name"])


def run_by_id(cfg: dict, report_id: str):
    matches = [r for r in cfg["reports"] if r["id"] == report_id]
    if not matches:
        log.error("No report with id='%s'", report_id)
        sys.exit(1)
    session = TnrdSession(cfg["credentials"]["username"], cfg["credentials"]["password"])
    run_report(matches[0], session, cfg["login"])


def setup_schedule(cfg: dict):
    session = TnrdSession(cfg["credentials"]["username"], cfg["credentials"]["password"])
    for report in cfg["reports"]:
        if not report.get("enabled", True):
            continue
        for t in report.get("schedule_times", []):
            schedule.every().day.at(t).do(
                run_report, report=report, session=session, login_cfg=cfg["login"]
            )
            log.info("Scheduled '%s' at %s", report["name"], t)
    log.info("Scheduler running…")
    while True:
        schedule.run_pending()
        time.sleep(30)


# ── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TNRD Excel Downloader")
    parser.add_argument("--now", action="store_true", help="Download all reports and exit")
    parser.add_argument("--id",  metavar="REPORT_ID",  help="Download one report by ID and exit")
    args = parser.parse_args()

    cfg = load_config()

    has_cookie   = bool(os.environ.get("TNRD_SESSION_COOKIE"))
    has_password = bool(cfg["credentials"]["username"] and cfg["credentials"]["password"])

    if not has_cookie and not has_password:
        log.error(
            "No credentials found.\n"
            "  Preferred: set TNRD_SESSION_COOKIE to your PHPSESSID cookie value.\n"
            "  Fallback:  set TNRD_USERNAME and TNRD_PASSWORD."
        )
        sys.exit(1)

    if args.id:
        run_by_id(cfg, args.id)
    elif args.now:
        run_all(cfg)
    else:
        setup_schedule(cfg)
