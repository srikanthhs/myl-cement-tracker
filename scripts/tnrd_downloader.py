"""
TNRD Excel Downloader
---------------------
Downloads configured Excel reports from tnrd.tn.gov.in on a schedule,
then pushes the parsed data into Firebase Firestore so the Vercel
dashboard can display it in real-time.

Authentication
--------------
The login form has a CAPTCHA, so this script uses the 2captcha API to
solve it automatically. Cost: ~$0.03 per 1000 solves (< ₹3/month for
3 daily runs).

Set the TWOCAPTCHA_API_KEY environment variable / GitHub Secret.
Get a key at https://2captcha.com — top up with minimum $3.

Fast-path: if TNRD_SESSION_COOKIE is set (PHPSESSID value copied from
browser), the script skips login entirely until the cookie expires.

Usage:
  python scripts/tnrd_downloader.py --now        # download all reports once
  python scripts/tnrd_downloader.py --id <id>    # download one report
  python scripts/tnrd_downloader.py              # run scheduler (blocks)
"""

import base64
import hashlib
import os
import sys
import json
import logging
import argparse
import tempfile
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

import requests
import schedule
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


# ── Captcha solver (2captcha) ─────────────────────────────────────────────────
class CaptchaSolver:
    """Solves image captchas using the 2captcha.com API."""

    SUBMIT_URL = "https://2captcha.com/in.php"
    RESULT_URL = "https://2captcha.com/res.php"

    def __init__(self, api_key: str):
        self._key = api_key

    def solve(self, image_bytes: bytes) -> str:
        """Submit captcha image and return the solved text."""
        b64 = base64.b64encode(image_bytes).decode()

        resp = requests.post(self.SUBMIT_URL, data={
            "key":    self._key,
            "method": "base64",
            "body":   b64,
            "json":   1,
        }, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") != 1:
            raise RuntimeError(f"2captcha submit failed: {data}")

        captcha_id = data["request"]
        log.info("  Captcha submitted (id=%s), waiting for solution…", captcha_id)

        # Poll until solved (usually 10-20 seconds)
        for attempt in range(20):
            time.sleep(5)
            poll = requests.get(self.RESULT_URL, params={
                "key":    self._key,
                "action": "get",
                "id":     captcha_id,
                "json":   1,
            }, timeout=15)
            poll.raise_for_status()
            result = poll.json()

            if result.get("status") == 1:
                solution = result["request"]
                log.info("  Captcha solved: %s", solution)
                return solution

            if result.get("request") != "CAPCHA_NOT_READY":
                raise RuntimeError(f"2captcha error: {result}")

        raise RuntimeError("2captcha timed out after 100 seconds.")


# ── HTML parser – extracts captcha image src ──────────────────────────────────
class _CaptchaImgParser(HTMLParser):
    """Find the first <img> tag whose src looks like a captcha endpoint."""

    def __init__(self):
        super().__init__()
        self.captcha_src = None

    def handle_starttag(self, tag, attrs):
        if tag != "img" or self.captcha_src:
            return
        d = dict(attrs)
        src = d.get("src", "")
        # Common patterns: captcha.php, generatecaptcha, captcha_img, etc.
        if any(kw in src.lower() for kw in ["captcha", "verify", "securimage"]):
            self.captcha_src = src


# ── HTTP Session ──────────────────────────────────────────────────────────────
class TnrdSession:
    """
    Authenticated requests.Session for tnrd.tn.gov.in.

    Auth priority:
      1. TNRD_SESSION_COOKIE env var → inject PHPSESSID, skip login (fastest)
      2. TWOCAPTCHA_API_KEY + username/password → full automated login
    """

    BASE_URL  = "https://tnrd.tn.gov.in"
    LOGIN_PAGE = "https://tnrd.tn.gov.in/"

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

    # ── Auth methods ──────────────────────────────────────────────────────────

    def _try_session_cookie(self) -> bool:
        val = os.environ.get("TNRD_SESSION_COOKIE", "").strip()
        if not val:
            return False
        self._session.cookies.set("PHPSESSID", val, domain="tnrd.tn.gov.in")
        log.info("Using stored TNRD_SESSION_COOKIE.")
        self._ready = True
        return True

    def _automated_login(self, login_cfg: dict):
        """Full login: GET page → extract captcha → solve → POST form."""
        api_key = os.environ.get("TWOCAPTCHA_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError(
                "Cannot log in automatically: TWOCAPTCHA_API_KEY is not set.\n"
                "Either set TWOCAPTCHA_API_KEY (get a key at https://2captcha.com)\n"
                "or set TNRD_SESSION_COOKIE with your PHPSESSID cookie value."
            )

        log.info("Starting automated login…")

        # Step 1: GET the login page to start a PHP session
        page_resp = self._session.get(self.LOGIN_PAGE, timeout=30)
        page_resp.raise_for_status()

        # Step 2: find the captcha image URL in the page HTML
        parser = _CaptchaImgParser()
        parser.feed(page_resp.text)
        captcha_src = parser.captcha_src

        if not captcha_src:
            log.warning("No captcha image found on login page — trying without captcha.")
            captcha_solution = ""
        else:
            # Make absolute if relative
            if captcha_src.startswith("/"):
                captcha_src = self.BASE_URL + captcha_src
            elif not captcha_src.startswith("http"):
                captcha_src = self.BASE_URL + "/" + captcha_src

            log.info("Captcha image: %s", captcha_src)
            captcha_img = self._session.get(captcha_src, timeout=15).content
            solver = CaptchaSolver(api_key)
            captcha_solution = solver.solve(captcha_img)

        # Step 3: build and POST the login form
        ufield = login_cfg.get("username_field", "uname")
        pfield = login_cfg.get("password_field", "pwd")
        cfield = login_cfg.get("captcha_field", "captchaval")

        # Password is MD5-hashed
        pwd_hash = hashlib.md5(self._password.encode()).hexdigest()

        payload = {
            ufield: self._username,
            pfield: pwd_hash,
            cfield: captcha_solution,
        }
        payload.update(login_cfg.get("extra_fields", {}))

        login_url = login_cfg["url"]

        # Site uses multipart/form-data
        resp = self._session.post(
            login_url,
            files={k: (None, v) for k, v in payload.items()},
            timeout=30,
            allow_redirects=True,
        )
        resp.raise_for_status()

        fail_check = login_cfg.get("failure_contains", "invalid")
        if fail_check and fail_check.lower() in resp.text.lower():
            raise RuntimeError(
                f"Login failed — page contains '{fail_check}'. "
                "The captcha solution may have been wrong. Will retry."
            )

        self._ready = True
        log.info("Login successful.")

    def _ensure_ready(self, login_cfg: dict):
        if self._ready:
            return
        if not self._try_session_cookie():
            self._automated_login(login_cfg)

    def _is_login_page(self, resp: requests.Response) -> bool:
        ct = resp.headers.get("Content-Type", "")
        if "html" not in ct:
            return False
        text = resp.text.lower()
        return any(k in text for k in ["logincheck", "captchaval", "session expired", "please login", "uname"])

    # ── Download ──────────────────────────────────────────────────────────────

    def download(self, report: dict, login_cfg: dict) -> bytes:
        """Download one report. Retries once on session expiry."""
        self._ensure_ready(login_cfg)

        url    = report["url"]
        method = report.get("method", "GET").upper()
        today  = datetime.now().strftime(report.get("date_format", "%d-%m-%Y"))

        def _sub(v):
            return v.replace("{today}", today) if isinstance(v, str) else v

        params = {k: _sub(v) for k, v in report.get("params", {}).items()}
        data   = {k: _sub(v) for k, v in report.get("form_data", {}).items()}

        log.info("Downloading '%s' …", report["name"])
        resp = self._fetch(method, url, params, data)
        resp.raise_for_status()

        if self._is_login_page(resp):
            log.warning("Session expired — re-authenticating.")
            self._ready = False
            # Clear stored cookie so we go through full login
            self._session.cookies.clear()
            self._automated_login(login_cfg)
            resp = self._fetch(method, url, params, data)
            resp.raise_for_status()

            if self._is_login_page(resp):
                raise RuntimeError(
                    "Still getting login page after re-authentication. "
                    "Check credentials and report URL."
                )

        return resp.content

    def _fetch(self, method, url, params, data):
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
    _delete_collection(rows_ref)

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
        get_firestore() \
            .collection(report.get("firebase_collection", "tnrd_reports")) \
            .document(report["id"]) \
            .set({"status": "error", "lastError": error,
                  "errorAt": datetime.now(timezone.utc)}, merge=True)
    except Exception as e:
        log.error("Could not write failure status: %s", e)


# ── Jobs ──────────────────────────────────────────────────────────────────────
def run_report(report: dict, session: TnrdSession, login_cfg: dict):
    log.info("=== Starting: %s ===", report["name"])
    try:
        raw = session.download(report, login_cfg)

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
            log.info("Skipping disabled: %s", report["name"])


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
    has_captcha  = bool(os.environ.get("TWOCAPTCHA_API_KEY"))
    has_password = bool(cfg["credentials"]["username"] and cfg["credentials"]["password"])

    if not has_cookie and not (has_captcha and has_password):
        log.error(
            "No valid credentials found. Provide one of:\n"
            "  A) TNRD_SESSION_COOKIE  (PHPSESSID from browser — easy, manual refresh needed)\n"
            "  B) TWOCAPTCHA_API_KEY + TNRD_USERNAME + TNRD_PASSWORD  (fully automated)"
        )
        sys.exit(1)

    if args.id:
        run_by_id(cfg, args.id)
    elif args.now:
        run_all(cfg)
    else:
        setup_schedule(cfg)
