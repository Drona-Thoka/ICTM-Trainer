"""
api/index.py — Vercel serverless entry point.

Vercel looks for Python handlers under api/, but the application lives at the
repo root, so put the root on sys.path and re-export the WSGI app. All routing
still comes from app.py; this file is only the adapter.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import app  # noqa: E402  (must follow the sys.path change)

# Vercel's Python runtime looks for a WSGI callable named `app`.
__all__ = ["app"]
