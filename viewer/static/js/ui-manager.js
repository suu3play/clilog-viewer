/**
 * UI管理クラス
 * ユーザーインターフェース操作を管理
 */

class UIManager {
    constructor() {
        this.elements = {};
        this.state = {
            currentFile: null,
            currentMessages: [],
            theme: 'light',
            sidebarOpen: true,
            searchMode: false
        };
        
        this.init();
    }
    
    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadTheme();
        this.updateStats();
        
        // 初期化完了
        this.showWelcomeMessage();
    }
    
    cacheElements() {
        this.elements = {
            // ヘッダー
            searchInput: document.getElementById('searchInput'),
            searchBtn: document.getElementById('searchBtn'),
            fileSelect: document.getElementById('fileSelect'),
            fileStatus: document.getElementById('fileStatus'),
            
            // サイドバー
            sidebar: document.getElementById('sidebar'),
            toggleSidebar: document.getElementById('toggleSidebar'),
            fileList: document.getElementById('fileList'),
            buildCacheBtn: document.getElementById('buildCacheBtn'),
            clearCacheBtn: document.getElementById('clearCacheBtn'),
            
            // メイン
            loading: document.getElementById('loading'),
            messageArea: document.getElementById('messageArea'),
            virtualScroller: document.getElementById('virtualScroller'),
            searchResults: document.getElementById('searchResults'),
            searchTitle: document.getElementById('searchTitle'),
            searchList: document.getElementById('searchList'),
            closeSearch: document.getElementById('closeSearch'),
            
            // フッター
            stats: document.getElementById('stats'),
            messageCount: document.getElementById('messageCount'),
            cacheStatus: document.getElementById('cacheStatus'),
            loadTime: document.getElementById('loadTime'),
            themeToggle: document.getElementById('themeToggle'),
            
            // モーダル
            modal: document.getElementById('modal'),
            modalTitle: document.getElementById('modalTitle'),
            modalBody: document.getElementById('modalBody'),
            modalClose: document.getElementById('modalClose'),
            
            // 通知
            notifications: document.getElementById('notifications')
        };
    }
    
    bindEvents() {
        // 検索
        this.elements.searchBtn.addEventListener('click', () => this.handleSearch());
        this.elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        this.elements.closeSearch.addEventListener('click', () => this.hideSearchResults());
        
        // ファイル選択
        this.elements.fileSelect.addEventListener('change', (e) => this.handleFileSelect(e.target.value));
        
        // サイドバー
        this.elements.toggleSidebar.addEventListener('click', () => this.toggleSidebar());
        this.elements.buildCacheBtn.addEventListener('click', () => this.handleBuildCache());
        this.elements.clearCacheBtn.addEventListener('click', () => this.handleClearCache());
        
        // テーマ切り替え
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
        
        // モーダル
        this.elements.modalClose.addEventListener('click', () => this.hideModal());
        this.elements.modal.addEventListener('click', (e) => {
            if (e.target === this.elements.modal) this.hideModal();
        });
        
        // キーボードショートカット
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // レスポンシブ対応
        window.addEventListener('resize', () => this.handleResize());
    }
    
    async loadFileList() {
        try {
            this.showLoading('ファイル一覧を読み込み中...');
            
            const data = await apiClient.getFiles();
            
            // ファイル選択肢更新
            this.updateFileSelect(data.files);
            
            // サイドバーファイル一覧更新
            this.updateFileList(data.files);
            
            this.updateFileStatus(`${data.total}ファイル`);
            
        } catch (error) {
            this.showNotification('ファイル一覧の取得に失敗しました: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    updateFileSelect(files) {
        const select = this.elements.fileSelect;
        select.innerHTML = '<option value="">ファイルを選択...</option>';
        
        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file.path;
            option.textContent = file.name;
            if (file.is_cached) {
                option.textContent += ' ⚡';
            }
            select.appendChild(option);
        });
    }
    
    updateFileList(files) {
        const list = this.elements.fileList;
        list.innerHTML = '';
        
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.path = file.path;
            
            const size = this.formatFileSize(file.size);
            const date = this.formatDate(file.modified * 1000);
            const cacheIcon = file.is_cached ? '⚡' : '📄';
            
            item.innerHTML = `
                <div class="file-header">
                    <span class="file-icon">${cacheIcon}</span>
                    <span class="file-name">${file.name}</span>
                </div>
                <div class="file-meta">
                    <span class="file-size">${size}</span>
                    <span class="file-date">${date}</span>
                </div>
            `;
            
            item.addEventListener('click', () => this.handleFileSelect(file.path));
            list.appendChild(item);
        });
    }
    
    async handleFileSelect(filePath) {
        if (!filePath) return;
        
        try {
            this.showLoading('メッセージを読み込み中...');
            this.state.currentFile = filePath;
            
            const startTime = Date.now();
            const data = await apiClient.getMessages(filePath);
            const loadTime = Date.now() - startTime;
            
            this.state.currentMessages = data.messages;
            this.showMessages(data.messages);
            this.updateStats(data.total, loadTime);
            this.updateFileStatus(`${data.total}メッセージ`);
            
            // アクティブファイル表示
            this.updateActiveFile(filePath);
            
        } catch (error) {
            this.showNotification('メッセージの読み込みに失敗しました: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    showMessages(messages) {
        // Welcome メッセージを非表示
        this.elements.messageArea.style.display = 'none';
        this.elements.virtualScroller.classList.remove('hidden');
        
        // Virtual Scroller で表示
        if (!this.virtualScroller) {
            this.virtualScroller = new VirtualScroller(this.elements.virtualScroller);
        }
        
        this.virtualScroller.setItems(messages);
        this.state.searchMode = false;
    }
    
    async handleSearch() {
        const query = this.elements.searchInput.value.trim();
        if (!query) return;
        
        try {
            this.showLoading('検索中...');
            
            const options = {};
            if (this.state.currentFile) {
                options.file = this.state.currentFile;
            }
            
            const data = await apiClient.searchMessages(query, options);
            this.showSearchResults(data.results, query);
            
        } catch (error) {
            this.showNotification('検索に失敗しました: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    showSearchResults(results, query) {
        this.elements.searchTitle.textContent = `検索結果: "${query}" (${results.length}件)`;
        
        const list = this.elements.searchList;
        list.innerHTML = '';
        
        results.forEach((result, index) => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            
            const snippet = this.createSearchSnippet(result.content, query);
            const roleIcon = this.getRoleIcon(result.role);
            
            item.innerHTML = `
                <div class="result-header">
                    <span class="result-role">${roleIcon} ${result.role}</span>
                    <span class="result-timestamp">${result.timestamp}</span>
                    <span class="result-file">${result.file_path}</span>
                </div>
                <div class="result-content">${snippet}</div>
            `;
            
            item.addEventListener('click', () => {
                if (result.file_path !== this.state.currentFile) {
                    this.handleFileSelect(result.file_path);
                }
                // TODO: 該当メッセージにスクロール
            });
            
            list.appendChild(item);
        });
        
        this.elements.searchResults.classList.remove('hidden');
        this.state.searchMode = true;
    }
    
    hideSearchResults() {
        this.elements.searchResults.classList.add('hidden');
        this.state.searchMode = false;
    }
    
    createSearchSnippet(content, query) {
        const maxLength = 200;
        const index = content.toLowerCase().indexOf(query.toLowerCase());
        
        if (index === -1) {
            return this.escapeHtml(content.substring(0, maxLength)) + '...';
        }
        
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + query.length + 50);
        
        let snippet = content.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';
        
        // ハイライト
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        snippet = this.escapeHtml(snippet).replace(regex, '<mark>$1</mark>');
        
        return snippet;
    }
    
    async handleBuildCache() {
        try {
            const data = await apiClient.buildCache();
            this.showNotification(data.message, 'success');
            this.loadFileList(); // ファイル一覧を再読み込み
        } catch (error) {
            this.showNotification('キャッシュ作成に失敗しました: ' + error.message, 'error');
        }
    }
    
    async handleClearCache() {
        if (!confirm('すべてのキャッシュを削除しますか？')) return;
        
        try {
            const data = await apiClient.clearCache();
            this.showNotification(data.message, 'success');
            this.loadFileList(); // ファイル一覧を再読み込み
        } catch (error) {
            this.showNotification('キャッシュ削除に失敗しました: ' + error.message, 'error');
        }
    }
    
    toggleSidebar() {
        this.state.sidebarOpen = !this.state.sidebarOpen;
        
        if (this.state.sidebarOpen) {
            this.elements.sidebar.classList.remove('collapsed');
            this.elements.toggleSidebar.textContent = '←';
        } else {
            this.elements.sidebar.classList.add('collapsed');
            this.elements.toggleSidebar.textContent = '→';
        }
    }
    
    toggleTheme() {
        this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
        document.body.dataset.theme = this.state.theme;
        
        this.elements.themeToggle.textContent = this.state.theme === 'light' ? '🌙' : '☀️';
        
        localStorage.setItem('theme', this.state.theme);
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.state.theme = savedTheme;
        document.body.dataset.theme = savedTheme;
        this.elements.themeToggle.textContent = savedTheme === 'light' ? '🌙' : '☀️';
    }
    
    showLoading(message = '読み込み中...') {
        this.elements.loading.querySelector('p').textContent = message;
        this.elements.loading.classList.remove('hidden');
    }
    
    hideLoading() {
        this.elements.loading.classList.add('hidden');
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        this.elements.notifications.appendChild(notification);
        
        // アニメーション
        setTimeout(() => notification.classList.add('show'), 100);
        
        // 自動削除
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }
    
    showModal(title, content) {
        this.elements.modalTitle.textContent = title;
        this.elements.modalBody.innerHTML = content;
        this.elements.modal.classList.remove('hidden');
    }
    
    hideModal() {
        this.elements.modal.classList.add('hidden');
    }
    
    showWelcomeMessage() {
        this.elements.messageArea.style.display = 'block';
        this.elements.virtualScroller.classList.add('hidden');
    }
    
    updateStats(messageCount = 0, loadTime = 0) {
        this.elements.messageCount.textContent = `メッセージ: ${messageCount}`;
        this.elements.loadTime.textContent = `読み込み時間: ${loadTime}ms`;
    }
    
    updateFileStatus(status) {
        this.elements.fileStatus.textContent = status;
    }
    
    updateActiveFile(filePath) {
        // ファイル一覧のアクティブ表示
        this.elements.fileList.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.path === filePath) {
                item.classList.add('active');
            }
        });
        
        // ファイル選択肢の更新
        this.elements.fileSelect.value = filePath;
    }
    
    handleKeyboard(e) {
        // Ctrl+F: 検索
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            this.elements.searchInput.focus();
        }
        
        // Escape: モーダル・検索結果を閉じる
        if (e.key === 'Escape') {
            if (!this.elements.modal.classList.contains('hidden')) {
                this.hideModal();
            } else if (this.state.searchMode) {
                this.hideSearchResults();
            }
        }
    }
    
    handleResize() {
        // モバイル対応
        if (window.innerWidth < 768) {
            this.elements.sidebar.classList.add('mobile');
        } else {
            this.elements.sidebar.classList.remove('mobile');
        }
    }
    
    // ヘルパーメソッド
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    getRoleIcon(role) {
        const icons = {
            'user': '👤',
            'assistant': '🤖',
            'system': '⚙️',
            'summary': '📋'
        };
        return icons[role] || '💬';
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// グローバルUIマネージャー
window.uiManager = new UIManager();