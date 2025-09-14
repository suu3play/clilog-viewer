#!/usr/bin/env python3
"""
会話ログビューアー Flask アプリケーション
SQLiteデータベース + リアルタイムJSONL読み取り対応
"""
import os
import sys
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit

# 親ディレクトリのlog_converter.pyからクラスをインポート
sys.path.append(str(Path(__file__).parent.parent))
try:
    from log_converter import Config, LogDatabase
except ImportError as e:
    print(f"警告: log_converter.pyの読み込みに失敗しました: {e}")
    Config = None
    LogDatabase = None

# リアルタイム機能のインポート
try:
    from realtime_reader import RealtimeManager
except ImportError as e:
    print(f"警告: realtime_reader.pyの読み込みに失敗しました: {e}")
    RealtimeManager = None

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# 設定
app.config['SECRET_KEY'] = 'clilog-viewer-secret-key'

def get_database_path():
    """データベースファイルのパスを取得"""
    try:
        if Config is None:
            print("警告: Configクラスが利用できません。デフォルトパスを使用します。")
            return Path('../log_data.db')

        # 設定ファイルのパスを解決（viewerディレクトリから見た相対パス）
        config_file = Path(__file__).parent.parent / 'log_converter_config.ini'

        if config_file.exists():
            config = Config(str(config_file))
            output_dir = config.get_output_directory()

            # 相対パスの場合は設定ファイルの場所を基準に解決
            if not output_dir.is_absolute():
                output_dir = config_file.parent / output_dir

            db_path = output_dir / 'log_data.db'
            print(f"データベースパス: {db_path}")
            return db_path.resolve()
        else:
            print(f"警告: 設定ファイルが見つかりません: {config_file}")
            return Path('../log_data.db')

    except Exception as e:
        print(f"エラー: 設定ファイルの読み込みに失敗しました: {e}")
        print("デフォルトデータベースパス '../log_data.db' を使用します。")
        return Path('../log_data.db')

# データベースパスを動的に取得
DB_PATH = get_database_path()

# グローバルデータベースインスタンス
database = LogDatabase(str(DB_PATH)) if LogDatabase else None

# リアルタイムマネージャー初期化
realtime_manager = RealtimeManager() if RealtimeManager else None

def websocket_callback(file_path: str, messages):
    """ファイル変更時のWebSocket通知"""
    try:
        socketio.emit('file_update', {
            'file_path': file_path,
            'messages': messages,
            'timestamp': messages[-1]['timestamp'] if messages else None
        })
    except Exception as e:
        print(f"WebSocket通知エラー: {e}")

# リアルタイム監視開始
if realtime_manager:
    realtime_manager.add_change_callback(websocket_callback)
    realtime_manager.start()
    print("リアルタイム監視を開始しました")


@app.route('/')
def index():
    """メイン画面"""
    return render_template('index.html')


