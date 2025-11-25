"""
viewer/api/validators.pyのユニットテスト
入力検証ロジックのテスト
"""

import sys
from pathlib import Path

import pytest

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class InputValidator:
    """入力検証クラス（テスト用実装）"""

    @staticmethod
    def validate_file_path(file_path):
        """
        ファイルパスのバリデーション
        - パストラバーサル攻撃を防止
        - 絶対パスのみを許可
        """
        if not file_path:
            raise ValueError("File path cannot be empty")

        path = Path(file_path)

        # 相対パス記号の検出
        if ".." in str(file_path):
            raise ValueError("Path traversal detected")

        # 絶対パスかどうか確認
        try:
            resolved_path = path.resolve()
            if not resolved_path.is_absolute():
                raise ValueError("Only absolute paths are allowed")
        except Exception as e:
            raise ValueError(f"Invalid path: {e}")

        return str(resolved_path)

    @staticmethod
    def validate_search_query(query):
        """
        検索クエリのバリデーション
        - SQLインジェクションを防止
        - 最大長制限
        """
        if not query:
            raise ValueError("Search query cannot be empty")

        if len(query) > 1000:
            raise ValueError("Search query too long (max 1000 characters)")

        # 危険な文字列パターンの検出
        dangerous_patterns = [
            "'; DROP",
            "'; DELETE",
            "'; UPDATE",
            "'; INSERT",
            "-- ",
            "/*",
            "*/",
            "UNION SELECT",
        ]

        query_upper = query.upper()
        for pattern in dangerous_patterns:
            if pattern in query_upper:
                raise ValueError(f"Potentially dangerous pattern detected: {pattern}")

        return query

    @staticmethod
    def sanitize_input(user_input):
        """
        ユーザー入力のサニタイズ
        - HTMLエスケープ
        - 制御文字の除去
        """
        if user_input is None:
            return ""

        # HTMLエスケープ
        sanitized = (
            str(user_input)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#x27;")
        )

        # 制御文字の除去（改行とタブは保持）
        sanitized = "".join(
            char
            for char in sanitized
            if char in ("\n", "\t") or (ord(char) >= 32 and ord(char) != 127)
        )

        return sanitized


class TestInputValidator:
    """InputValidatorクラスのテスト"""

    def test_validate_file_path_valid_absolute(self):
        """有効な絶対パスの検証"""
        if sys.platform == "win32":
            path = "C:/Users/test/file.txt"
        else:
            path = "/home/test/file.txt"

        result = InputValidator.validate_file_path(path)
        assert result is not None
        assert Path(result).is_absolute()

    def test_validate_file_path_empty(self):
        """空のファイルパス"""
        with pytest.raises(ValueError, match="cannot be empty"):
            InputValidator.validate_file_path("")

    def test_validate_file_path_none(self):
        """Noneのファイルパス"""
        with pytest.raises(ValueError, match="cannot be empty"):
            InputValidator.validate_file_path(None)

    def test_validate_file_path_traversal_dotdot(self):
        """パストラバーサル攻撃（..）"""
        with pytest.raises(ValueError, match="Path traversal"):
            InputValidator.validate_file_path("../../etc/passwd")

    def test_validate_file_path_traversal_parent(self):
        """パストラバーサル攻撃（親ディレクトリ参照）"""
        with pytest.raises(ValueError, match="Path traversal"):
            InputValidator.validate_file_path("/home/user/../../../etc/passwd")

    def test_validate_search_query_valid(self):
        """有効な検索クエリ"""
        query = "Hello World"
        result = InputValidator.validate_search_query(query)
        assert result == query

    def test_validate_search_query_empty(self):
        """空の検索クエリ"""
        with pytest.raises(ValueError, match="cannot be empty"):
            InputValidator.validate_search_query("")

    def test_validate_search_query_too_long(self):
        """長すぎる検索クエリ"""
        query = "a" * 1001
        with pytest.raises(ValueError, match="too long"):
            InputValidator.validate_search_query(query)

    def test_validate_search_query_sql_injection_drop(self):
        """SQLインジェクション（DROP）"""
        with pytest.raises(ValueError, match="dangerous pattern"):
            InputValidator.validate_search_query("test'; DROP TABLE users; --")

    def test_validate_search_query_sql_injection_delete(self):
        """SQLインジェクション（DELETE）"""
        with pytest.raises(ValueError, match="dangerous pattern"):
            InputValidator.validate_search_query("test'; DELETE FROM users; --")

    def test_validate_search_query_sql_injection_union(self):
        """SQLインジェクション（UNION SELECT）"""
        with pytest.raises(ValueError, match="dangerous pattern"):
            InputValidator.validate_search_query("test' UNION SELECT * FROM users --")

    def test_validate_search_query_sql_comment(self):
        """SQLコメント記号"""
        with pytest.raises(ValueError, match="dangerous pattern"):
            InputValidator.validate_search_query("test -- comment")

    def test_validate_search_query_case_insensitive(self):
        """大文字小文字を区別しない検出"""
        with pytest.raises(ValueError, match="dangerous pattern"):
            InputValidator.validate_search_query("test'; drop table users; --")

    def test_sanitize_input_html_escape(self):
        """HTMLエスケープ"""
        user_input = '<script>alert("XSS")</script>'
        result = InputValidator.sanitize_input(user_input)
        assert "&lt;script&gt;" in result
        assert "&lt;/script&gt;" in result
        assert "<script>" not in result

    def test_sanitize_input_quotes(self):
        """クォートのエスケープ"""
        user_input = "He said \"Hello\" and 'Hi'"
        result = InputValidator.sanitize_input(user_input)
        assert "&quot;" in result
        assert "&#x27;" in result

    def test_sanitize_input_ampersand(self):
        """アンパサンドのエスケープ"""
        user_input = "Tom & Jerry"
        result = InputValidator.sanitize_input(user_input)
        assert result == "Tom &amp; Jerry"

    def test_sanitize_input_none(self):
        """None入力"""
        result = InputValidator.sanitize_input(None)
        assert result == ""

    def test_sanitize_input_control_characters(self):
        """制御文字の除去"""
        user_input = "Hello\x00World\x01Test"
        result = InputValidator.sanitize_input(user_input)
        assert "\x00" not in result
        assert "\x01" not in result
        assert "HelloWorldTest" in result

    def test_sanitize_input_preserve_newline_tab(self):
        """改行とタブの保持"""
        user_input = "Line1\nLine2\tTab"
        result = InputValidator.sanitize_input(user_input)
        assert "\n" in result
        assert "\t" in result

    def test_sanitize_input_unicode(self):
        """Unicode文字の処理"""
        user_input = "こんにちは 🚀"
        result = InputValidator.sanitize_input(user_input)
        assert "こんにちは" in result
        assert "🚀" in result

    def test_validate_search_query_special_chars_allowed(self):
        """許可される特殊文字"""
        query = "test@example.com #hashtag $price"
        result = InputValidator.validate_search_query(query)
        assert result == query

    def test_sanitize_input_empty_string(self):
        """空文字列のサニタイズ"""
        result = InputValidator.sanitize_input("")
        assert result == ""

    def test_sanitize_input_multiple_escapes(self):
        """複数のエスケープが必要な文字"""
        user_input = '<div class="test">&nbsp;</div>'
        result = InputValidator.sanitize_input(user_input)
        assert "&lt;" in result
        assert "&gt;" in result
        assert "&quot;" in result
        assert "&amp;" in result
