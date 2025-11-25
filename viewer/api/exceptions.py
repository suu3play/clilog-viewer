"""
カスタム例外クラスモジュール
データベース操作とAPI処理のエラーハンドリングを統一
"""


class DatabaseError(Exception):
    """
    データベース操作の例外基底クラス

    内部ログ用のメッセージとユーザー向けメッセージを分離して管理します。
    """

    def __init__(self, message: str, user_message: str = None):
        """
        初期化

        Args:
            message: 内部ログ用のメッセージ（詳細な技術情報を含む）
            user_message: ユーザー向けメッセージ（安全な情報のみ）
        """
        self.message = message
        self.user_message = user_message or "データベースエラーが発生しました"
        super().__init__(self.message)


class ValidationError(DatabaseError):
    """
    入力検証エラー

    ユーザー入力の検証失敗時に使用します。
    ユーザーに具体的なエラー内容を通知するため、
    messageとuser_messageは同じ内容にします。
    """

    def __init__(self, message: str):
        """
        初期化

        Args:
            message: エラーメッセージ（ユーザーにも表示）
        """
        # 検証エラーはユーザーにも詳細を伝える
        super().__init__(message, message)


class ConnectionError(DatabaseError):
    """
    データベース接続エラー

    データベースへの接続失敗時に使用します。
    内部的な接続情報は隠蔽し、ユーザーには一般的なメッセージを返します。
    """

    def __init__(self, message: str):
        """
        初期化

        Args:
            message: 内部ログ用のメッセージ（接続情報を含む）
        """
        super().__init__(
            message, "データベース接続エラーが発生しました。しばらくしてから再度お試しください"
        )


class QueryError(DatabaseError):
    """
    クエリ実行エラー

    SQL実行時のエラーに使用します。
    クエリの詳細は隠蔽し、ユーザーには一般的なメッセージを返します。
    """

    def __init__(self, message: str, query_type: str = "database"):
        """
        初期化

        Args:
            message: 内部ログ用のメッセージ（SQLクエリ情報を含む）
            query_type: クエリの種類（ログ出力用）
        """
        self.query_type = query_type
        super().__init__(message, "データ取得中にエラーが発生しました")
