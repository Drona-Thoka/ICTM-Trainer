"""
app.py — JSON API for the ICTM-Trainer web app.

Read-only Flask service over the (separate, still-ingesting) problem bank at
../il-math-problem-bank. Serves problems, filters them by
competition/topic/difficulty/event/year, checks submitted answers, and serves
diagram images. Difficulty is normalized to easy/medium/hard (see difficulty.py).

Run:  flask --app app run   (or: python app.py)
"""

import os
import sqlite3

from flask import Flask, g, jsonify, request, send_from_directory, session
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

import config
import queries
from serializers import serialize_problem, check_answer

# ---- New imports for stats ----
import jwt as pyjwt
from supabase import create_client
from stats import record_attempt, get_summary


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    # The frontend is served from a different origin in dev (Vite on :5173).
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    def get_db():
        if "db" not in g:
            g.db = queries.get_connection(config.DB_PATH)
        return g.db

    def get_auth_db():
        if "auth_db" not in g:
            conn = sqlite3.connect(str(config.AUTH_DB_PATH), check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL
                )
                """
            )
            conn.commit()
            g.auth_db = conn
        return g.auth_db

    @app.teardown_appcontext
    def close_db(_exc):
        db = g.pop("db", None)
        if db is not None:
            db.close()

        auth_db = g.pop("auth_db", None)
        if auth_db is not None:
            auth_db.close()

    # ---- Helper to get user ID from Supabase JWT ----
def get_user_id_from_token():
    """Extract the user ID from the Authorization: Bearer <token> header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    try:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            app.logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
            return None
        supabase = create_client(url, key)
        response = supabase.auth.get_user(token)
        if response.user:
            return response.user.id
        return None
    except Exception as e:
        app.logger.debug(f"JWT verification failed: {e}")
        return None
        
    # ---- Meta ---------------------------------------------------------------

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", problems=queries.count_approved(get_db()))

    @app.post("/api/auth/signup")
    def signup():
        payload = request.get_json(silent=True) or {}
        username = (payload.get("username") or "").strip()
        password = payload.get("password") or ""

        if not username or not password:
            return jsonify(error="username and password are required."), 400

        conn = get_auth_db()
        existing = conn.execute(
            "SELECT 1 FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if existing is not None:
            return jsonify(error="username already exists."), 409

        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        conn.commit()
        session["username"] = username
        return jsonify(username=username), 201

    @app.post("/api/auth/login")
    def login():
        payload = request.get_json(silent=True) or {}
        username = (payload.get("username") or "").strip()
        password = payload.get("password") or ""

        if not username or not password:
            return jsonify(error="username and password are required."), 400

        conn = get_auth_db()
        row = conn.execute(
            "SELECT password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if row is None or not check_password_hash(row["password_hash"], password):
            return jsonify(error="invalid credentials."), 401

        session["username"] = username
        return jsonify(ok=True, username=username), 200

    @app.get("/api/auth/me")
    def me():
        username = session.get("username")
        if not username:
            return jsonify(error="not authenticated."), 401
        return jsonify(username=username), 200

    @app.get("/api/competitions")
    def competitions():
        rows = queries.list_competitions(get_db())
        return jsonify([dict(r) for r in rows])

    @app.get("/api/topics")
    def topics():
        return jsonify(queries.list_topics(get_db()))

    @app.get("/api/events")
    def events():
        competition = request.args.get("competition")
        if not competition:
            return jsonify(error="Query param 'competition' is required."), 400
        return jsonify(queries.list_events(get_db(), competition))

    # ---- Problems -----------------------------------------------------------

    def _filters_from_query():
        year = request.args.get("year", type=int)
        return dict(
            competition=request.args.get("competition"),
            topic=request.args.get("topic"),
            difficulty=request.args.get("difficulty"),
            event=request.args.get("event"),
            year=year,
        )

    @app.get("/api/problems/random")
    def random_problem():
        conn = get_db()
        try:
            row = queries.get_random_problem(conn, **_filters_from_query())
        except ValueError as e:  # bad difficulty tier
            return jsonify(error=str(e)), 400
        if row is None:
            return jsonify(error="No problem matches those filters."), 404
        return jsonify(serialize_problem(conn, row))

    @app.get("/api/problems/<int:problem_id>")
    def problem(problem_id):
        conn = get_db()
        row = queries.get_problem_by_id(conn, problem_id)
        if row is None:
            return jsonify(error=f"No approved problem with id {problem_id}."), 404
        return jsonify(serialize_problem(conn, row))

    @app.get("/api/problems/<int:problem_id>/solution")
    def solution(problem_id):
        conn = get_db()
        row = queries.get_problem_by_id(conn, problem_id)
        if row is None:
            return jsonify(error=f"No approved problem with id {problem_id}."), 404
        return jsonify(answer=row["answer"], solution_text=row["solution_text"])

    @app.post("/api/problems/<int:problem_id>/check")
    def check(problem_id):
        conn = get_db()
        row = queries.get_problem_by_id(conn, problem_id)
        if row is None:
            return jsonify(error=f"No approved problem with id {problem_id}."), 404

        body = request.get_json(silent=True) or {}
        submitted = body.get("answer")
        if submitted is None:
            return jsonify(error="Request body must include an 'answer' field."), 400

        return jsonify(
            correct=check_answer(row, submitted),
            correct_answer=row["answer"],
            solution_text=row["solution_text"],
        )

    # ---- Images -------------------------------------------------------------

    @app.get("/api/images/<path:filename>")
    def image(filename):
        # send_from_directory rejects path-traversal attempts.
        return send_from_directory(config.IMAGES_DIR, filename)

    # ---- User Stats ---------------------------------------------------------

    @app.post("/api/stats/record")
    def record_stats():
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        body = request.get_json(silent=True) or {}
        required = ["problem_id", "competition", "topic", "difficulty", "correct"]
        for field in required:
            if field not in body:
                return jsonify({"error": f"Missing field: {field}"}), 400

        if body["difficulty"] not in ("easy", "medium", "hard"):
            return jsonify({"error": "Invalid difficulty"}), 400

        record = record_attempt(
            user_id=user_id,
            problem_id=body["problem_id"],
            competition=body["competition"],
            topic=body["topic"],
            difficulty=body["difficulty"],
            correct=body["correct"],
            time_taken=body.get("time_taken"),
        )
        return jsonify(record), 201

    @app.get("/api/stats/summary")
    def stats_summary():
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        summary = get_summary(user_id)
        return jsonify(summary), 200

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)