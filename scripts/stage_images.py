"""
stage_images.py — Copy the problem bank's diagram images into the frontend's
static directory so the CDN serves them instead of the Python backend.

The images live in the separate (still-ingesting) bank repo and are NOT committed
here — ictm-reader/public/images is gitignored. Run this before a production
build, and set IMAGE_BASE_URL=/images so serialized problems point at the static
copies:

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

DEST = Path(__file__).resolve().parent.parent / "ictm-reader" / "public" / "images"


def main() -> int:
    src = config.IMAGES_DIR
    if not src.is_dir():
        print(f"error: image directory not found at {src}")
        print("set PROBLEM_BANK_IMAGES if the bank lives elsewhere.")
        return 1

    if "--clean" in sys.argv and DEST.exists():
        shutil.rmtree(DEST)
        print(f"cleaned {DEST}")

    DEST.mkdir(parents=True, exist_ok=True)

    copied = skipped = 0
    total_bytes = 0
    # Recurse and mirror the tree: ICTM diagrams live in images/ictm/, and the
    # served URLs keep that subpath, so flattening here would break them.
    for f in sorted(src.rglob("*")):
        if not f.is_file():
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
