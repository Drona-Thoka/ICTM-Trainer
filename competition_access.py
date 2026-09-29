"""Separate, expiring server-verified access cookies for protected competitions."""

import hashlib
import hmac
import os
from urllib.parse import urlsplit

from flask import jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

RESTRICTED = ("ICTM", "NSML")
MAX_AGE = 8 * 60 * 60


def _password(competition):
    return os.environ.get(f"{competition}_ACCESS_PASSWORD", "")


def _signer(competition):
    # Changing a password also invalidates every cookie signed with the old one.
    key = hashlib.sha256(_password(competition).encode()).digest()
    return URLSafeTimedSerializer(key, salt=f"competition-access-v1:{competition}")


def _cookie(competition):
    return f"competition_access_{competition.lower()}"


def unlocked_competitions():
    unlocked = []
    for competition in RESTRICTED:
        if not _password(competition):
            continue
        try:
            value = _signer(competition).loads(request.cookies.get(_cookie(competition), ""), max_age=MAX_AGE)
            if value == competition:
                unlocked.append(competition)
        except (BadSignature, SignatureExpired):
            pass
    return tuple(unlocked)


def install_access(app):
    @app.after_request
    def private_api_responses(response):
        # Personalized questions, solutions, and images must not enter shared caches.
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "private, no-store"
            response.headers["Vercel-CDN-Cache-Control"] = "no-store"
            response.vary.add("Cookie")
        return response

    @app.route("/api/access/<competition>", methods=["GET", "POST", "DELETE"])
    def access(competition):
        if competition not in RESTRICTED:
            return jsonify(error="Not found."), 404
        if request.method == "GET":
            return jsonify(unlocked=competition in unlocked_competitions())
        # These cookie-setting endpoints are used only by the same-origin UI.
        origin = request.headers.get("Origin")
        if origin and origin.rstrip("/") != request.host_url.rstrip("/"):
            return jsonify(error="Forbidden."), 403
        if request.method == "DELETE":
            response = jsonify(unlocked=False)
            response.delete_cookie(_cookie(competition), path="/api", httponly=True, samesite="Strict")
            return response
        configured = _password(competition)
        body = request.get_json(silent=True)
        supplied = body.get("password") if isinstance(body, dict) else None
        if not configured:
            return jsonify(error="Access is not available yet."), 503
        if not isinstance(supplied, str) or len(supplied) > 1024 or not hmac.compare_digest(
            hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(configured.encode()).digest()
        ):
            return jsonify(error="Incorrect password."), 401
        response = jsonify(unlocked=True)
        response.set_cookie(
            _cookie(competition), _signer(competition).dumps(competition),
            max_age=MAX_AGE, path="/api", httponly=True, samesite="Strict",
            secure=request.is_secure or urlsplit(request.host_url).hostname not in {"localhost", "127.0.0.1", "::1"},
        )
        return response
