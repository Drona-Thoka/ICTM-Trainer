"""
snapshot_data.py — Copy the problem bank into this repo so deployments have data.

The bank is a separate git repo one level up, so a Vercel build never sees it.
This takes a point-in-time snapshot into files that ARE committed here:

    data/problems.db              <- the bank's SQLite database
    ictm-reader/public/images/    <- diagram images, served statically by the CDN

Run this whenever you want the deployed site to pick up newly ingested problems,
then commit the result:

    python scripts/snapshot_data.py
    git add data ictm-reader/public/images && git commit -m "Refresh problem data"

The database is copied with SQLite's backup API rather than a file copy, so it
is safe to run while ingestion is mid-write.
"""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from stage_images import main as stage_images  # noqa: E402  (same scripts/ dir)

ROOT = Path(__file__).resolve().parent.parent
DEST_DB = ROOT / "data" / "problems.db"


def snapshot_db() -> int:
    src = config.DB_PATH
    if not src.exists():
        print(f"error: no database at {src}")
        return 1
    if src.resolve() == DEST_DB.resolve():
        print("error: source and destination are the same file; is the bank missing?")
        return 1

    DEST_DB.parent.mkdir(parents=True, exist_ok=True)

    # sqlite3.backup() takes a consistent snapshot even while the ingestion
    # pipeline is writing; a plain file copy can catch a torn page.
    source = sqlite3.connect(f"file:{src.as_posix()}?mode=ro", uri=True)
    dest = sqlite3.connect(DEST_DB)
    try:
        source.backup(dest)
    finally:
        dest.close()
        source.close()

    approved = sqlite3.connect(DEST_DB).execute(
        "SELECT COUNT(*) FROM problems WHERE review_status = 'approved'"
    ).fetchone()[0]
    size_mb = DEST_DB.stat().st_size / 1_048_576
    print(f"database -> {DEST_DB}  ({size_mb:.1f} MB, {approved} approved problems)")
    return 0


def main() -> int:
    print("-- database --")
    if snapshot_db() != 0:
        return 1
    print("\n-- images --")
    return stage_images()


if __name__ == "__main__":
    raise SystemExit(main())
