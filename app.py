"""
app.py â€” JSON API for the ICTM-Trainer web app.

Read-only Flask service over the (separate, still-ingesting) problem bank at
../il-math-problem-bank. Serves problems, filters them by
competition/topic/difficulty/event/year, checks submitted answers, and serves
diagram images. Difficulty is normalized to easy/medium/hard (see difficulty.py).

Run:  flask --app app run   (or: python app.py)
"""

from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS

import config
import queries
from serializers import serialize_problem, check_answer

# Stats/accounts are optional: see stats.get_client(), which returns None when
# Supabase isn't configured so the trainer still runs without it.
import stats
from stats import record_attempt, get_summary, set_attempt_correct


def create_app() -> Flask:
    app = Flask(__name__)
    # The frontend is served from a different origin in dev (Vite on :5173).
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    def get_db():
        if "db" not in g:
            g.db = queries.get_connection(config.DB_PATH)
        return g.db

    @app.teardown_appcontext
    def close_db(_exc):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    # ---- Helper to get user ID from Supabase JWT ----
    def get_user_id_from_token():
        """Extract the user ID from the Authorization: Bearer <token> header.

        Returns None when the header is missing/invalid or Supabase isn't
        configured â€” callers treat that as "not authenticated".
        """
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None
        token = auth_header.split(" ")[1]
        try:
            supabase = stats.get_client()
            if supabase is None:
                app.logger.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
                return None
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

    @app.get("/api/years")
    def years():
        """Year range available for a competition â€” drives the year slider."""
        competition = request.args.get("competition")
        if not competition:
            return jsonify(error="Query param 'competition' is required."), 400
        return jsonify(queries.year_bounds(get_db(), competition))

    # ---- Problems -----------------------------------------------------------

    def _filters_from_query():
        return dict(
            competition=request.args.get("competition"),
            topic=request.args.get("topic"),
            difficulty=request.args.get("difficulty"),
            event=request.args.get("event"),
            year=request.args.get("year", type=int),
            year_min=request.args.get("year_min", type=int),
            year_max=request.args.get("year_max", type=int),
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

    @app.post("/api/stats/attempts/<attempt_id>/override")
    def override_attempt(attempt_id):
        """Make the Quizlet-style self-grade override permanent.

        The attempt is recorded with the checker's verdict the moment the answer
        is submitted; if the user then says "I was correct", this amends that row
        so the stored accuracy matches what they see on screen.
        """
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({"error": "Unauthorized"}), 401

        record = set_attempt_correct(user_id, attempt_id)
        if not record:
            return jsonify({"error": "No such attempt for this user."}), 404
        return jsonify(record), 200

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
