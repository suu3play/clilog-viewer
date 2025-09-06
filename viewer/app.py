#!/usr/bin/env python3
"""
会話ログビューアー Flask アプリケーション
SQLiteデータベースからの会話データ表示
"""
import os
import sys
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory

# 親ディレクトリのlog_converter.pyからクラスをインポート
sys.path.append(str(Path(__file__).parent.parent))
try:
    from log_converter import Config, LogDatabase
except ImportError as e:
    print(f"警告: log_converter.pyの読み込みに失敗しました: {e}")
    Config = None
    LogDatabase = None

app = Flask(__name__)

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
    print("CliLog Viewer 開始中...")
    print("ブラウザで http://localhost:5000 にアクセスしてください")

    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        threaded=True
    )