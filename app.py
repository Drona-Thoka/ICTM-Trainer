"""
app.py — JSON API for the ICTM-Trainer web app.

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

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
