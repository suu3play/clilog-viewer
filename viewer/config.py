"""
アプリケーション設定管理モジュール
設定ファイルの読み込みとパス管理を一元化
"""

import configparser
import sys
from pathlib import Path
from typing import Optional


class AppConfig:
    """アプリケーション設定管理クラス"""

    def __init__(self, config_file: Optional[Path] = None):
        """
        初期化

        Args:
            config_file: 設定ファイルのパス（省略時はデフォルトパスを使用）
        """
        self.config_file = config_file or self._get_default_config_path()
        self._config_parser = None
        self._load_config()

    @staticmethod
    def _get_default_config_path() -> Path:
        """デフォルト設定ファイルパスを取得"""
        return Path(__file__).parent.parent / "log_converter_config.ini"

    def _load_config(self):
        """設定ファイルを読み込み"""
        if self.config_file.exists():
            try:
                self._config_parser = configparser.ConfigParser()
                self._config_parser.read(self.config_file, encoding="utf-8")
                print(f"設定ファイル読み込み成功: {self.config_file}")
            except Exception as e:
                print(f"警告: 設定ファイルの読み込みに失敗: {e}")
                self._config_parser = None
        else:
            print(f"警告: 設定ファイルが見つかりません: {self.config_file}")
            self._config_parser = None

    def get_database_path(self) -> Path:
        """
        データベースファイルのパスを取得

        Returns:
            データベースファイルのパス
        """
        try:
            # log_converter.pyからConfigクラスをインポート
            sys.path.append(str(Path(__file__).parent.parent))
            try:
                from log_converter import Config
            except ImportError:
                print("警告: log_converter.pyの読み込みに失敗しました")
                return Path("../log_data.db")

            if self.config_file.exists():
                config = Config(str(self.config_file))
                output_dir = config.get_output_directory()

                # 相対パスの場合は設定ファイルの場所を基準に解決
                if not output_dir.is_absolute():
                    output_dir = self.config_file.parent / output_dir

                db_path = output_dir / "log_data.db"
                print(f"データベースパス: {db_path}")
                return db_path.resolve()
            else:
                print(f"警告: 設定ファイルが見つかりません: {self.config_file}")
                return Path("../log_data.db")

        except Exception as e:
            print(f"エラー: 設定ファイルの読み込みに失敗しました: {e}")
            print("デフォルトデータベースパス '../log_data.db' を使用します。")
            return Path("../log_data.db")

    def get_default_display_mode(self) -> str:
        """
        初期表示モードを取得

        Returns:
            表示モード（'database' または 'realtime'）
        """
        default_mode = "database"

        if self._config_parser:
            try:
                if (
                    "DEFAULT" in self._config_parser
                    and "default_display_mode" in self._config_parser["DEFAULT"]
                ):
                    mode_value = (
                        self._config_parser["DEFAULT"]["default_display_mode"].strip().lower()
                    )
                    if mode_value in ["realtime", "database"]:
                        default_mode = mode_value
            except Exception as e:
                print(f"警告: 表示モード設定の読み込みに失敗: {e}")

        return default_mode

    def get_config_dict(self) -> dict:
        """
        設定を辞書形式で取得

        Returns:
            設定値の辞書
        """
        return {
            "default_display_mode": self.get_default_display_mode(),
            "database_path": str(self.get_database_path()),
            "config_file": str(self.config_file),
        }
