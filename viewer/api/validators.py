"""
入力値の検証とサニタイズモジュール
セキュリティ強化のための入力検証レイヤー
"""
from datetime import datetime
from typing import Optional, Tuple


class ValidationError(Exception):
    """入力検証エラー"""
    pass


class InputValidator:
    """入力値の検証とサニタイズクラス"""

    # 定数定義
    MAX_LIMIT = 5000
    MAX_QUERY_LENGTH = 1000
    MAX_FILENAME_LENGTH = 500
    DATE_FORMAT = '%Y-%m-%d'

    @staticmethod
    def validate_and_sanitize_limit(
        limit: int,
        max_limit: int = MAX_LIMIT
    ) -> int:
        """
        limitパラメータの検証と制限

        Args:
            limit: 取得件数の上限
            max_limit: 最大許容値

        Returns:
            検証済みのlimit値（max_limitで制限）

        Raises:
            ValidationError: limitが不正な値の場合
        """
        if not isinstance(limit, int):
            raise ValidationError("limitは整数である必要があります")

        if limit <= 0:
            raise ValidationError("limitは正の整数である必要があります")

        # 最大値で制限
        return min(limit, max_limit)

    @staticmethod
    def validate_date(date_str: str) -> Tuple[bool, Optional[str]]:
        """
        日付形式の検証（YYYY-MM-DD）

        Args:
            date_str: 検証する日付文字列

        Returns:
            (検証結果, エラーメッセージ)
            成功時: (True, None)
            失敗時: (False, エラーメッセージ)
        """
        if not date_str:
            return False, "日付が指定されていません"

        try:
            datetime.strptime(date_str, InputValidator.DATE_FORMAT)
            return True, None
        except ValueError:
            return False, "日付形式はYYYY-MM-DD形式である必要があります"

    @staticmethod
    def sanitize_like_pattern(query: str) -> str:
        """
        LIKE検索クエリのサニタイズ（特殊文字のエスケープ）

        SQLiteのLIKE句で使用される特殊文字（%、_、\）をエスケープして、
        リテラル文字として扱われるようにします。

        Args:
            query: 検索クエリ文字列

        Returns:
            エスケープ済みのクエリ文字列

        Raises:
            ValidationError: クエリが長すぎる場合
        """
        if not query:
            return ""

        # 長さチェック
        if len(query) > InputValidator.MAX_QUERY_LENGTH:
            raise ValidationError(
                f"検索クエリは{InputValidator.MAX_QUERY_LENGTH}文字以内にしてください"
            )

        # LIKE特殊文字をエスケープ（バックスラッシュを先にエスケープ）
        sanitized = query.replace('\\', '\\\\')  # \ → \\
        sanitized = sanitized.replace('%', '\\%')  # % → \%
        sanitized = sanitized.replace('_', '\\_')  # _ → \_

        return sanitized

    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """
        ファイル名のサニタイズ（パストラバーサル対策）

        Args:
            filename: ファイル名

        Returns:
            サニタイズ済みのファイル名

        Raises:
            ValidationError: ファイル名が不正な場合
        """
        if not filename:
            raise ValidationError("ファイル名が指定されていません")

        # 長さチェック
        if len(filename) > InputValidator.MAX_FILENAME_LENGTH:
            raise ValidationError(
                f"ファイル名は{InputValidator.MAX_FILENAME_LENGTH}文字以内にしてください"
            )

        # パストラバーサル文字列を除去
        sanitized = filename.replace('..', '').replace('\\', '/').strip()

        if not sanitized:
            raise ValidationError("無効なファイル名です")

        return sanitized

    @staticmethod
    def validate_page(page: int) -> int:
        """
        ページ番号の検証

        Args:
            page: ページ番号

        Returns:
            検証済みのページ番号

        Raises:
            ValidationError: ページ番号が不正な場合
        """
        if not isinstance(page, int):
            raise ValidationError("ページ番号は整数である必要があります")

        if page < 1:
            raise ValidationError("ページ番号は1以上である必要があります")

        return page

    @staticmethod
    def validate_per_page(per_page: int, max_per_page: int = 1000) -> int:
        """
        1ページあたりの件数の検証

        Args:
            per_page: 1ページあたりの件数
            max_per_page: 最大許容値

        Returns:
            検証済みの1ページあたりの件数

        Raises:
            ValidationError: per_pageが不正な値の場合
        """
        if not isinstance(per_page, int):
            raise ValidationError("1ページあたりの件数は整数である必要があります")

        if per_page <= 0:
            raise ValidationError("1ページあたりの件数は正の整数である必要があります")

        # 最大値で制限
        return min(per_page, max_per_page)
