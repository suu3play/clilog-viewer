# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-10-28

### Added
- High-speed chat viewer with SQLite cache system
- Virtual scrolling for efficient rendering of large message lists
- Full-text search with FTS5 (100-500x faster)
- Real-time viewer mode with WebSocket support
- Dark/Light theme toggle
- Code syntax highlighting with one-click copy
- Responsive design for desktop and mobile
- Tool usage visualization with expandable JSON blocks
- Cache management system
- Date range filtering
- File selection dropdown for JSONL files
- Connection status indicator for real-time mode
- Windows Task Scheduler integration for automated log conversion

### Changed
- Improved performance: 50-150x faster file loading with cache
- Enhanced UI with modern chat-style layout
- Optimized search functionality with SQLite FTS5

### Performance
- 5MB file loading: 2-3s → 20-50ms (50-150x faster)
- Full-text search: 500ms-1s → 1-5ms (100-500x faster)
- Filtering: 200-500ms → 5-10ms (20-50x faster)

## [1.0.0] - 2024-09-06

### Added
- Initial release
- JSONL to Markdown conversion
- Auto file search in `~/.claude/projects`
- Configuration file support
- Incremental update processing
- Batch processing for multiple files
- Skip unchanged files for faster processing
