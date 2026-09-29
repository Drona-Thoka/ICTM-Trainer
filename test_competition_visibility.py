"""Protected competitions require server-verified access, including direct URLs."""

import os
import importlib.util
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import config
import queries
from app import create_app
from competition_access import MAX_AGE, _signer


class CompetitionVisibilityTests(unittest.TestCase):
    def setUp(self):
        passwords = patch.dict(os.environ, {"ICTM_ACCESS_PASSWORD": "test-ictm-secret", "NSML_ACCESS_PASSWORD": "test-nsml-secret"})
        passwords.start()
        self.addCleanup(passwords.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.db = root / "problems.db"
        with sqlite3.connect(self.db) as conn:
            conn.executescript(Path("ictm-reader/src/schema.sql").read_text())
            for comp_id, name in conn.execute("SELECT competition_id, short_name FROM competitions").fetchall():
                filename = f"{name.lower()}/diagram.png"
                image = root / ("private" if name in {"ICTM", "NSML"} else "public") / filename
                image.parent.mkdir(parents=True)
                image.write_bytes(b"diagram")
                conn.execute("""
                    INSERT INTO problems
                    (problem_id, competition_id, problem_text, answer, image_path,
                     comp_year, comp_difficulty, review_status)
                    VALUES (?, ?, '1 + 1', '2', ?, 2025, 'Easy', 'approved')
                """, (comp_id, comp_id, f"images/{filename}"))
                conn.execute("INSERT INTO problem_topics VALUES (?, 1)", (comp_id,))
        queries._cache.clear()
        self.addCleanup(queries._cache.clear)
        patcher = patch.multiple(config, DB_PATH=self.db, IMAGES_DIR=root / "public", PRIVATE_IMAGES_DIR=root / "private")
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = create_app().test_client()

    def test_removed_content_and_direct_urls(self):
        for problem_id, comp in [(1, "ICTM"), (2, "NSML")]:
            for suffix in ["", "/solution"]:
                self.assertEqual(self.client.get(f"/api/problems/{problem_id}{suffix}").status_code, 404)
            self.assertEqual(self.client.post(f"/api/problems/{problem_id}/check", json={"answer": "2"}).status_code, 404)
            self.assertEqual(self.client.get(f"/api/problems/random?competition={comp}").status_code, 404)
            self.assertEqual(self.client.get(f"/api/images/{comp.lower()}/diagram.png").status_code, 404)
            self.assertEqual(self.client.get(f"/api/topics?competition={comp}").get_json(), [])

    def test_available_content_still_works(self):
        for problem_id, comp in [(3, "AMC10"), (4, "AMC12"), (5, "AIME")]:
            self.assertEqual(self.client.get(f"/api/problems/random?competition={comp}").status_code, 200)
            self.assertEqual(self.client.get(f"/api/problems/{problem_id}/solution").status_code, 200)
            self.assertEqual(self.client.post(f"/api/problems/{problem_id}/check", json={"answer": "2"}).status_code, 200)
            self.assertEqual(self.client.get(f"/api/images/{comp.lower()}/diagram.png", buffered=True).status_code, 200)

    def test_unfiltered_queries_exclude_removed_competitions(self):
        offered = {c["short_name"] for c in self.client.get("/api/competitions").get_json()}
        self.assertFalse(offered & {"ICTM", "NSML"})
        self.assertEqual(self.client.get("/api/health").get_json()["problems"], 4)
        self.assertEqual(self.client.get("/api/topics").get_json()[0]["count"], 4)
        conn = queries.get_connection(self.db)
        self.addCleanup(conn.close)
        where, params, _ = queries._build_filters(None, None, None)
        ids = {row[0] for row in conn.execute(
            f"SELECT p.problem_id FROM problems p JOIN competitions c USING (competition_id) WHERE {where}", params
        )}
        self.assertEqual(ids, {3, 4, 5, 6})

    def unlock(self, competition="ICTM", password="test-ictm-secret"):
        return self.client.post(f"/api/access/{competition}", json={"password": password})

    def test_password_required_and_unconfigured_fails_closed(self):
        for supplied in ["", "wrong", None, 42]:
            self.assertEqual(self.unlock(password=supplied).status_code, 401)
        self.unlock()
        with patch.dict(os.environ, {"ICTM_ACCESS_PASSWORD": ""}):
            self.assertEqual(self.unlock().status_code, 503)
            self.assertEqual(self.client.get("/api/problems/1").status_code, 404)
            self.assertFalse(self.client.get("/api/access/ICTM").get_json()["unlocked"])
        self.assertEqual(self.client.post("/api/access/ICTM", json=[]).status_code, 401)
        self.assertEqual(self.client.post("/api/access/ICTM", json={"password": "test-ictm-secret"}, headers={"Origin": "https://other.example"}).status_code, 403)

    def test_unlock_is_separate_and_lock_revokes(self):
        response = self.unlock()
        self.assertEqual(response.status_code, 200)
        self.assertIn("HttpOnly", response.headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", response.headers["Set-Cookie"])
        for suffix in ["", "/solution"]:
            self.assertEqual(self.client.get(f"/api/problems/1{suffix}").status_code, 200)
        self.assertEqual(self.client.post("/api/problems/1/check", json={"answer": "2"}).status_code, 200)
        self.assertEqual(self.client.get("/api/images/ictm/diagram.png", buffered=True).status_code, 200)
        self.assertEqual(self.client.get("/api/problems/2").status_code, 404)
        self.assertEqual(self.unlock("NSML", "test-ictm-secret").status_code, 401)
        self.assertEqual(self.unlock("NSML", "test-nsml-secret").status_code, 200)
        self.assertEqual(self.client.get("/api/problems/2").status_code, 200)
        self.assertEqual(self.client.delete("/api/access/ICTM").status_code, 200)
        self.assertEqual(self.client.get("/api/problems/1").status_code, 404)
        self.assertEqual(self.client.get("/api/problems/2").status_code, 200)

    def test_staging_separates_private_diagrams(self):
        root = Path(self.temp.name)
        bank = root / "bank-images"
        shutil.copytree(root / "public", bank)
        shutil.copytree(root / "private", bank, dirs_exist_ok=True)
        static = root / "static"
        shutil.copytree(bank, static)  # Simulate stale protected files from an older build.
        spec = importlib.util.spec_from_file_location("stage_images", "scripts/stage_images.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with patch.object(module, "DEST", static), patch.object(config, "IMAGES_DIR", bank):
            self.assertEqual(module.main(), 0)
        for comp in ["ictm", "nsml"]:
            self.assertFalse((static / comp / "diagram.png").exists())
            self.assertTrue((root / "private" / comp / "diagram.png").exists())
        self.assertTrue((static / "amc10" / "diagram.png").exists())

    def test_production_cookie_is_secure(self):
        response = self.client.post("/api/access/ICTM", json={"password": "test-ictm-secret"}, base_url="https://trainer.example")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Secure", response.headers["Set-Cookie"])

    def test_rotation_expiry_and_forgery(self):
        self.unlock()
        with patch.dict(os.environ, {"ICTM_ACCESS_PASSWORD": "changed"}):
            self.assertEqual(self.client.get("/api/problems/1").status_code, 404)
        import time
        with patch("itsdangerous.timed.time.time", return_value=time.time() - MAX_AGE - 5):
            expired = _signer("ICTM").dumps("ICTM")
        for token in [expired, "forged", _signer("NSML").dumps("NSML")]:
            self.client.set_cookie("competition_access_ictm", token, path="/api")
            self.assertEqual(self.client.get("/api/problems/1").status_code, 404)

    def test_cache_does_not_share_access_and_private_urls_ignore_cdn(self):
        self.unlock()
        self.assertTrue(self.client.get("/api/topics?competition=ICTM").get_json())
        self.assertEqual(self.client.get("/api/problems/random?competition=ICTM").status_code, 200)
        with patch.object(config, "IMAGE_BASE_URL", "/images"):
            response = self.client.get("/api/problems/1")
            self.assertEqual(response.get_json()["image_url"], "/api/images/ictm/diagram.png")
            self.assertEqual(response.headers["Cache-Control"], "private, no-store")
        anonymous = create_app().test_client()
        self.assertEqual(anonymous.get("/api/topics?competition=ICTM").get_json(), [])
        self.assertEqual(anonymous.get("/api/problems/random?competition=ICTM").status_code, 404)
        for _ in range(10):
            self.assertNotIn(anonymous.get("/api/problems/random").get_json()["competition"], {"ICTM", "NSML"})


if __name__ == "__main__":
    unittest.main()
