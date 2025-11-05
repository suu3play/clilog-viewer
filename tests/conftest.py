"""
pytest configuration file
テスト全体で共有するfixtureを定義
"""
import pytest
import tempfile
import os
from pathlib import Path


@pytest.fixture
def temp_dir():
    """一時ディレクトリを作成するfixture"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def sample_jsonl_file(temp_dir):
    """サンプルJSONLファイルを作成するfixture"""
    jsonl_content = """{"type":"message","role":"user","content":"Hello"}
{"type":"message","role":"assistant","content":"Hi there!"}
{"type":"message","role":"user","content":"How are you?"}
{"type":"message","role":"assistant","content":"I'm doing well, thank you!"}
"""
    file_path = temp_dir / "sample.jsonl"
    file_path.write_text(jsonl_content, encoding='utf-8')
    return file_path


@pytest.fixture
def sample_config_file(temp_dir):
    """サンプル設定ファイルを作成するfixture"""
    config_content = """[Paths]
input_folder = ./input
output_folder = ./output

[Options]
force_update = False
"""
    config_path = temp_dir / "config.ini"
    config_path.write_text(config_content, encoding='utf-8')
    return config_path
