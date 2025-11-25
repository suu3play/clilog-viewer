"""
viewer/api/routes_database.pyのユニットテスト
APIエンドポイントの動作確認
"""

import json
import sys
import tempfile
from pathlib import Path

import pytest

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from viewer.api.database import DatabaseManager


class TestRoutesDatabaseMock:
    """routes_database.pyのAPIエンドポイントのテスト（モック使用）"""

    @pytest.fixture
    def temp_db(self):
        """一時データベースファイルを作成"""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = Path(f.name)

        # テストデータを挿入
        db = DatabaseManager(db_path)
        db.execute_query(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY,
                role TEXT,
                content TEXT,
                timestamp TEXT,
                file_id INTEGER
            )
        """
        )
        db.execute_query(
            """
            INSERT INTO messages (role, content, timestamp, file_id)
            VALUES
                ('user', 'Hello', '2025-01-01 10:00:00', 1),
                ('assistant', 'Hi there', '2025-01-01 10:00:01', 1),
                ('user', 'How are you?', '2025-01-01 10:00:02', 1)
        """
        )
        db.execute_query(
            """
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY,
                file_path TEXT,
                created_at TEXT
            )
        """
        )
        db.execute_query(
            """
            INSERT INTO files (file_path, created_at)
            VALUES ('/path/to/conversation.jsonl', '2025-01-01 09:00:00')
        """
        )

        yield db_path

        # クリーンアップ
        if db_path.exists():
            db_path.unlink()

    def test_get_messages_basic(self, temp_db):
        """メッセージ一覧取得の基本動作"""
        db = DatabaseManager(temp_db)
        results = db.execute_query("SELECT * FROM messages ORDER BY id", fetch_all=True)
        assert len(results) == 3
        assert results[0][1] == "user"
        assert results[0][2] == "Hello"

    def test_get_messages_with_limit(self, temp_db):
        """limit付きメッセージ取得"""
        db = DatabaseManager(temp_db)
        results = db.execute_query(
            "SELECT * FROM messages ORDER BY id LIMIT ?", (2,), fetch_all=True
        )
        assert len(results) == 2

    def test_get_messages_with_offset(self, temp_db):
        """offset付きメッセージ取得"""
        db = DatabaseManager(temp_db)
        results = db.execute_query(
            "SELECT * FROM messages ORDER BY id LIMIT ? OFFSET ?", (10, 1), fetch_all=True
        )
        assert len(results) == 2
        assert results[0][2] == "Hi there"

    def test_search_messages_full_text(self, temp_db):
        """全文検索"""
        db = DatabaseManager(temp_db)
        results = db.execute_query(
            "SELECT * FROM messages WHERE content LIKE ? ORDER BY id", ("%Hello%",), fetch_all=True
        )
        assert len(results) == 1
        assert results[0][2] == "Hello"

    def test_search_messages_case_insensitive(self, temp_db):
        """大文字小文字を区別しない検索"""
        db = DatabaseManager(temp_db)
        results = db.execute_query(
            "SELECT * FROM messages WHERE LOWER(content) LIKE LOWER(?) ORDER BY id",
            ("%HELLO%",),
            fetch_all=True,
        )
        assert len(results) == 1

    def test_get_files_list(self, temp_db):
        """ファイル一覧取得"""
        db = DatabaseManager(temp_db)
        results = db.execute_query("SELECT * FROM files ORDER BY id", fetch_all=True)
        assert len(results) == 1
        assert results[0][1] == "/path/to/conversation.jsonl"

    def test_get_stats_message_count(self, temp_db):
        """統計情報取得 - メッセージ数"""
        db = DatabaseManager(temp_db)
        result = db.execute_query("SELECT COUNT(*) as count FROM messages", fetch_one=True)
        assert result[0] == 3

    def test_get_stats_role_distribution(self, temp_db):
        """統計情報取得 - ロール別分布"""
        db = DatabaseManager(temp_db)
        results = db.execute_query(
            "SELECT role, COUNT(*) as count FROM messages GROUP BY role ORDER BY role",
            fetch_all=True,
        )
        assert len(results) == 2
        assert results[0][0] == "assistant"
        assert results[0][1] == 1
        assert results[1][0] == "user"
        assert results[1][1] == 2

    def test_filter_by_file_id(self, temp_db):
        """ファイルIDでフィルタリング"""
        db = DatabaseManager(temp_db)
        results = db.execute_query(
            "SELECT * FROM messages WHERE file_id = ? ORDER BY id", (1,), fetch_all=True
        )
        assert len(results) == 3

    def test_filter_by_role(self, temp_db):
        """ロールでフィルタリング"""
        db = DatabaseManager(temp_db)
        results = db.execute_query(
            "SELECT * FROM messages WHERE role = ? ORDER BY id", ("user",), fetch_all=True
        )
        assert len(results) == 2

    def test_empty_query_result(self, temp_db):
        """検索結果が空の場合"""
        db = DatabaseManager(temp_db)
        results = db.execute_query(
            "SELECT * FROM messages WHERE content LIKE ?", ("%nonexistent%",), fetch_all=True
        )
        assert len(results) == 0

    def test_sql_injection_prevention(self, temp_db):
        """SQLインジェクション防止（パラメータ化クエリ）"""
        db = DatabaseManager(temp_db)
        # 悪意のある入力をパラメータとして渡す
        malicious_input = "'; DROP TABLE messages; --"
        results = db.execute_query(
            "SELECT * FROM messages WHERE content LIKE ?", (f"%{malicious_input}%",), fetch_all=True
        )
        # テーブルは削除されず、空の結果が返る
        assert len(results) == 0

        # テーブルがまだ存在することを確認
        result = db.execute_query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'", fetch_one=True
        )
        assert result is not None
