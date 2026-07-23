"""
config.py — Backend configuration.

Resolves the location of the (independent, still-ingesting) problem bank. The
backend only READS this data — it never writes to problems.db.

Override the defaults with environment variables:
    PROBLEM_BANK_DB    — absolute/relative path to problems.db
    PROBLEM_BANK_IMAGES — directory holding the diagram images
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load a local .env (if present) so deployments can point at a different bank
# without editing code. See .env.example.
load_dotenv()

# This file's directory (the ICTM-Trainer repo root).
_BASE_DIR = Path(__file__).resolve().parent

# The problem bank lives one level above the app repo.
_DEFAULT_BANK_DIR = _BASE_DIR.parent / "il-math-problem-bank"

DB_PATH = Path(
    os.environ.get("PROBLEM_BANK_DB", _DEFAULT_BANK_DIR / "problems.db")
).resolve()

IMAGES_DIR = Path(
    os.environ.get("PROBLEM_BANK_IMAGES", _DEFAULT_BANK_DIR / "images")
).resolve()

AUTH_DB_PATH = Path(
    os.environ.get("AUTH_DB_PATH", _BASE_DIR / "auth.db")
).resolve()
