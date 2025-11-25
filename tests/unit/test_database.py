"""
viewer/api/database.pyのユニットテスト
"""

import sqlite3
import sys
import tempfile
from pathlib import Path

import pytest

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from viewer.api.database import DatabaseManager
from viewer.api.exceptions import ConnectionError as DBConnectionError


class TestDatabaseManager:
    """DatabaseManagerクラスのテスト"""

    @pytest.fixture
    def temp_db(self):
        """一時データベースファイルを作成"""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = Path(f.name)

        yield db_path

        # クリーンアップ
        if db_path.exists():
            db_path.unlink()

    @pytest.fixture
    def db_manager(self, temp_db):
        """DatabaseManagerインスタンスを作成"""
        return DatabaseManager(temp_db)

    def test_init_with_string_path(self, temp_db):
        """文字列パスでの初期化テスト"""
        db = DatabaseManager(str(temp_db))
        assert db.db_path == temp_db
        assert db.timeout == 10.0

    def test_init_with_path_object(self, temp_db):
        """Pathオブジェクトでの初期化テスト"""
        db = DatabaseManager(temp_db)
        assert db.db_path == temp_db

    def test_init_with_custom_timeout(self, temp_db):
        """カスタムタイムアウトでの初期化テスト"""
        db = DatabaseManager(temp_db, timeout=5.0)
        assert db.timeout == 5.0

    def test_get_connection_success(self, db_manager):
        """接続の取得成功テスト"""
        with db_manager.get_connection() as conn:
            assert isinstance(conn, sqlite3.Connection)
            assert conn.row_factory == sqlite3.Row

    def test_get_connection_commits_on_success(self, db_manager):
        """正常終了時にコミットされることを確認"""
        # テーブル作成
        with db_manager.get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE test_table (
                    id INTEGER PRIMARY KEY,
                    value TEXT
                )
            """
            )

        # データが永続化されているか確認
        with db_manager.get_connection() as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'"
            )
            result = cursor.fetchone()
            assert result is not None
            assert result["name"] == "test_table"

    def test_get_connection_rollback_on_error(self, db_manager):
        """エラー時にロールバックされることを確認"""
        # テーブル作成
        with db_manager.get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE test_table (
                    id INTEGER PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """
            )

        # エラーを発生させる（NOT NULL制約違反）
        try:
            with db_manager.get_connection() as conn:
                conn.execute("INSERT INTO test_table (id) VALUES (1)")
                raise Exception("Test error")
        except Exception:
            pass

        # データが挿入されていないことを確認
        with db_manager.get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) as count FROM test_table")
            result = cursor.fetchone()
            assert result["count"] == 0

    def test_execute_query_insert(self, db_manager):
        """INSERTクエリのテスト"""
        # テーブル作成
        db_manager.execute_query(
            """
            CREATE TABLE test_table (
                id INTEGER PRIMARY KEY,
                value TEXT
            )
        """
        )

        # データ挿入
        result = db_manager.execute_query(
            "INSERT INTO test_table (value) VALUES (?)", ("test_value",)
        )

        assert result is not None  # 影響を受けた行数が返される

    def test_execute_query_fetch_one(self, db_manager):
        """fetch_one=Trueのテスト"""
        # テーブル作成とデータ挿入
        db_manager.execute_query(
            """
            CREATE TABLE test_table (
                id INTEGER PRIMARY KEY,
                value TEXT
            )
        """
        )
        db_manager.execute_query("INSERT INTO test_table (value) VALUES (?)", ("test_value",))

        # 単一行取得
        result = db_manager.execute_query(
            "SELECT * FROM test_table WHERE id = ?", (1,), fetch_one=True
        )

        assert result is not None
        assert result["id"] == 1
        assert result["value"] == "test_value"

    def test_execute_query_fetch_all(self, db_manager):
        """fetch_all=Trueのテスト"""
        # テーブル作成とデータ挿入
        db_manager.execute_query(
            """
            CREATE TABLE test_table (
                id INTEGER PRIMARY KEY,
                value TEXT
            )
        """
        )
        db_manager.execute_query("INSERT INTO test_table (value) VALUES (?)", ("value1",))
        db_manager.execute_query("INSERT INTO test_table (value) VALUES (?)", ("value2",))
        db_manager.execute_query("INSERT INTO test_table (value) VALUES (?)", ("value3",))

        # 全行取得
        results = db_manager.execute_query("SELECT * FROM test_table ORDER BY id", fetch_all=True)

        assert isinstance(results, list)
        assert len(results) == 3
        assert results[0]["value"] == "value1"
        assert results[1]["value"] == "value2"
        assert results[2]["value"] == "value3"

    def test_execute_query_with_parameters(self, db_manager):
        """パラメータ化クエリのテスト"""
        db_manager.execute_query(
            """
            CREATE TABLE test_table (
                id INTEGER PRIMARY KEY,
                name TEXT,
                age INTEGER
            )
        """
        )

        # パラメータ付きINSERT
        db_manager.execute_query("INSERT INTO test_table (name, age) VALUES (?, ?)", ("Alice", 30))

        # パラメータ付きSELECT
        result = db_manager.execute_query(
            "SELECT * FROM test_table WHERE name = ?", ("Alice",), fetch_one=True
        )

        assert result is not None
        assert result["name"] == "Alice"
        assert result["age"] == 30

    def test_execute_query_returns_none_when_no_data(self, db_manager):
        """データが存在しない場合のテスト"""
        db_manager.execute_query(
            """
            CREATE TABLE test_table (
                id INTEGER PRIMARY KEY,
                value TEXT
            )
        """
        )

        # 存在しないデータを検索
        result = db_manager.execute_query(
            "SELECT * FROM test_table WHERE id = ?", (999,), fetch_one=True
        )

        assert result is None

    def test_execute_query_empty_list_when_no_data(self, db_manager):
        """fetch_all=Trueでデータが存在しない場合のテスト"""
        db_manager.execute_query(
            """
            CREATE TABLE test_table (
                id INTEGER PRIMARY KEY,
                value TEXT
            )
        """
        )

        # 空のテーブルから全行取得
        results = db_manager.execute_query("SELECT * FROM test_table", fetch_all=True)

        assert isinstance(results, list)
        assert len(results) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
