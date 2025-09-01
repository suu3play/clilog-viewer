#!/usr/bin/env python3
"""
SQLiteベースのメッセージキャッシュシステム
高速化のためファイルハッシュと更新検知を使用
"""
import sqlite3
import hashlib
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Tuple


class MessageCache:
    """高速メッセージキャッシュシステム"""
    
    def __init__(self, cache_dir: str = "cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)
        self.db_path = self.cache_dir / "message_cache.db"
        self.init_db()
    
    def init_db(self):
        """データベース初期化"""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript('''
                -- ファイルメタデータ
                CREATE TABLE IF NOT EXISTS files (
                    id INTEGER PRIMARY KEY,
                    file_path TEXT UNIQUE NOT NULL,
                    file_hash TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    last_modified INTEGER NOT NULL,
                    parsed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    message_count INTEGER NOT NULL
                );

                -- メッセージデータ
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY,
                    file_id INTEGER REFERENCES files(id),
                    message_index INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    content_type TEXT DEFAULT 'text',
                    tool_name TEXT,
                    UNIQUE(file_id, message_index)
                );

                -- 高速検索用FTSインデックス
                CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
                    content, 
                    content=messages, 
                    content_rowid=id
                );

                -- インデックス作成
                CREATE INDEX IF NOT EXISTS idx_files_hash ON files(file_hash);
                CREATE INDEX IF NOT EXISTS idx_messages_file_timestamp ON messages(file_id, timestamp);
            ''')

    def get_file_hash(self, file_path: Path) -> str:
        """高速ファイルハッシュ計算"""
        stat = file_path.stat()
        
        hasher = hashlib.sha256()
        hasher.update(str(stat.st_size).encode())
        hasher.update(str(int(stat.st_mtime)).encode())
        
        with open(file_path, 'rb') as f:
            # 先頭1MB
            chunk = f.read(1024 * 1024)
            hasher.update(chunk)
            
            # ファイルが大きい場合は末尾1KB
            if stat.st_size > 1024 * 1024:
                f.seek(-1024, 2)
                chunk = f.read(1024)
                hasher.update(chunk)
        
        return hasher.hexdigest()

    def is_cached_and_valid(self, file_path: Path) -> Optional[int]:
        """キャッシュが有効かチェック"""
        try:
            file_hash = self.get_file_hash(file_path)
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute(
                    "SELECT id FROM files WHERE file_path = ? AND file_hash = ?",
                    (str(file_path), file_hash)
                )
                result = cursor.fetchone()
                return result[0] if result else None
        except Exception as e:
            print(f"キャッシュ確認エラー: {e}")
            return None

    def get_cached_messages(self, file_id: int) -> List[Dict]:
        """キャッシュからメッセージ取得"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('''
                SELECT message_index, timestamp, role, content, content_type, tool_name
                FROM messages 
                WHERE file_id = ? 
                ORDER BY message_index
            ''', (file_id,))
            
            return [dict(row) for row in cursor.fetchall()]

    def save_messages(self, file_path: Path, messages: List[Dict]) -> int:
        """メッセージをキャッシュに保存"""
        file_hash = self.get_file_hash(file_path)
        stat = file_path.stat()
        
        with sqlite3.connect(self.db_path) as conn:
            # ファイル情報を保存
            cursor = conn.execute('''
                INSERT OR REPLACE INTO files 
                (file_path, file_hash, file_size, last_modified, message_count)
                VALUES (?, ?, ?, ?, ?)
            ''', (str(file_path), file_hash, stat.st_size, int(stat.st_mtime), len(messages)))
            
            file_id = cursor.lastrowid
            
            # 既存メッセージを削除
            conn.execute('DELETE FROM messages WHERE file_id = ?', (file_id,))
            
            # 新しいメッセージを保存
            for i, msg in enumerate(messages):
                conn.execute('''
                    INSERT INTO messages 
                    (file_id, message_index, timestamp, role, content, content_type, tool_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    file_id, i, msg['timestamp'], msg['role'], 
                    msg['content'], msg.get('content_type', 'text'), 
                    msg.get('tool_name')
                ))
            
            # FTS5インデックスを更新
            conn.execute('INSERT INTO message_search(message_search) VALUES("rebuild")')
            
            return file_id

    def search_messages(self, query: str, file_ids: List[int] = None, limit: int = 100) -> List[Dict]:
        """FTS5による高速全文検索"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            if file_ids:
                placeholders = ','.join('?' * len(file_ids))
                cursor = conn.execute(f'''
                    SELECT m.*, f.file_path
                    FROM message_search s
                    JOIN messages m ON m.id = s.rowid
                    JOIN files f ON f.id = m.file_id
                    WHERE message_search MATCH ? AND m.file_id IN ({placeholders})
                    ORDER BY rank
                    LIMIT ?
                ''', [query] + file_ids + [limit])
            else:
                cursor = conn.execute('''
                    SELECT m.*, f.file_path
                    FROM message_search s
                    JOIN messages m ON m.id = s.rowid  
                    JOIN files f ON f.id = m.file_id
                    WHERE message_search MATCH ?
                    ORDER BY rank
                    LIMIT ?
                ''', (query, limit))
            
            return [dict(row) for row in cursor.fetchall()]

    def get_cached_files(self) -> List[Dict]:
        """キャッシュ済みファイル一覧を取得"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('''
                SELECT id, file_path, file_size, last_modified, parsed_at, message_count
                FROM files 
                ORDER BY last_modified DESC
            ''')
            
            return [dict(row) for row in cursor.fetchall()]

    def clear_cache(self, file_path: Path = None):
        """キャッシュクリア"""
        with sqlite3.connect(self.db_path) as conn:
            if file_path:
                conn.execute('DELETE FROM files WHERE file_path = ?', (str(file_path),))
            else:
                conn.execute('DELETE FROM files')
                conn.execute('DELETE FROM messages')


class MarkdownParser:
    """Markdownファイル解析（既存log_converter.pyから移植・最適化）"""
    
    @staticmethod
    def parse_markdown_file(file_path: Path) -> List[Dict]:
        """Markdownファイルを解析してメッセージリストを返す"""
        messages = []
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # セクション分割（## で始まる行）
        sections = re.split(r'\n## ', content)
        
        for i, section in enumerate(sections):
            if i == 0:  # ヘッダー部分をスキップ
                continue
                
            # ロールとタイムスタンプを抽出
            lines = section.split('\n')
            header = lines[0]
            
            # パターンマッチング: "👤 ユーザー (2024-03-31 14:28:15)"
            match = re.match(r'([👤🤖⚙️📋])\s*(\w+).*?\(([^)]+)\)', header)
            if not match:
                continue
                
            emoji, role_name, timestamp = match.groups()
            
            # ロール正規化
            if emoji == '👤':
                role = 'user'
            elif emoji == '🤖':
                role = 'assistant'
            elif emoji == '📋':
                role = 'summary'
            else:
                role = role_name.lower()
            
            # コンテンツ抽出
            content_lines = lines[1:]
            content = '\n'.join(content_lines).strip()
            
            # "---" 区切りを削除
            if content.endswith('\n---'):
                content = content[:-4].strip()
            
            # ツール使用検知
            tool_name = None
            content_type = 'text'
            
            tool_match = re.search(r'\[ツール使用:\s*([^\]]+)\]', content)
            if tool_match:
                tool_name = tool_match.group(1)
                content_type = 'tool_use'
            
            # コードブロック検知
            if '```' in content:
                content_type = 'code_block'
            
            messages.append({
                'timestamp': timestamp,
                'role': role,
                'content': content,
                'content_type': content_type,
                'tool_name': tool_name
            })
        
        return messages


def load_chat_messages(file_path: Path) -> List[Dict]:
    """統合処理：キャッシュ確認 → パース → キャッシュ保存"""
    cache = MessageCache()
    
    # Step 1: キャッシュ確認
    file_id = cache.is_cached_and_valid(file_path)
    if file_id:
        print(f"キャッシュヒット: {file_path.name}")
        return cache.get_cached_messages(file_id)
    
    # Step 2: 初回パース
    print(f"初回パース中: {file_path.name}")
    messages = MarkdownParser.parse_markdown_file(file_path)
    
    # Step 3: キャッシュ保存
    cache.save_messages(file_path, messages)
    print(f"キャッシュ保存完了: {len(messages)}メッセージ")
    
    return messages


def build_initial_cache():
    """全ファイルの事前キャッシュ作成"""
    cache = MessageCache()
    md_files = list(Path().glob("log_*.md"))
    
    print(f"キャッシュ作成開始: {len(md_files)}ファイル")
    
    for file_path in md_files:
        if not cache.is_cached_and_valid(file_path):
            print(f"処理中: {file_path.name}")
            messages = MarkdownParser.parse_markdown_file(file_path)
            cache.save_messages(file_path, messages)
    
    print("キャッシュ作成完了")


if __name__ == "__main__":
    # テスト実行
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--build-cache":
            build_initial_cache()
        else:
            file_path = Path(sys.argv[1])
            if file_path.exists():
                messages = load_chat_messages(file_path)
                print(f"読み込み完了: {len(messages)}メッセージ")
            else:
                print(f"ファイルが見つかりません: {file_path}")
    else:
        print("使用方法:")
        print("  python message_cache.py <markdown_file>")
        print("  python message_cache.py --build-cache")