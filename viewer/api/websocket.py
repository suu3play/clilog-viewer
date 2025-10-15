"""
WebSocket処理モジュール
リアルタイム更新通知とイベント処理
"""
from flask import request
from flask_socketio import emit


def websocket_callback(socketio, file_path: str, messages):
    """
    ファイル変更時のWebSocket通知コールバック

    Args:
        socketio: SocketIOインスタンス
        file_path: 変更されたファイルのパス
        messages: 新しいメッセージのリスト
    """
    try:
        socketio.emit('file_update', {
            'file_path': file_path,
            'messages': messages,
            'timestamp': messages[-1]['timestamp'] if messages else None
        })
    except Exception as e:
        print(f"WebSocket通知エラー: {e}")


def init_websocket_handlers(socketio, realtime_manager):
    """
    WebSocketイベントハンドラーを初期化

    Args:
        socketio: SocketIOインスタンス
        realtime_manager: RealtimeManagerインスタンス
    """

    @socketio.on('connect')
    def handle_connect():
        """WebSocket接続時の処理"""
        print(f"WebSocketクライアント接続: {request.sid}")
        emit('connected', {'status': 'リアルタイム機能が有効です'})

    @socketio.on('disconnect')
    def handle_disconnect():
        """WebSocket切断時の処理"""
        print(f"WebSocketクライアント切断: {request.sid}")

    @socketio.on('subscribe_file')
    def handle_subscribe_file(data):
        """特定ファイルの更新通知を購読"""
        try:
            file_path = data.get('file_path')
            print(f"ファイル購読: {file_path} (client: {request.sid})")

            # TODO: ファイル別購読管理を実装
            emit('subscribed', {'file_path': file_path, 'status': '購読開始'})

        except Exception as e:
            emit('error', {'message': str(e)})

    @socketio.on('request_latest')
    def handle_request_latest():
        """最新データのリクエスト"""
        try:
            if realtime_manager:
                latest_file = realtime_manager.get_latest_file()
                if latest_file:
                    messages = realtime_manager.read_file_messages(
                        latest_file['path'],
                        limit=10,
                        latest_only=True
                    )
                    emit('latest_data', {
                        'file_info': latest_file,
                        'messages': messages
                    })
                else:
                    emit('latest_data', {'messages': []})
            else:
                emit('error', {'message': 'リアルタイム機能が無効です'})

        except Exception as e:
            emit('error', {'message': str(e)})
