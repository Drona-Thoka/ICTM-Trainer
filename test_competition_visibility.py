"""Removed competitions stay inaccessible even when the live bank contains them."""

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import config
import queries
from app import create_app


class CompetitionVisibilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.db = root / "problems.db"
        with sqlite3.connect(self.db) as conn:
            conn.executescript(Path("ictm-reader/src/schema.sql").read_text())
            for comp_id, name in conn.execute("SELECT competition_id, short_name FROM competitions").fetchall():
                filename = f"{name.lower()}/diagram.png"
                image = root / filename
                image.parent.mkdir()
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
        patcher = patch.multiple(config, DB_PATH=self.db, IMAGES_DIR=root)
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


if __name__ == "__main__":
    unittest.main()
