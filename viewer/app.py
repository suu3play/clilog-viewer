#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
会話ログビューアー Flask アプリケーション (リファクタリング版)
モジュール分割による保守性向上
"""
import sys
from pathlib import Path

from api.database import DatabaseManager
from api.routes_database import init_database_routes
from api.routes_realtime import init_realtime_routes
from api.websocket import init_websocket_handlers, websocket_callback

# モジュールのインポート
from config import AppConfig
from flask import Flask, jsonify, render_template, send_from_directory
from flask_socketio import SocketIO

# リアルタイム機能のインポート
sys.path.append(str(Path(__file__).parent.parent))
try:
    from log_converter import LogDatabase
except ImportError:
    LogDatabase = None

try:
    from realtime_reader import RealtimeManager
except ImportError as e:
    print(f"Warning: realtime_reader.py import failed: {e}")
    RealtimeManager = None

# Flask application initialization
app = Flask(__name__)
app.config["SECRET_KEY"] = "clilog-viewer-secret-key"

# SocketIO initialization
socketio = SocketIO(app, cors_allowed_origins="*")

# Load configuration
config = AppConfig()
DB_PATH = config.get_database_path()

# Database manager initialization
db_manager = DatabaseManager(DB_PATH) if DB_PATH else None

# Realtime manager initialization
realtime_manager = RealtimeManager() if RealtimeManager else None

# WebSocket callback setup
if realtime_manager:
    realtime_manager.add_change_callback(
        lambda file_path, messages: websocket_callback(socketio, file_path, messages)
    )
    realtime_manager.start()
    print("Realtime monitoring started")

# Blueprint registration
if db_manager:
    database_bp = init_database_routes(db_manager)
    app.register_blueprint(database_bp)

if realtime_manager:
    realtime_bp = init_realtime_routes(realtime_manager)
    app.register_blueprint(realtime_bp)

# WebSocket handlers initialization
init_websocket_handlers(socketio, realtime_manager)


@app.route("/")
def index():
    """Main page"""
    return render_template("index.html")


@app.route("/api/config")
def get_config():
    """Get application configuration"""
    try:
        return jsonify(
            {"success": True, "config": {"default_display_mode": config.get_default_display_mode()}}
        )
    except Exception as e:
        return jsonify(
            {"success": False, "error": str(e), "config": {"default_display_mode": "database"}}
        )


@app.route("/static/<path:filename>")
def serve_static(filename):
    """Serve static files"""
    return send_from_directory("static", filename)


@app.errorhandler(404)
def not_found(error):
    """404 error handler"""
    return jsonify({"success": False, "error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    """500 error handler"""
    return jsonify({"success": False, "error": "Internal server error"}), 500


def init_app():
    """Application initialization"""
    if db_manager is None:
        print("Warning: Database initialization failed")
    else:
        print(f"Database path: {db_manager.db_path.absolute()}")

        if db_manager.db_path.exists():
            try:
                stats = db_manager.get_stats()
                print(f"Registered conversations: {stats['total_messages']:,}")
            except Exception as e:
                print(f"Stats retrieval failed: {e}")
        else:
            print("Database file not found. Please run log_converter.py")


if __name__ == "__main__":
    init_app()

    print("CliLog Viewer + Realtime features starting...")
    print("Access http://localhost:5000 in your browser")

    if realtime_manager:
        print("Realtime features: Enabled")
        print(f"Watch directory: {realtime_manager.claude_projects_dir}")
    else:
        print("Realtime features: Disabled (check dependencies)")

    # SocketIO server startup
    try:
        socketio.run(
            app,
            host="0.0.0.0",
            port=5000,
            debug=False,
            use_reloader=False,
            allow_unsafe_werkzeug=True,
        )
    except TypeError as e:
        if "allow_unsafe_werkzeug" in str(e):
            socketio.run(app, host="0.0.0.0", port=5000, debug=False, use_reloader=False)
        else:
            print("SocketIO startup error, using standard Flask server")
            app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)
