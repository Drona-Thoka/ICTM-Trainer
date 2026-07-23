"""
config.py — Backend configuration.

Resolves the location of the (independent, still-ingesting) problem bank. The
backend only READS this data — it never writes to problems.db.

Override the defaults with environment variables:
    PROBLEM_BANK_DB    — absolute/relative path to problems.db
    PROBLEM_BANK_IMAGES — directory holding the diagram images
    IMAGE_BASE_URL      — URL prefix the frontend uses for diagrams
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

# URL prefix for diagram images. Defaults to the Flask route, so local dev works
# with no setup. In production set IMAGE_BASE_URL=/images and stage the files into
# the frontend build (scripts/stage_images.py) so the CDN serves them directly —
# 938 immutable files have no business costing a Python invocation each.
IMAGE_BASE_URL = os.environ.get("IMAGE_BASE_URL", "/api/images").rstrip("/")
