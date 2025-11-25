"""
log_converter.pyのユニットテスト
"""

import json
from pathlib import Path
from unittest.mock import Mock, patch

import pytest


class TestToolDetector:
    """ToolDetectorクラスのテスト"""

    def test_detect_by_path_claude(self, temp_dir):
        """Claudeログファイルのパス判定テスト"""
        # log_converterをインポート（遅延インポート）
        import sys

        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from log_converter import ToolDetector

        # Claudeのパスパターン
        claude_path = temp_dir / ".claude" / "projects" / "test" / "conversation.jsonl"
        claude_path.parent.mkdir(parents=True, exist_ok=True)
        claude_path.touch()

        result = ToolDetector.detect_by_path(claude_path)
        assert result == "claude", f"Expected 'claude', got '{result}'"

    def test_detect_by_path_copilot(self, temp_dir):
        """Copilotログファイルのパス判定テスト"""
        import sys

        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from log_converter import ToolDetector

        # Copilotのパスパターン
        copilot_path = temp_dir / ".vscode" / "copilot.log"
        copilot_path.parent.mkdir(parents=True, exist_ok=True)
        copilot_path.touch()

        result = ToolDetector.detect_by_path(copilot_path)
        assert result == "copilot", f"Expected 'copilot', got '{result}'"

    def test_detect_by_path_chatgpt(self, temp_dir):
        """ChatGPTログファイルのパス判定テスト"""
        import sys

        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from log_converter import ToolDetector

        # ChatGPTのパスパターン
        chatgpt_path = temp_dir / "chatgpt_conversation.json"
        chatgpt_path.touch()

        result = ToolDetector.detect_by_path(chatgpt_path)
        assert result == "chatgpt", f"Expected 'chatgpt', got '{result}'"

    def test_detect_by_path_unknown(self, temp_dir):
        """不明なファイルのパス判定テスト"""
        import sys

        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from log_converter import ToolDetector

        # 不明なパターン
        unknown_path = temp_dir / "random_file.txt"
        unknown_path.touch()

        result = ToolDetector.detect_by_path(unknown_path)
        assert result is None, f"Expected None, got '{result}'"


class TestBaseLogParser:
    """BaseLogParserクラスのテスト"""

    def test_parse_file_empty(self, temp_dir):
        """空ファイルの解析テスト"""
        import sys

        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from log_converter import BaseLogParser

        # テスト用のパーサー実装
        class TestParser(BaseLogParser):
            def get_tool_type(self):
                return "test"

            def can_parse(self, file_path):
                return True

            def parse_line(self, line):
                return {"content": line.strip()}

        # 空ファイル
        empty_file = temp_dir / "empty.txt"
        empty_file.touch()

        parser = TestParser()
        result = parser.parse_file(empty_file)

        assert isinstance(result, list)
        assert len(result) == 0

    def test_parse_file_with_content(self, temp_dir):
        """コンテンツありファイルの解析テスト"""
        import sys

        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from log_converter import BaseLogParser

        # テスト用のパーサー実装
        class TestParser(BaseLogParser):
            def get_tool_type(self):
                return "test"

            def can_parse(self, file_path):
                return True

            def parse_line(self, line):
                if line.strip():
                    return {"content": line.strip()}
                return None

        # テストファイル作成
        test_file = temp_dir / "test.txt"
        test_file.write_text("line1\nline2\nline3\n", encoding="utf-8")

        parser = TestParser()
        result = parser.parse_file(test_file)

        assert len(result) == 3
        assert result[0]["content"] == "line1"
        assert result[1]["content"] == "line2"
        assert result[2]["content"] == "line3"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
