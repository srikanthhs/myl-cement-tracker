"""
TNRD Excel Downloader
---------------------
Downloads configured Excel reports from tnrd.tn.gov.in on a schedule,
then pushes the parsed data into Firebase Firestore so the Vercel
dashboard can display it in real-time.

Usage:
  python scripts/tnrd_downloader.py              # run scheduler (blocks)
  python scripts/tnrd_downloader.py --now        # run all downloads once and exit
  python scripts/tnrd_downloader.py --id <id>    # run one report by ID and exit
"""

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

    # Overlay environment variables for credentials (never hard-code secrets)
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
        project  = os.environ.get("FIREBASE_PROJECT_ID", "")

        if sa_json:
            info = json.loads(sa_json)
            cred = credentials.Certificate(info)
        elif sa_path and Path(sa_path).exists():
            cred = credentials.Certificate(sa_path)
        else:
            # Use application default credentials (e.g. in GitHub Actions with OIDC)
            cred = credentials.ApplicationDefault()

        firebase_admin.initialize_app(cred, {"projectId": project} if project else {})

    _db = firestore.client()
    return _db


# ── HTTP Session ──────────────────────────────────────────────────────────────
class TnrdSession:
    """Maintains a logged-in requests.Session for tnrd.tn.gov.in."""

    BASE_URL = "https://tnrd.tn.gov.in"

    def __init__(self, username: str, password: str):
        self._username = username
        self._password = password
        self._session  = requests.Session()
        self._session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        })
        self._logged_in = False

    def _login(self, login_cfg: dict):
        """POST login form. login_cfg comes from download_schedule.json → login."""
        url    = login_cfg.get("url", f"{self.BASE_URL}/Account/Login")
        method = login_cfg.get("method", "POST").upper()

        # Build form payload – field names are configurable so they can be
        # updated without touching this script if the site changes.
        payload = {
            login_cfg.get("username_field", "UserName"): self._username,
            login_cfg.get("password_field", "Password"): self._password,
        }
        # Merge any extra static fields (e.g. __RequestVerificationToken)
        payload.update(login_cfg.get("extra_fields", {}))

        # Some sites need a GET first to collect a CSRF token from the page
        if login_cfg.get("fetch_csrf_first", False):
            page = self._session.get(url, timeout=30)
            from html.parser import HTMLParser

            class _TokenParser(HTMLParser):
                token = None
                def handle_starttag(self, tag, attrs):
                    d = dict(attrs)
                    if tag == "input" and d.get("name") == "__RequestVerificationToken":
                        _TokenParser.token = d.get("value")

            parser = _TokenParser()
            parser.feed(page.text)
            if parser.token:
                payload["__RequestVerificationToken"] = parser.token

        resp = self._session.request(method, url, data=payload, timeout=30, allow_redirects=True)
        resp.raise_for_status()

        # Verify login succeeded using a configurable keyword in the response
        success_check = login_cfg.get("success_contains", "")
        fail_check    = login_cfg.get("failure_contains", "Invalid")

        if fail_check and fail_check.lower() in resp.text.lower():
            raise RuntimeError(
                f"Login failed – response contains '{fail_check}'. "
                "Check TNRD_USERNAME / TNRD_PASSWORD."
            )
        if success_check and success_check.lower() not in resp.text.lower():
            log.warning("Login: success keyword '%s' not found – proceeding anyway.", success_check)

        self._logged_in = True
        log.info("Logged in to %s as %s", self.BASE_URL, self._username)

    def download(self, report: dict, login_cfg: dict) -> bytes:
        """Download a single report, logging in if needed. Returns raw bytes."""
        if not self._logged_in:
            self._login(login_cfg)

        url    = report["url"]
        method = report.get("method", "GET").upper()
        params = report.get("params", {})
        data   = report.get("form_data", {})

        # Substitute date placeholders  e.g. "{today}" → "28-04-2026"
        today_str = datetime.now().strftime(report.get("date_format", "%d-%m-%Y"))
        def _sub(v):
            return v.replace("{today}", today_str) if isinstance(v, str) else v

        params = {k: _sub(v) for k, v in params.items()}
        data   = {k: _sub(v) for k, v in data.items()}

        log.info("Downloading '%s' from %s …", report["name"], url)

        if method == "GET":
            resp = self._session.get(url, params=params, timeout=60)
        else:
            resp = self._session.post(url, params=params, data=data, timeout=60)

        resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "")
        if "html" in content_type:
            # Session may have expired; re-login once and retry
            log.warning("Got HTML instead of Excel – re-logging in and retrying.")
            self._logged_in = False
            self._login(login_cfg)
            resp = self._session.request(
                method, url,
                params=params if method == "GET" else None,
                data=data if method != "GET" else None,
                timeout=60,
            )
            resp.raise_for_status()

        return resp.content


