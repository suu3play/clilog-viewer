#!/usr/bin/env python3
"""
高速チャットビューアー Flask アプリケーション
SQLiteキャッシュによる高速化を実装
"""
import os
import sys
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
from message_cache import MessageCache, load_chat_messages, build_initial_cache

# 親ディレクトリのlog_converter.pyからConfigクラスをインポート
sys.path.append(str(Path(__file__).parent.parent))
try:
    from log_converter import Config
except ImportError as e:
    print(f"警告: 設定ファイルの読み込みに失敗しました: {e}")
    Config = None

app = Flask(__name__)

# 設定
app.config['SECRET_KEY'] = 'claude-log-viewer-secret-key'

def get_logs_directory():
    """設定ファイルからログディレクトリを取得"""
    try:
        if Config is None:
            print("警告: Configクラスが利用できません。デフォルトパスを使用します。")
            return Path('../')
        
        # 設定ファイルのパスを解決（viewerディレクトリから見た相対パス）
        config_file = Path(__file__).parent.parent / 'log_converter_config.ini'
        
        if not config_file.exists():
            print(f"警告: 設定ファイルが見つかりません: {config_file}")
            return Path('../')
        
        config = Config(str(config_file))
        output_dir = config.get_output_directory()
        
        # 相対パスの場合は設定ファイルの場所を基準に解決
        if not output_dir.is_absolute():
            output_dir = config_file.parent / output_dir
        
        print(f"設定ファイルから読み込んだログディレクトリ: {output_dir}")
        return output_dir.resolve()
        
    except Exception as e:
        print(f"エラー: 設定ファイルの読み込みに失敗しました: {e}")
        print("デフォルトパス '../' を使用します。")
        return Path('../')

# ログディレクトリを動的に取得
LOGS_DIR = get_logs_directory()

# グローバルキャッシュインスタンス
cache = MessageCache()


@app.route('/')
def index():
    """メイン画面"""
    return render_template('index.html')


@app.route('/api/files')
def get_files():
    """利用可能ファイル一覧を取得"""
    try:
        # Markdownファイルを検索
        md_files = []
        for pattern in ['log_*.md']:
            md_files.extend(LOGS_DIR.glob(pattern))
        
        files_info = []
        for file_path in md_files:
            stat = file_path.stat()
            
            # キャッシュ状況確認
            file_id = cache.is_cached_and_valid(file_path)
            is_cached = file_id is not None
            
            # 最後のメッセージの日時を取得
            last_message_time = None
            try:
                messages = load_chat_messages(file_path)
                if messages:
                    # 最後のメッセージのタイムスタンプを取得
                    last_message = messages[-1]
                    if 'timestamp' in last_message:
                        from datetime import datetime
                        if isinstance(last_message['timestamp'], str):
                            # ISO形式またはJST形式の文字列をパース
                            timestamp_str = last_message['timestamp'].replace(' JST', '')
                            try:
                                # ISO形式を試す
                                dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                                last_message_time = int(dt.timestamp())
                            except:
                                # JST形式を試す（例: 2024-03-31 14:28:15）
                                try:
                                    dt = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                                    last_message_time = int(dt.timestamp())
                                except:
                                    # パースに失敗した場合はファイルの更新時刻を使用
                                    last_message_time = int(stat.st_mtime)
                        else:
                            last_message_time = int(last_message['timestamp'])
                    else:
                        last_message_time = int(stat.st_mtime)
                else:
                    last_message_time = int(stat.st_mtime)
            except Exception as e:
                print(f"ファイル {file_path.name} の最終メッセージ日時取得エラー: {e}")
                last_message_time = int(stat.st_mtime)
            
            files_info.append({
                'path': str(file_path.relative_to(LOGS_DIR)),
                'name': file_path.name,
                'size': stat.st_size,
                'modified': last_message_time,  # 最終メッセージ時刻を使用
                'is_cached': is_cached
            })
        
        # 最終メッセージ時刻順でソート
        files_info.sort(key=lambda x: x['modified'], reverse=True)
        
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
    """メッセージデータを取得（高速キャッシュ対応）"""
    try:
        file_path = LOGS_DIR / filename
        
        if not file_path.exists():
            return jsonify({
                'success': False,
                'error': 'ファイルが見つかりません'
            }), 404
        
        # 高速読み込み（キャッシュ優先）
        messages = load_chat_messages(file_path)
        
        # ページネーション対応
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        
        return jsonify({
            'success': True,
            'messages': messages[start_idx:end_idx],
            'total': len(messages),
            'page': page,
            'per_page': per_page,
            'has_more': end_idx < len(messages)
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/search')
def search_messages():
    """高速全文検索（FTS5使用）"""
    try:
        query = request.args.get('q', '').strip()
        file_filter = request.args.get('file')
        limit = request.args.get('limit', 100, type=int)
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'クエリが空です'
            })
        
        # ファイルフィルター処理
        file_ids = None
        if file_filter:
            file_path = LOGS_DIR / file_filter
            file_id = cache.is_cached_and_valid(file_path)
            if file_id:
                file_ids = [file_id]
        
        # FTS5による高速検索
        results = cache.search_messages(query, file_ids, limit)
        
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
    """日付範囲による検索"""
    try:
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
        
        # 日付範囲検索実行
        results = cache.search_messages_by_date_range(start_date, end_date, limit)
        
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
    """全ファイルのキャッシュを作成"""
    try:
        # バックグラウンドでキャッシュ作成
        md_files = list(LOGS_DIR.glob("log_*.md"))
        
        processed = 0
        for file_path in md_files:
            if not cache.is_cached_and_valid(file_path):
                messages = load_chat_messages(file_path)
                processed += 1
        
        return jsonify({
            'success': True,
            'message': f'{processed}件のファイルをキャッシュしました',
            'total_files': len(md_files),
            'processed': processed
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """キャッシュクリア"""
    try:
        filename = request.json.get('file') if request.is_json else None
        
        if filename:
            file_path = LOGS_DIR / filename
            cache.clear_cache(file_path)
            message = f'{filename}のキャッシュを削除しました'
        else:
            cache.clear_cache()
            message = 'すべてのキャッシュを削除しました'
        
        return jsonify({
            'success': True,
            'message': message
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/stats')
def get_stats():
    """統計情報を取得"""
    try:
        cached_files = cache.get_cached_files()
        
        stats = {
            'cached_files': len(cached_files),
            'total_messages': sum(f['message_count'] for f in cached_files),
            'cache_size_mb': cache.db_path.stat().st_size / (1024 * 1024) if cache.db_path.exists() else 0,
            'files': cached_files[:10]  # 最新10件
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
    # キャッシュディレクトリ作成
    cache_dir = Path('cache')
    cache_dir.mkdir(exist_ok=True)
    
    # ログディレクトリ確認
    if not LOGS_DIR.exists():
        print(f"警告: ログディレクトリが見つかりません: {LOGS_DIR}")
    
    print(f"ログディレクトリ: {LOGS_DIR.absolute()}")
    print(f"キャッシュディレクトリ: {cache_dir.absolute()}")


if __name__ == '__main__':
    init_app()
    
    # 開発用サーバー起動
    print("Claude Log Viewer 開始中...")
    print("ブラウザで http://localhost:5000 にアクセスしてください")
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        threaded=True
    )