#!/usr/bin/env python3
"""
高速チャットビューアー Flask アプリケーション
SQLiteキャッシュによる高速化を実装
"""
import os
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
from message_cache import MessageCache, load_chat_messages, build_initial_cache

app = Flask(__name__)

# 設定
app.config['SECRET_KEY'] = 'claude-log-viewer-secret-key'
LOGS_DIR = Path('../')  # claude-logディレクトリ（相対パス）

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
        for file_path in sorted(md_files, key=lambda x: x.stat().st_mtime, reverse=True):
            stat = file_path.stat()
            
            # キャッシュ状況確認
            file_id = cache.is_cached_and_valid(file_path)
            is_cached = file_id is not None
            
            files_info.append({
                'path': str(file_path.relative_to(LOGS_DIR)),
                'name': file_path.name,
                'size': stat.st_size,
                'modified': int(stat.st_mtime),
                'is_cached': is_cached
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