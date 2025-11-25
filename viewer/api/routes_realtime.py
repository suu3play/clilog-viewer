"""
リアルタイム関連APIエンドポイント
JSONLファイルの直接読み取りとポーリング機能
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request

# Blueprintの作成
realtime_bp = Blueprint("realtime", __name__, url_prefix="/api")


def init_realtime_routes(realtime_manager):
    """
    リアルタイム関連ルートを初期化

    Args:
        realtime_manager: RealtimeManagerインスタンス

    Returns:
        初期化されたBlueprint
    """

    @realtime_bp.route("/realtime/files")
    def get_realtime_files():
        """リアルタイム読み取り用JSONLファイル一覧を取得"""
        try:
            if realtime_manager is None:
                return jsonify({"success": False, "error": "リアルタイム機能が利用できません"}), 500

            files = realtime_manager.get_available_files()

            # 相対パス表示用に調整
            for file in files:
                try:
                    relative_path = str(Path(file["path"]).relative_to(Path.home()))
                    file["display_path"] = relative_path
                except ValueError:
                    file["display_path"] = file["path"]

            return jsonify(
                {"success": True, "files": files, "total": len(files), "mode": "realtime"}
            )

        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    @realtime_bp.route("/realtime/messages/<path:file_name>")
    def get_realtime_messages(file_name):
        """リアルタイムJSONLファイルからメッセージを取得"""
        try:
            if realtime_manager is None:
                return jsonify({"success": False, "error": "リアルタイム機能が利用できません"}), 500

            # ファイルパスの特定
            available_files = realtime_manager.get_available_files()
            target_file = None

            for file in available_files:
                if file["name"] == file_name or file["path"].endswith(file_name):
                    target_file = file
                    break

            if not target_file:
                return (
                    jsonify({"success": False, "error": f"ファイルが見つかりません: {file_name}"}),
                    404,
                )

            # パラメータ取得
            limit = request.args.get("limit", 50, type=int)
            latest_only = request.args.get("latest_only", "true").lower() == "true"

            # メッセージ読み取り
            messages = realtime_manager.read_file_messages(
                target_file["path"], limit=limit, latest_only=latest_only
            )

            return jsonify(
                {
                    "success": True,
                    "messages": messages,
                    "file_info": target_file,
                    "total": len(messages),
                    "mode": "realtime",
                }
            )

        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    @realtime_bp.route("/realtime/latest")
    def get_latest_realtime_file():
        """最新のJSONLファイルとそのメッセージを取得"""
        try:
            if realtime_manager is None:
                return jsonify({"success": False, "error": "リアルタイム機能が利用できません"}), 500

            latest_file = realtime_manager.get_latest_file()
            if not latest_file:
                return jsonify({"success": False, "error": "JSONLファイルが見つかりません"}), 404

            # 全メッセージを取得（limitなし）
            messages = realtime_manager.read_file_messages(
                latest_file["path"], limit=None, latest_only=False  # 全件取得  # 全ログを取得
            )

            return jsonify(
                {
                    "success": True,
                    "file_info": latest_file,
                    "messages": messages,
                    "total": len(messages),
                    "mode": "realtime",
                }
            )

        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    @realtime_bp.route("/polling/status")
    def get_polling_status():
        """ポーリング機能のステータス確認"""
        try:
            if realtime_manager is None:
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": "リアルタイム機能が利用できません",
                            "polling_available": False,
                        }
                    ),
                    500,
                )

            files = realtime_manager.get_available_files()
            latest_file = realtime_manager.get_latest_file()

            return jsonify(
                {
                    "success": True,
                    "polling_available": True,
                    "files_count": len(files),
                    "latest_file": latest_file["name"] if latest_file else None,
                    "watch_directory": str(realtime_manager.claude_projects_dir),
                }
            )

        except Exception as e:
            return jsonify({"success": False, "error": str(e), "polling_available": False}), 500

    @realtime_bp.route("/polling/latest")
    def get_polling_latest():
        """ポーリング用：最新ファイルの最新メッセージを取得"""
        try:
            if realtime_manager is None:
                return jsonify({"success": False, "error": "リアルタイム機能が利用できません"}), 500

            # リクエストパラメータ
            limit = request.args.get("limit", 20, type=int)
            since_timestamp = request.args.get("since")

            latest_file = realtime_manager.get_latest_file()
            if not latest_file:
                return jsonify(
                    {"success": True, "messages": [], "file_info": None, "has_updates": False}
                )

            # メッセージ取得
            messages = realtime_manager.read_file_messages(
                latest_file["path"], limit=limit, latest_only=True
            )

            # since_timestampでフィルタリング
            has_updates = False
            if since_timestamp and messages:
                try:
                    since_dt = datetime.fromisoformat(since_timestamp.replace("Z", "+00:00"))
                    jst = timezone(timedelta(hours=9))
                    since_jst = since_dt.astimezone(jst)
                    since_str = since_jst.strftime("%Y-%m-%d %H:%M:%S")

                    new_messages = []
                    for msg in messages:
                        if msg["timestamp"] > since_str:
                            new_messages.append(msg)
                            has_updates = True

                    messages = new_messages if has_updates else []

                except (ValueError, AttributeError):
                    has_updates = len(messages) > 0
            else:
                has_updates = len(messages) > 0

            return jsonify(
                {
                    "success": True,
                    "messages": messages,
                    "file_info": latest_file,
                    "has_updates": has_updates,
                    "total": len(messages),
                    "limit": limit,
                    "since_timestamp": since_timestamp,
                }
            )

        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    @realtime_bp.route("/polling/file/<path:file_name>")
    def get_polling_file_messages(file_name):
        """ポーリング用：指定ファイルの最新メッセージを取得"""
        try:
            if realtime_manager is None:
                return jsonify({"success": False, "error": "リアルタイム機能が利用できません"}), 500

            # リクエストパラメータ
            limit = request.args.get("limit", 20, type=int)
            since_timestamp = request.args.get("since")

            # ファイル存在確認
            files = realtime_manager.get_available_files()
            target_file = None
            for file_info in files:
                if file_info["name"] == file_name:
                    target_file = file_info
                    break

            if not target_file:
                return (
                    jsonify({"success": False, "error": f"ファイルが見つかりません: {file_name}"}),
                    404,
                )

            # メッセージ取得
            messages = realtime_manager.read_file_messages(
                target_file["path"], limit=limit, latest_only=True
            )

            # since_timestampでフィルタリング
            has_updates = False
            if since_timestamp and messages:
                try:
                    since_dt = datetime.fromisoformat(since_timestamp.replace("Z", "+00:00"))
                    jst = timezone(timedelta(hours=9))
                    since_jst = since_dt.astimezone(jst)
                    since_str = since_jst.strftime("%Y-%m-%d %H:%M:%S")

                    new_messages = []
                    for msg in messages:
                        if msg["timestamp"] > since_str:
                            new_messages.append(msg)
                            has_updates = True

                    messages = new_messages if has_updates else []

                except (ValueError, AttributeError):
                    has_updates = len(messages) > 0
            else:
                has_updates = len(messages) > 0

            return jsonify(
                {
                    "success": True,
                    "messages": messages,
                    "file_info": target_file,
                    "has_updates": has_updates,
                    "total": len(messages),
                    "limit": limit,
                    "since_timestamp": since_timestamp,
                }
            )

        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    return realtime_bp
