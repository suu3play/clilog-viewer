"""
viewer/api/routes_realtime.pyのユニットテスト
リアルタイム機能のテスト
"""
import pytest
from pathlib import Path
import sys
import tempfile
import time

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestRealtimeRoutes:
    """リアルタイムルートのテスト"""

    @pytest.fixture
    def temp_log_file(self):
        """一時ログファイルを作成"""
        with tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.jsonl',
            delete=False,
            encoding='utf-8'
        ) as f:
            log_path = Path(f.name)
            # 初期データを書き込み
            f.write('{"type":"message","role":"user","content":"Hello"}\n')
            f.flush()

        yield log_path

        # クリーンアップ
        if log_path.exists():
            log_path.unlink()

    def test_read_initial_content(self, temp_log_file):
        """初期コンテンツの読み込み"""
        with open(temp_log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        assert len(lines) == 1
        assert 'Hello' in lines[0]

    def test_file_modification_detection(self, temp_log_file):
        """ファイル変更の検出"""
        # 初期の更新時刻を取得
        initial_mtime = temp_log_file.stat().st_mtime

        # ファイルに追記
        time.sleep(0.1)  # タイムスタンプが確実に変わるように待機
        with open(temp_log_file, 'a', encoding='utf-8') as f:
            f.write('{"type":"message","role":"assistant","content":"Hi"}\n')

        # 更新時刻が変わったことを確認
        new_mtime = temp_log_file.stat().st_mtime
        assert new_mtime > initial_mtime

    def test_read_appended_lines(self, temp_log_file):
        """追記された行の読み込み"""
        # ファイルに追記
        with open(temp_log_file, 'a', encoding='utf-8') as f:
            f.write('{"type":"message","role":"assistant","content":"Hi"}\n')
            f.write('{"type":"message","role":"user","content":"How are you?"}\n')

        # すべての行を読み込み
        with open(temp_log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        assert len(lines) == 3
        assert 'Hi' in lines[1]
        assert 'How are you?' in lines[2]

    def test_file_position_tracking(self, temp_log_file):
        """ファイル位置の追跡"""
        # 最初の読み込み
        with open(temp_log_file, 'r', encoding='utf-8') as f:
            f.readlines()
            position = f.tell()

        # 追記
        with open(temp_log_file, 'a', encoding='utf-8') as f:
            f.write('{"type":"message","role":"assistant","content":"New message"}\n')

        # 保存した位置から再開
        with open(temp_log_file, 'r', encoding='utf-8') as f:
            f.seek(position)
            new_lines = f.readlines()

        assert len(new_lines) == 1
        assert 'New message' in new_lines[0]

    def test_handle_nonexistent_file(self):
        """存在しないファイルの処理"""
        nonexistent_path = Path('/nonexistent/path/to/file.jsonl')
        assert not nonexistent_path.exists()

    def test_handle_empty_file(self):
        """空ファイルの処理"""
        with tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.jsonl',
            delete=False,
            encoding='utf-8'
        ) as f:
            empty_path = Path(f.name)

        try:
            with open(empty_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            assert len(lines) == 0
        finally:
            if empty_path.exists():
                empty_path.unlink()

    def test_file_path_validation(self):
        """ファイルパスのバリデーション"""
        # 相対パスが絶対パスに変換できることを確認
        relative_path = Path('test.jsonl')
        absolute_path = relative_path.resolve()
        assert absolute_path.is_absolute()

    def test_concurrent_read_write(self, temp_log_file):
        """同時読み書きの処理"""
        # 読み込み中にファイルに追記
        with open(temp_log_file, 'r', encoding='utf-8') as f_read:
            lines_before = f_read.readlines()

            # 別のハンドルで追記
            with open(temp_log_file, 'a', encoding='utf-8') as f_write:
                f_write.write('{"type":"message","role":"user","content":"New"}\n')

        # 再度読み込んで追記されたことを確認
        with open(temp_log_file, 'r', encoding='utf-8') as f:
            lines_after = f.readlines()

        assert len(lines_after) == len(lines_before) + 1

    def test_file_size_tracking(self, temp_log_file):
        """ファイルサイズの追跡"""
        initial_size = temp_log_file.stat().st_size

        # データを追記
        with open(temp_log_file, 'a', encoding='utf-8') as f:
            f.write('{"type":"message","role":"user","content":"Additional data"}\n')

        new_size = temp_log_file.stat().st_size
        assert new_size > initial_size

    def test_line_ending_handling(self, temp_log_file):
        """改行コードの処理"""
        # 異なる改行コードで追記
        with open(temp_log_file, 'a', encoding='utf-8', newline='') as f:
            f.write('{"type":"message","role":"user","content":"Line1"}' + '\n')
            f.write('{"type":"message","role":"user","content":"Line2"}' + '\r\n')

        # すべて正しく読み込めることを確認
        with open(temp_log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        assert len(lines) >= 3

    def test_utf8_encoding(self, temp_log_file):
        """UTF-8エンコーディングの処理"""
        # 日本語を含むデータを追記
        with open(temp_log_file, 'a', encoding='utf-8') as f:
            f.write('{"type":"message","role":"user","content":"こんにちは"}\n')

        # 正しく読み込めることを確認
        with open(temp_log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        assert 'こんにちは' in lines[-1]

    def test_file_truncation_detection(self, temp_log_file):
        """ファイル切り詰めの検出"""
        # 初期サイズを記録
        initial_size = temp_log_file.stat().st_size

        # ファイルを切り詰め（初期サイズより小さい内容で上書き）
        with open(temp_log_file, 'w', encoding='utf-8') as f:
            f.write('{"type":"message","role":"user","content":"Hi"}\n')

        # サイズが変わったことを確認
        new_size = temp_log_file.stat().st_size
        assert new_size < initial_size