# ── Excel Parsing ─────────────────────────────────────────────────────────────
def parse_excel(raw_bytes: bytes, report: dict) -> list[dict[str, Any]]:
    """Parse an Excel file and return a list of row dicts."""
    sheet_name = report.get("sheet_name", 0)     # 0 = first sheet
    header_row = report.get("header_row", 0)      # 0-indexed

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        df = pd.read_excel(tmp_path, sheet_name=sheet_name, header=header_row)
        # Drop fully-empty rows and columns
        df.dropna(how="all", inplace=True)
        df.dropna(axis=1, how="all", inplace=True)
        # Normalise column names
        df.columns = [str(c).strip() for c in df.columns]
        # Convert NaN → None for Firestore compatibility
        df = df.where(pd.notna(df), other=None)
        rows = df.to_dict(orient="records")
        log.info("  Parsed %d rows from '%s'", len(rows), report["name"])
        return rows
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ── Firestore Upload ──────────────────────────────────────────────────────────
def push_to_firestore(report: dict, rows: list[dict], raw_bytes: bytes):
    """
    Writes data into Firestore:
      tnrd_reports/{report_id}           – metadata + status
      tnrd_reports/{report_id}/rows/     – sub-collection, one doc per row
    """
    db          = get_firestore()
    report_id   = report["id"]
    collection  = report.get("firebase_collection", "tnrd_reports")
    now         = datetime.now(timezone.utc)

    meta_ref = db.collection(collection).document(report_id)
    meta_ref.set({
        "id":           report_id,
        "name":         report["name"],
        "downloadedAt": now,
        "rowCount":     len(rows),
        "status":       "success",
        "scheduleAt":   report.get("schedule_times", []),
        "fileSizeBytes": len(raw_bytes),
    }, merge=True)

    # Write rows in batches of 400 (Firestore limit is 500 per batch)
    rows_ref  = meta_ref.collection("rows")
    batch_size = 400

    # Clear old rows first (delete sub-collection)
    _delete_collection(rows_ref, batch_size=batch_size)

    for i in range(0, len(rows), batch_size):
        batch = db.batch()
        for j, row in enumerate(rows[i:i + batch_size]):
            doc_ref = rows_ref.document(str(i + j))
            # Firestore doesn't accept numpy types; coerce to Python scalars
            clean   = _coerce(row)
            batch.set(doc_ref, clean)
        batch.commit()

    log.info("  Pushed %d rows to Firestore collection '%s/%s'", len(rows), collection, report_id)


def _delete_collection(col_ref, batch_size=400):
    """Delete all documents in a Firestore collection reference."""
    db = get_firestore()
    docs = col_ref.limit(batch_size).stream()
    deleted = 0
    for doc in docs:
        doc.reference.delete()
        deleted += 1
    if deleted >= batch_size:
        _delete_collection(col_ref, batch_size)


def _coerce(obj):
    """Recursively convert numpy / pandas types to plain Python types."""
    import numpy as np
    if isinstance(obj, dict):
        return {k: _coerce(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_coerce(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return None if np.isnan(obj) else float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if pd.isna(obj) if not isinstance(obj, (list, dict, str)) else False:
        return None
    return obj


def mark_failed(report: dict, error: str):
    """Record a failure status in Firestore without overwriting previous data."""
    try:
        db        = get_firestore()
        collection = report.get("firebase_collection", "tnrd_reports")
        meta_ref   = db.collection(collection).document(report["id"])
        meta_ref.set({
            "status":    "error",
            "lastError": error,
            "errorAt":   datetime.now(timezone.utc),
        }, merge=True)
    except Exception as e:
        log.error("Could not write failure status to Firestore: %s", e)


# ── Download Job ──────────────────────────────────────────────────────────────
def run_report(report: dict, session: TnrdSession, login_cfg: dict):
    """Download one report and push it to Firestore."""
    report_id = report["id"]
    log.info("=== Starting report: %s (%s) ===", report["name"], report_id)

    try:
        raw = session.download(report, login_cfg)

        # Optionally save to disk for debugging
        if os.environ.get("TNRD_SAVE_LOCAL", "").lower() in ("1", "true", "yes"):
            out_path = DOWNLOAD_DIR / f"{report_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            out_path.write_bytes(raw)
            log.info("  Saved local copy: %s", out_path)

        rows = parse_excel(raw, report)
        push_to_firestore(report, rows, raw)
        log.info("=== Completed: %s ===", report["name"])

    except Exception as exc:
        log.error("=== FAILED: %s – %s ===", report["name"], exc, exc_info=True)
        mark_failed(report, str(exc))


def run_all(cfg: dict):
    """Download all reports immediately."""
    session = TnrdSession(cfg["credentials"]["username"], cfg["credentials"]["password"])
    for report in cfg["reports"]:
        if not report.get("enabled", True):
            log.info("Skipping disabled report: %s", report["name"])
            continue
        run_report(report, session, cfg["login"])


def run_by_id(cfg: dict, report_id: str):
    """Download a single report by ID."""
    matches = [r for r in cfg["reports"] if r["id"] == report_id]
    if not matches:
        log.error("No report found with id='%s'", report_id)
        sys.exit(1)
    session = TnrdSession(cfg["credentials"]["username"], cfg["credentials"]["password"])
    run_report(matches[0], session, cfg["login"])


# ── Scheduler ─────────────────────────────────────────────────────────────────
def setup_schedule(cfg: dict):
    """Register each report's schedule_times with the 'schedule' library."""
    session = TnrdSession(cfg["credentials"]["username"], cfg["credentials"]["password"])

    for report in cfg["reports"]:
        if not report.get("enabled", True):
            continue
        for time_str in report.get("schedule_times", []):
            schedule.every().day.at(time_str).do(
                run_report, report=report, session=session, login_cfg=cfg["login"]
            )
            log.info("Scheduled '%s' at %s daily", report["name"], time_str)

    log.info("Scheduler ready. Waiting for jobs…")
    while True:
        schedule.run_pending()
        time.sleep(30)


# ── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TNRD Excel Downloader")
    parser.add_argument("--now", action="store_true",
                        help="Download all enabled reports immediately and exit")
    parser.add_argument("--id",  metavar="REPORT_ID",
                        help="Download a single report by ID and exit")
    args = parser.parse_args()

    cfg = load_config()

    if not cfg["credentials"]["username"] or not cfg["credentials"]["password"]:
        log.error(
            "TNRD credentials missing. Set TNRD_USERNAME and TNRD_PASSWORD "
            "environment variables (or fill download_schedule.json credentials)."
        )
        sys.exit(1)

    if args.id:
        run_by_id(cfg, args.id)
    elif args.now:
        run_all(cfg)
    else:
        setup_schedule(cfg)
