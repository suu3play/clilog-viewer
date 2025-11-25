"""
データベース操作管理モジュール
SQLite接続とクエリ実行の抽象化
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .exceptions import ConnectionError as DBConnectionError
from .exceptions import QueryError

# 入力検証とセキュリティ
from .validators import InputValidator


class DatabaseManager:
    """データベース操作マネージャー"""

    def __init__(self, db_path: Union[str, Path], timeout: float = 10.0):
        """
        初期化

        Args:
            db_path: データベースファイルのパス
            timeout: 接続タイムアウト（秒）
        """
        self.db_path = Path(db_path) if isinstance(db_path, str) else db_path
        self.timeout = timeout

    @contextmanager
    def get_connection(self):
        """
        安全なデータベース接続を提供するコンテキストマネージャー

        Yields:
            sqlite3.Connection: データベース接続オブジェクト

        Raises:
            sqlite3.Error: データベース操作エラー
        """
        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=self.timeout)
            conn.row_factory = sqlite3.Row
            yield conn
            conn.commit()
        except sqlite3.Error as e:
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                conn.close()

    def execute_query(
        self, query: str, params: tuple = (), fetch_one: bool = False, fetch_all: bool = False
    ) -> Optional[Union[sqlite3.Row, List[sqlite3.Row], int]]:
        """
        パラメータ化クエリを安全に実行

        Args:
            query: SQLクエリ
            params: クエリパラメータ
            fetch_one: 単一行を取得する場合True
            fetch_all: 全行を取得する場合True

        Returns:
            fetch_one=True: 単一行 または None
            fetch_all=True: 行のリスト
            それ以外: 影響を受けた行数

        Raises:
            sqlite3.Error: クエリ実行エラー
        """
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            if fetch_one:
                return cursor.fetchone()
            if fetch_all:
                return cursor.fetchall()
            return cursor.rowcount

    def get_file_list(self) -> List[Dict[str, Any]]:
        """
        登録済みファイル一覧を取得

        Returns:
            ファイル情報のリスト
        """
        query = """
            SELECT filename,
                   COUNT(*) as message_count,
                   MIN(timestamp) as first_message,
                   MAX(timestamp) as last_message
            FROM conversations
            GROUP BY filename
            ORDER BY MAX(timestamp) DESC
        """
        rows = self.execute_query(query, fetch_all=True)

        files_info = []
        for row in rows:
            files_info.append(
                {
                    "path": row["filename"],
                    "name": row["filename"],
                    "size": 0,
                    "modified": row["last_message"],
                    "is_cached": True,
                    "message_count": row["message_count"],
                }
            )

        return files_info

    def get_messages_by_filename(
        self, filename: str, page: int = 1, per_page: int = 50
    ) -> Dict[str, Any]:
        """
        ファイル名でメッセージを取得（ページング対応）

        Args:
            filename: ファイル名
            page: ページ番号
            per_page: 1ページあたりの件数

        Returns:
            メッセージデータと統計情報
        """
        # 総数を取得
        count_query = """
            SELECT COUNT(*) as total
            FROM conversations
            WHERE filename = ?
        """
        result = self.execute_query(count_query, (filename,), fetch_one=True)
        total = result["total"] if result else 0

        # メッセージを取得
        offset = (page - 1) * per_page
        query = """
            SELECT role, timestamp, content, filename
            FROM conversations
            WHERE filename = ?
            ORDER BY datetime(timestamp)
            LIMIT ? OFFSET ?
        """
        rows = self.execute_query(query, (filename, per_page, offset), fetch_all=True)

        messages = []
        for row in rows:
            messages.append(
                {"role": row["role"], "timestamp": row["timestamp"], "content": row["content"]}
            )

        return {
            "messages": messages,
            "total": total,
            "page": page,
            "per_page": per_page,
            "has_more": (page * per_page) < total,
        }

    def search_messages(
        self, query: str, file_filter: Optional[str] = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        メッセージを全文検索

        Args:
            query: 検索キーワード
            file_filter: ファイル名でフィルタ（省略可）
            limit: 最大取得件数

        Returns:
            検索結果のリスト
        """
        # 入力検証とサニタイズ
        sanitized_query = InputValidator.sanitize_like_pattern(query)
        validated_limit = InputValidator.validate_and_sanitize_limit(limit)

        if file_filter:
            sql_query = """
                SELECT role, timestamp, content, filename
                FROM conversations
                WHERE content LIKE ? ESCAPE '\\' AND filename = ?
                ORDER BY datetime(timestamp) DESC
                LIMIT ?
            """
            params = (f"%{sanitized_query}%", file_filter, validated_limit)
        else:
            sql_query = """
                SELECT role, timestamp, content, filename
                FROM conversations
                WHERE content LIKE ? ESCAPE '\\'
                ORDER BY datetime(timestamp) DESC
                LIMIT ?
            """
            params = (f"%{sanitized_query}%", validated_limit)

        rows = self.execute_query(sql_query, params, fetch_all=True)

        results = []
        for row in rows:
            results.append(
                {
                    "role": row["role"],
                    "timestamp": row["timestamp"],
                    "content": row["content"],
                    "filename": row["filename"],
                }
            )

        return results

    def search_by_date_range(
        self, start_date: str, end_date: str, limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """
        日付範囲でメッセージを検索

        Args:
            start_date: 開始日（YYYY-MM-DD形式）
            end_date: 終了日（YYYY-MM-DD形式）
            limit: 最大取得件数

        Returns:
            検索結果のリスト
        """
        # 入力検証
        validated_limit = InputValidator.validate_and_sanitize_limit(limit)

        query = """
            SELECT role, timestamp, content, filename
            FROM conversations
            WHERE date(timestamp) >= ? AND date(timestamp) <= ?
            ORDER BY datetime(timestamp) DESC
            LIMIT ?
        """
        rows = self.execute_query(query, (start_date, end_date, validated_limit), fetch_all=True)

        results = []
        for row in rows:
            results.append(
                {
                    "role": row["role"],
                    "timestamp": row["timestamp"],
                    "content": row["content"],
                    "filename": row["filename"],
                    "file_name": row["filename"],
                }
            )

        return results

    def get_date_range(self) -> Dict[str, Optional[str]]:
        """
        利用可能な日付範囲を取得

        Returns:
            最小日付と最大日付
        """
        query = """
            SELECT
                MIN(date(timestamp)) as min_date,
                MAX(date(timestamp)) as max_date
            FROM conversations
        """
        result = self.execute_query(query, fetch_one=True)

        if result and result["min_date"] and result["max_date"]:
            return {"min_date": result["min_date"], "max_date": result["max_date"]}
        else:
            return {"min_date": None, "max_date": None}

    def get_stats(self) -> Dict[str, Any]:
        """
        統計情報を取得

        Returns:
            統計情報の辞書
        """
        # デフォルト値
        file_count = 0
        message_count = 0
        recent_files = []

        # メッセージ数を取得
        try:
            result = self.execute_query(
                "SELECT COUNT(*) as message_count FROM conversations", fetch_one=True
            )
            message_count = result["message_count"] if result else 0
        except sqlite3.Error as e:
            print(f"警告: conversationsテーブルからの取得に失敗: {e}")

        # ファイル数を取得
        try:
            result = self.execute_query(
                "SELECT COUNT(*) as file_count FROM log_files", fetch_one=True
            )
            file_count = result["file_count"] if result else 0
        except sqlite3.Error:
            # log_filesテーブルがない場合は代替取得
            try:
                result = self.execute_query(
                    "SELECT COUNT(DISTINCT filename) as file_count FROM conversations",
                    fetch_one=True,
                )
                file_count = result["file_count"] if result else 0
            except sqlite3.Error as e:
                print(f"警告: ファイル数の取得に失敗: {e}")

        # 最新ファイル情報を取得
        try:
            query = """
                SELECT filename, last_modified
                FROM log_files
                ORDER BY last_modified DESC
                LIMIT 10
            """
            rows = self.execute_query(query, fetch_all=True)
            for row in rows:
                recent_files.append(
                    {"filename": row["filename"], "last_modified": row["last_modified"]}
                )
        except sqlite3.Error:
            # 代替取得
            try:
                query = """
                    SELECT filename, MAX(timestamp) as last_modified
                    FROM conversations
                    GROUP BY filename
                    ORDER BY MAX(timestamp) DESC
                    LIMIT 10
                """
                rows = self.execute_query(query, fetch_all=True)
                for row in rows:
                    recent_files.append(
                        {"filename": row["filename"], "last_modified": row["last_modified"]}
                    )
            except sqlite3.Error as e:
                print(f"警告: 最新ファイル情報の取得に失敗: {e}")

        # ファイルサイズを取得
        cache_size_mb = 0
        try:
            cache_size_mb = self.db_path.stat().st_size / (1024 * 1024)
        except (OSError, AttributeError) as e:
            print(f"警告: ファイルサイズの取得に失敗: {e}")

        return {
            "cached_files": file_count,
            "total_messages": message_count,
            "cache_size_mb": round(cache_size_mb, 2),
            "files": recent_files,
        }

    def clear_all_data(self):
        """すべてのデータベースデータを削除"""
        with self.get_connection() as conn:
            conn.execute("DELETE FROM conversations")
            try:
                conn.execute("DELETE FROM log_files")
            except sqlite3.Error:
                # log_filesテーブルが存在しない場合は無視
                pass
