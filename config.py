"""
config.py — Backend configuration.

Resolves the location of the (independent, still-ingesting) problem bank. The
backend only READS this data — it never writes to problems.db.

Override the defaults with environment variables:
    PROBLEM_BANK_DB    — absolute/relative path to problems.db
    PROBLEM_BANK_IMAGES — directory holding the diagram images
    IMAGE_BASE_URL      — URL prefix the frontend uses for diagrams
"""

from __future__ import annotations  # `X | None` hints on older serverless Pythons

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

# A snapshot committed to this repo, so deployments (where the separate bank
# repo does not exist) have data without any configuration. Refresh it with
# scripts/snapshot_data.py.
_SNAPSHOT_DB = _BASE_DIR / "data" / "problems.db"


def _resolve(env_var: str, bank_default: Path, snapshot: Path | None = None) -> Path:
    """Env override, else the live bank, else the committed snapshot.

    Relative env values resolve against the repo root, not the process working
    directory — serverless runtimes rarely start where you expect.
    """
    raw = os.environ.get(env_var)
    if raw:
        p = Path(raw)
        return (p if p.is_absolute() else _BASE_DIR / p).resolve()
    if bank_default.exists():
        return bank_default.resolve()
    if snapshot is not None and snapshot.exists():
        return snapshot.resolve()
    return bank_default.resolve()


DB_PATH = _resolve("PROBLEM_BANK_DB", _DEFAULT_BANK_DIR / "problems.db", _SNAPSHOT_DB)

IMAGES_DIR = _resolve(
    "PROBLEM_BANK_IMAGES",
    _DEFAULT_BANK_DIR / "images",
    _BASE_DIR / "ictm-reader" / "public" / "images",
)

# URL prefix for diagram images. Defaults to the Flask route, so local dev works
# with no setup. In production set IMAGE_BASE_URL=/images and stage the files into
# the frontend build (scripts/stage_images.py) so the CDN serves them directly —
# 938 immutable files have no business costing a Python invocation each.
IMAGE_BASE_URL = os.environ.get("IMAGE_BASE_URL", "/api/images").rstrip("/")
