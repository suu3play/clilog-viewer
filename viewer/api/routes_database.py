"""
データベース関連APIエンドポイント
ファイル一覧、メッセージ取得、検索、統計情報など
"""
import sys
import subprocess
from pathlib import Path
from datetime import datetime
from flask import Blueprint, request, jsonify
from .database import DatabaseManager

# Blueprintの作成
database_bp = Blueprint('database', __name__, url_prefix='/api')


def init_database_routes(db_manager: DatabaseManager):
    """
    データベース関連ルートを初期化

    Args:
        db_manager: DatabaseManagerインスタンス

    Returns:
        初期化されたBlueprint
    """

    @database_bp.route('/files')
    def get_files():
        """利用可能ファイル一覧を取得"""
        try:
            if not db_manager.db_path.exists():
                return jsonify({
                    'success': False,
                    'error': 'データベースが見つかりません'
                }), 404

            files_info = db_manager.get_file_list()

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

    @database_bp.route('/messages/<path:filename>')
    def get_messages(filename):
        """メッセージデータを取得（ページング対応）"""
        try:
            # ページネーションパラメータ
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 50, type=int)

            result = db_manager.get_messages_by_filename(filename, page, per_page)

            return jsonify({
                'success': True,
                **result
            })

        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @database_bp.route('/search')
    def search_messages():
        """高速全文検索"""
        try:
            query = request.args.get('q', '').strip()
            file_filter = request.args.get('file')
            limit = request.args.get('limit', 100, type=int)

            if not query:
                return jsonify({
                    'success': False,
                    'error': 'クエリが空です'
                })

            results = db_manager.search_messages(query, file_filter, limit)

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

    @database_bp.route('/search/date-range')
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

            # 日付フォーマット検証
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
            except ValueError:
                return jsonify({
                    'success': False,
                    'error': '日付形式はYYYY-MM-DD形式で入力してください'
                })

            results = db_manager.search_by_date_range(start_date, end_date, limit)

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

    @database_bp.route('/date-range')
    def get_date_range():
        """利用可能な日付範囲を取得"""
        try:
            if not db_manager.db_path.exists():
                return jsonify({
                    'success': False,
                    'error': 'データベースが見つかりません'
                }), 404

            date_range = db_manager.get_date_range()

            return jsonify({
                'success': True,
                **date_range
            })

        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @database_bp.route('/stats')
    def get_stats():
        """統計情報を取得"""
        try:
            if not db_manager.db_path.exists():
                print(f"エラー: データベースファイルが存在しません: {db_manager.db_path}")
                return jsonify({
                    'success': False,
                    'error': 'データベースファイルが存在しません'
                }), 500

            stats = db_manager.get_stats()

            print(f"統計情報取得成功: ファイル数={stats['cached_files']}, "
                  f"メッセージ数={stats['total_messages']}, "
                  f"キャッシュサイズ={stats['cache_size_mb']:.2f}MB")

            return jsonify({
                'success': True,
                'stats': stats
            })

        except Exception as e:
            print(f"統計情報取得で予期しないエラー: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': f'統計情報の取得に失敗しました: {str(e)}'
            }), 500

    @database_bp.route('/cache/build', methods=['POST'])
    def build_cache():
        """ログファイルの再処理（log_converter.pyを呼び出し）"""
        try:
            log_converter_path = Path(__file__).parent.parent.parent / 'log_converter.py'

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

    @database_bp.route('/cache/clear', methods=['POST'])
    def clear_cache():
        """データベースクリア"""
        try:
            db_manager.clear_all_data()

            return jsonify({
                'success': True,
                'message': 'すべてのデータベースデータを削除しました'
            })

        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    return database_bp
