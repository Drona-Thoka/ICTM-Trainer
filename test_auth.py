import os
import tempfile
import unittest

import config
from app import create_app


class AuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "auth.db")
        config.AUTH_DB_PATH = self.db_path
        self.app = create_app()
        self.app.config.update(TESTING=True)
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_signup_and_login(self) -> None:
        signup = self.client.post(
            "/api/auth/signup",
            json={"username": "alice", "password": "secret123"},
        )
        self.assertEqual(signup.status_code, 201)
        self.assertEqual(signup.get_json()["username"], "alice")

        login = self.client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "secret123"},
        )
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.get_json()["ok"])

        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.get_json()["username"], "alice")

        bad_login = self.client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "wrong"},
        )
        self.assertEqual(bad_login.status_code, 401)


if __name__ == "__main__":
    unittest.main()
