"""
stage_images.py — Copy the problem bank's diagram images into the frontend's
static directory so the CDN serves them instead of the Python backend.

Public diagrams are staged into the frontend; ICTM/NSML diagrams go only into
server-side data/private-images. Both locations are deployment snapshots.
Run this before a production build. IMAGE_BASE_URL=/images affects only public
competitions; protected diagrams always use the authenticated API.

    python scripts/stage_images.py
    cd ictm-reader && npm run build

Local dev needs none of this: IMAGE_BASE_URL defaults to the Flask route.

    --clean   remove previously staged images first
"""

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
import queries

DEST = Path(__file__).resolve().parent.parent / "ictm-reader" / "public" / "images"


def main() -> int:
    src = config.IMAGES_DIR
    if not src.is_dir():
        print(f"error: image directory not found at {src}")
        print("set PROBLEM_BANK_IMAGES if the bank lives elsewhere.")
        return 1

    if src.resolve() == DEST.resolve():
        print("error: source is the staged public directory; set PROBLEM_BANK_IMAGES to the original bank images")
        return 1

    if "--clean" in sys.argv and DEST.exists():
        shutil.rmtree(DEST)
        print(f"cleaned {DEST}")

    DEST.mkdir(parents=True, exist_ok=True)

    conn = queries.get_connection(config.DB_PATH)
    try:
        allowed = queries.public_image_paths(conn)
        all_conn = queries.get_connection(config.DB_PATH, ("ICTM", "NSML"))
        try:
            private = queries.accessible_image_paths(all_conn) - allowed
        finally:
            all_conn.close()
    finally:
        conn.close()
    # Remove stale files too, so refreshing cannot retain removed material.
    for staged in DEST.rglob("*"):
        if staged.is_file() and staged.relative_to(DEST).as_posix() not in allowed:
            staged.unlink()

    private_dest = config.PRIVATE_IMAGES_DIR
    private_dest.mkdir(parents=True, exist_ok=True)
    for staged in private_dest.rglob("*"):
        if staged.is_file() and staged.relative_to(private_dest).as_posix() not in private:
            staged.unlink()
    for rel in sorted(private):
        source = src / rel
        target = private_dest / rel
        if source.is_file() and source.resolve() != target.resolve():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        elif not target.is_file():
            print(f"error: missing protected diagram: {rel}")
            return 1

    copied = skipped = 0
    total_bytes = 0
    # Recurse and mirror the tree: ICTM diagrams live in images/ictm/, and the
    # served URLs keep that subpath, so flattening here would break them.
    for f in sorted(src.rglob("*")):
        if not f.is_file() or f.relative_to(src).as_posix() not in allowed:
            continue
        target = DEST / f.relative_to(src)
        # Skip files already staged and unchanged, so repeat runs are cheap.
        if target.exists() and target.stat().st_size == f.stat().st_size:
            skipped += 1
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, target)
        copied += 1
        total_bytes += f.stat().st_size

    print(f"staged {copied} new/changed image(s), {skipped} already current")
    print(f"-> {DEST}  ({total_bytes / 1_048_576:.1f} MB copied)")
    print("\nremember: build with IMAGE_BASE_URL=/images for the static copies to be used.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