@app.route('/api/files')
def get_files():
    """利用可能ファイル一覧を取得（データベースから）"""
    try:
        if database is None:
            return jsonify({
                'success': False,
                'error': 'データベースが利用できません'
            }), 500

        # データベースから登録済みファイル一覧を取得
        with database.db_path.open() as _:  # データベースファイルの存在確認
            pass

        import sqlite3
        files_info = []
        with sqlite3.connect(database.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # conversationsテーブルから直接ファイル一覧と件数を取得
            cursor = conn.execute('''
                SELECT filename,
                       COUNT(*) as message_count,
                       MIN(timestamp) as first_message,
                       MAX(timestamp) as last_message
                FROM conversations
                GROUP BY filename
                ORDER BY MAX(timestamp) DESC
            ''')

            for row in cursor.fetchall():
                files_info.append({
                    'path': row['filename'],
                    'name': row['filename'],
                    'size': 0,  # ファイルサイズは不要
                    'modified': row['last_message'],  # 最新メッセージ日時を使用
                    'is_cached': True,  # データベースに登録済み
                    'message_count': row['message_count']
                })

        return jsonify({
            'success': True,
            'files': files_info,
            'total': len(files_info)
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/messages/<path:filename>')
def get_messages(filename):
    """メッセージデータを取得（データベースから）"""
    try:
        if database is None:
            return jsonify({
                'success': False,
                'error': 'データベースが利用できません'
            }), 500

        # ページネーション対応
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)

        import sqlite3
        with sqlite3.connect(database.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # 総数を取得
            cursor = conn.execute('''
                SELECT COUNT(*) as total
                FROM conversations
                WHERE filename = ?
            ''', (filename,))
            total = cursor.fetchone()['total']

            # ページネーション適用してメッセージを取得
            offset = (page - 1) * per_page
            cursor = conn.execute('''
                SELECT role, timestamp, content, filename
                FROM conversations
                WHERE filename = ?
                ORDER BY datetime(timestamp)
                LIMIT ? OFFSET ?
            ''', (filename, per_page, offset))

            messages = []
            for row in cursor.fetchall():
                messages.append({
                    'role': row['role'],
                    'timestamp': row['timestamp'],
                    'content': row['content']
                })

        return jsonify({
            'success': True,
            'messages': messages,
            'total': total,
            'page': page,
            'per_page': per_page,
            'has_more': (page * per_page) < total
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/search')
def search_messages():
    """高速全文検索（データベースから）"""
    try:
        if database is None:
            return jsonify({
                'success': False,
                'error': 'データベースが利用できません'
            }), 500

        query = request.args.get('q', '').strip()
        file_filter = request.args.get('file')
        limit = request.args.get('limit', 100, type=int)

        if not query:
            return jsonify({
                'success': False,
                'error': 'クエリが空です'
            })

        # データベースから検索実行
        import sqlite3
        results = []
        with sqlite3.connect(database.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # ファイルフィルター適用
            if file_filter:
                cursor = conn.execute('''
                    SELECT role, timestamp, content, filename
                    FROM conversations
                    WHERE content LIKE ? AND filename = ?
                    ORDER BY datetime(timestamp) DESC
                    LIMIT ?
                ''', (f'%{query}%', file_filter, limit))
            else:
                cursor = conn.execute('''
                    SELECT role, timestamp, content, filename
                    FROM conversations
                    WHERE content LIKE ?
                    ORDER BY datetime(timestamp) DESC
                    LIMIT ?
                ''', (f'%{query}%', limit))

            for row in cursor.fetchall():
                results.append({
                    'role': row['role'],
                    'timestamp': row['timestamp'],
                    'content': row['content'],
                    'filename': row['filename']
                })

        return jsonify({
            'success': True,
            'results': results,
            'query': query,
            'total': len(results)
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/search/date-range')
def search_messages_by_date_range():
    """日付範囲による検索（データベースから）"""
    try:
        if database is None:
            return jsonify({
                'success': False,
                'error': 'データベースが利用できません'
            }), 500

        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        limit = request.args.get('limit', 1000, type=int)


        if not start_date or not end_date:
            return jsonify({
                'success': False,
                'error': '開始日と終了日の両方を指定してください'
            })

        # 日付フォーマット検証（YYYY-MM-DD形式）
        from datetime import datetime
        try:
            datetime.strptime(start_date, '%Y-%m-%d')
            datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError:
            return jsonify({
                'success': False,
                'error': '日付形式はYYYY-MM-DD形式で入力してください'
            })

        # データベースから日付範囲検索実行
        import sqlite3
        results = []
        with sqlite3.connect(database.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # 日付範囲でフィルタリング（タイムスタンプの日付部分を比較）
            cursor = conn.execute('''
                SELECT role, timestamp, content, filename
                FROM conversations
                WHERE date(timestamp) >= ? AND date(timestamp) <= ?
                ORDER BY datetime(timestamp) DESC
                LIMIT ?
            ''', (start_date, end_date, limit))

            for row in cursor.fetchall():
                results.append({
                    'role': row['role'],
                    'timestamp': row['timestamp'],
                    'content': row['content'],
                    'filename': row['filename'],
                    'file_name': row['filename']
                })

        return jsonify({
            'success': True,
            'results': results,
            'start_date': start_date,
            'end_date': end_date,
            'total': len(results)
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/cache/build', methods=['POST'])
def build_cache():
    """ログファイルの再処理（log_converter.pyを呼び出し）"""
    try:
        # log_converter.pyを実行して最新データを取得
        import subprocess
        import sys

        log_converter_path = Path(__file__).parent.parent / 'log_converter.py'

        if not log_converter_path.exists():
            return jsonify({
                'success': False,
                'error': 'log_converter.pyが見つかりません'
            }), 500

        # log_converter.pyを実行（強制更新）
        result = subprocess.run([
            sys.executable, str(log_converter_path), '--force'
        ], capture_output=True, text=True, cwd=log_converter_path.parent)

        if result.returncode == 0:
            return jsonify({
                'success': True,
                'message': 'ログファイルの再処理が完了しました',
                'output': result.stdout
            })
        else:
            return jsonify({
                'success': False,
                'error': f'ログファイル処理でエラーが発生しました: {result.stderr}'
            }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """データベースクリア"""
    try:
        if database is None:
            return jsonify({
                'success': False,
                'error': 'データベースが利用できません'
            }), 500

        # データベースをクリア
        import sqlite3
        with sqlite3.connect(database.db_path) as conn:
            conn.execute('DELETE FROM conversations')
            conn.execute('DELETE FROM log_files')

        return jsonify({
            'success': True,
            'message': 'すべてのデータベースデータを削除しました'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/date-range')
def get_date_range():
    """利用可能な日付範囲を取得"""
    try:
        if database is None:
            return jsonify({
                'success': False,
                'error': 'データベースが利用できません'
            }), 500

        import sqlite3
        with sqlite3.connect(database.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # 最初と最後の会話日時を取得
            cursor = conn.execute('''
                SELECT
                    MIN(date(timestamp)) as min_date,
                    MAX(date(timestamp)) as max_date
                FROM conversations
            ''')
            result = cursor.fetchone()

            if result and result['min_date'] and result['max_date']:
                return jsonify({
                    'success': True,
                    'min_date': result['min_date'],
                    'max_date': result['max_date']
                })
            else:
                return jsonify({
                    'success': True,
                    'min_date': None,
                    'max_date': None
                })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/stats')
def get_stats():
    """統計情報を取得（データベースから）"""
    try:
        if database is None:
            return jsonify({
                'success': False,
                'error': 'データベースが利用できません'
            }), 500

        import sqlite3
        with sqlite3.connect(database.db_path) as conn:
            conn.row_factory = sqlite3.Row

            # ファイル数を取得
            cursor = conn.execute('SELECT COUNT(*) as file_count FROM log_files')
            file_count = cursor.fetchone()['file_count']

            # メッセージ数を取得
            cursor = conn.execute('SELECT COUNT(*) as message_count FROM conversations')
            message_count = cursor.fetchone()['message_count']

            # 最新ファイル情報を取得（シンプル版）
            cursor = conn.execute('''
                SELECT filename, last_modified
                FROM log_files
                ORDER BY last_modified DESC
                LIMIT 10
            ''')
            recent_files = []
            for row in cursor.fetchall():
                recent_files.append({
                    'filename': row['filename'],
                    'last_modified': row['last_modified']
                })

        stats = {
            'cached_files': file_count,
            'total_messages': message_count,
            'cache_size_mb': database.db_path.stat().st_size / (1024 * 1024) if database.db_path.exists() else 0,
            'files': recent_files
        }

        return jsonify({
            'success': True,
            'stats': stats
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# 静的ファイル配信
@app.route('/static/<path:filename>')
def serve_static(filename):
    """静的ファイル配信"""
    return send_from_directory('static', filename)


@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'エンドポイントが見つかりません'
    }), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'サーバーエラーが発生しました'
    }), 500


# ===== リアルタイム機能用エンドポイント =====

@app.route('/api/realtime/files')
def get_realtime_files():
    """リアルタイム読み取り用JSONLファイル一覧を取得"""
    try:
        if realtime_manager is None:
            return jsonify({
                'success': False,
                'error': 'リアルタイム機能が利用できません'
            }), 500

        files = realtime_manager.get_available_files()
        
        # 相対パス表示用に調整
        for file in files:
            try:
                relative_path = str(Path(file['path']).relative_to(Path.home()))
                file['display_path'] = relative_path
            except ValueError:
                file['display_path'] = file['path']

        return jsonify({
            'success': True,
            'files': files,
            'total': len(files),
            'mode': 'realtime'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/realtime/messages/<path:file_name>')
def get_realtime_messages(file_name):
    """リアルタイムJSONLファイルからメッセージを取得"""
    try:
        if realtime_manager is None:
            return jsonify({
                'success': False,
                'error': 'リアルタイム機能が利用できません'
            }), 500

        # ファイルパスの特定
        available_files = realtime_manager.get_available_files()
        target_file = None
        
        for file in available_files:
            if file['name'] == file_name or file['path'].endswith(file_name):
                target_file = file
                break
        
        if not target_file:
            return jsonify({
                'success': False,
                'error': f'ファイルが見つかりません: {file_name}'
            }), 404

        # パラメータ取得
        limit = request.args.get('limit', 50, type=int)
        latest_only = request.args.get('latest_only', 'true').lower() == 'true'

        # メッセージ読み取り
        messages = realtime_manager.read_file_messages(
            target_file['path'], 
            limit=limit, 
            latest_only=latest_only
        )

        return jsonify({
            'success': True,
            'messages': messages,
            'file_info': target_file,
            'total': len(messages),
            'mode': 'realtime'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/realtime/latest')
def get_latest_realtime_file():
    """最新のJSONLファイルとそのメッセージを取得"""
    try:
        if realtime_manager is None:
            return jsonify({
                'success': False,
                'error': 'リアルタイム機能が利用できません'
            }), 500

        latest_file = realtime_manager.get_latest_file()
        if not latest_file:
            return jsonify({
                'success': False,
                'error': 'JSONLファイルが見つかりません'
            }), 404

        # 最新メッセージを取得
        limit = request.args.get('limit', 30, type=int)
        messages = realtime_manager.read_file_messages(
            latest_file['path'], 
            limit=limit, 
            latest_only=True
        )

        return jsonify({
            'success': True,
            'file_info': latest_file,
            'messages': messages,
            'total': len(messages),
            'mode': 'realtime'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ===== WebSocket エンドポイント =====

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


def init_app():
    """アプリケーション初期化"""
    # データベース初期化確認
    if database is None:
        print("警告: データベースの初期化に失敗しました")
    else:
        print(f"データベースパス: {database.db_path.absolute()}")

        # データベース存在確認
        if database.db_path.exists():
            import sqlite3
            with sqlite3.connect(database.db_path) as conn:
                cursor = conn.execute('SELECT COUNT(*) FROM conversations')
                count = cursor.fetchone()[0]
                print(f"登録済み会話データ: {count:,}件")
        else:
            print("データベースファイルが見つかりません。log_converter.pyを実行してください。")


if __name__ == '__main__':
    init_app()

    # 開発用サーバー起動
    print("CliLog Viewer + リアルタイム機能 開始中...")
    print("ブラウザで http://localhost:5000 にアクセスしてください")
    
    if realtime_manager:
        print("リアルタイム機能: 有効")
        print(f"監視ディレクトリ: {realtime_manager.claude_projects_dir}")
    else:
        print("リアルタイム機能: 無効 (依存関係を確認してください)")

    # SocketIO対応サーバー起動
    try:
        # 新しいバージョンの場合
        socketio.run(
            app,
            host='0.0.0.0',
            port=5000,
            debug=False,
            use_reloader=False,
            allow_unsafe_werkzeug=True
        )
    except TypeError as e:
        if 'allow_unsafe_werkzeug' in str(e):
            # 古いバージョンの場合
            socketio.run(
                app,
                host='0.0.0.0',
                port=5000,
                debug=False,
                use_reloader=False
            )
        else:
            # 通常のFlaskサーバーとして起動
            print("SocketIO起動エラー、通常のFlaskサーバーで起動します")
            app.run(
                host='0.0.0.0',
                port=5000,
                debug=False,
                use_reloader=False
            )