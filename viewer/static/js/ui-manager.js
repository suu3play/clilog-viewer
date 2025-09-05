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
            searchMode: false,
            currentPage: 1,
            totalPages: 1,
            perPage: 50,
            totalMessageCount: 0
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
            
            // ページネーション
            pagination: document.getElementById('pagination'),
            prevPage: document.getElementById('prevPage'),
            nextPage: document.getElementById('nextPage'),
            currentPage: document.getElementById('currentPage'),
            totalPages: document.getElementById('totalPages'),
            totalMessages: document.getElementById('totalMessages'),
            messageRange: document.getElementById('messageRange'),
            
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
        
        // ページネーション
        this.elements.prevPage.addEventListener('click', () => this.goToPreviousPage());
        this.elements.nextPage.addEventListener('click', () => this.goToNextPage());
        
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
            
            // ファイル全体クリックでファイル選択
            item.addEventListener('click', () => this.handleFileSelect(file.path));
            
            list.appendChild(item);
        });
    }
    
    async handleFileSelect(filePath) {
        console.log('ファイル選択:', filePath);
        
        if (!filePath) {
            console.log('ファイルパスが空です');
            return;
        }
        
        // 既に同じファイルが選択されている場合はスキップ
        if (this.state.currentFile === filePath) {
            console.log('同じファイルが既に選択されています:', filePath);
            return;
        }
        
        // ページネーション状態をリセット
        this.state.currentFile = filePath;
        this.state.currentPage = 1;
        
        // ファイル名を取得してステータス表示
        const fileName = filePath.split('/').pop() || filePath;
        this.updateFileStatus(`${fileName}を読み込み中...`);
        
        // 新しいloadSingleFileメソッドを使用
        await this.loadSingleFile(filePath);
    }
    
    showMessages(messages) {
        console.log('showMessages呼び出し:', messages?.length || 0, 'メッセージ');
        
        // Welcome メッセージを非表示
        this.elements.messageArea.style.display = 'none';
        this.elements.virtualScroller.classList.remove('hidden');
        
        // シンプルなメッセージ表示
        const scrollContent = document.getElementById('scrollContent');
        if (!scrollContent) {
            console.error('scrollContent要素が見つかりません');
            return;
        }
        
        // 既存のコンテンツをクリア
        scrollContent.innerHTML = '';
        
        // メッセージを直接レンダリング
        messages.forEach((message, index) => {
            // 全体でのメッセージ番号を計算
            const globalIndex = (this.state.currentPage - 1) * this.state.perPage + index;
            const messageElement = this.createMessageElement(message, globalIndex);
            scrollContent.appendChild(messageElement);
        });
        
        this.state.searchMode = false;
        console.log('メッセージ表示完了');
    }
    
    async handleSearch() {
        const query = this.elements.searchInput.value.trim();
        if (!query) {
            this.clearSearchHighlights();
            return;
        }
        
        try {
            this.showLoading('検索中...');
            
            // 現在のファイルのメッセージから検索
            if (!this.state.currentMessages) {
                this.showNotification('まずファイルを選択してください', 'warning');
                return;
            }
            
            this.performInPageSearch(query);
            
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

    createMessageElement(message, index) {
        const div = document.createElement('div');
        div.className = `message ${message.role === 'user' ? 'message-user' : 'message-assistant'}`;
        div.innerHTML = this.formatMessageHTML(message, index);
        return div;
    }

    formatMessageHTML(message, index) {
        const roleIcon = message.role === 'user' ? '👤' : '🤖';
        const roleName = message.role === 'user' ? 'User' : 'Assistant';
        const messageNumber = index + 1; // 1から始まる番号
        
        // タイムスタンプを適切に処理
        let timestamp = message.timestamp;
        if (timestamp) {
            // 既にJST形式の文字列の場合はそのまま使用
            if (typeof timestamp === 'string' && timestamp.includes('JST')) {
                timestamp = timestamp.replace(' JST', '');
            } else {
                // ISO形式の場合は日本語形式に変換
                try {
                    const date = new Date(timestamp);
                    timestamp = date.toLocaleString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZone: 'Asia/Tokyo'
                    });
                } catch (e) {
                    console.warn('日時解析エラー:', timestamp, e);
                    timestamp = String(timestamp);
                }
            }
        } else {
            timestamp = '不明';
        }
        
        // ソースファイル表示（複数ファイルモードの場合）
        const sourceFileDisplay = '';
        
        // コンテンツを処理
        let content = this.escapeHtml(message.content);
        content = this.processCodeBlocks(content);
        
        // メッセージ全体のテキストをエスケープしてdata属性に格納
        const messageText = `${roleName}: ${message.content}`;
        const escapedMessageText = messageText.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        
        return `
            <div class="message-header">
                <div class="message-role">
                    <span class="message-number">#${messageNumber}</span>
                    <span class="role-icon">${roleIcon}</span>
                    <span class="role-name">${roleName}</span>
                    ${sourceFileDisplay}
                </div>
                <div class="message-actions">
                    <button class="copy-message-btn" onclick="copyMessageToClipboard(this)" data-message="${escapedMessageText}" title="メッセージをコピー">
                        📋 コピー
                    </button>
                    <div class="message-timestamp">${timestamp}</div>
                </div>
            </div>
            <div class="message-content">
                ${content}
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    processCodeBlocks(content) {
        return content.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (match, language, code) => {
            const lang = language || 'text';
            const escapedCode = this.escapeHtml(code);
            const dataCodeEscaped = code.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            return `
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-language">${lang}</span>
                        <button class="copy-btn" onclick="copyToClipboard(this)" data-code="${dataCodeEscaped}">
                            📋 コピー
                        </button>
                    </div>
                    <pre class="code-content"><code class="language-${lang}">${escapedCode}</code></pre>
                </div>
            `;
        });
    }
    
    updateFileStatus(status) {
        this.elements.fileStatus.textContent = status;
    }

    performInPageSearch(query) {
        // 既存のハイライトをクリア
        this.clearSearchHighlights();
        
        // 検索結果を格納
        this.searchResults = [];
        this.currentSearchIndex = -1;
        
        const scrollContent = document.getElementById('scrollContent');
        if (!scrollContent) return;
        
        const messages = scrollContent.querySelectorAll('.message');
        
        messages.forEach((messageElement, messageIndex) => {
            const contentElement = messageElement.querySelector('.message-content');
            if (!contentElement) return;
            
            const originalHTML = contentElement.innerHTML;
            const textContent = contentElement.textContent || contentElement.innerText;
            
            // 大文字小文字を区別しない検索
            const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            
            if (regex.test(textContent)) {
                // ハイライト付きHTMLを作成
                const highlightedHTML = originalHTML.replace(regex, '<mark class="search-highlight">$1</mark>');
                contentElement.innerHTML = highlightedHTML;
                
                // 検索結果として追加
                const highlights = contentElement.querySelectorAll('.search-highlight');
                highlights.forEach((highlight, highlightIndex) => {
                    this.searchResults.push({
                        element: highlight,
                        messageIndex: messageIndex,
                        highlightIndex: highlightIndex
                    });
                });
            }
        });
        
        // 結果表示
        if (this.searchResults.length > 0) {
            this.showNotification(`"${query}" を ${this.searchResults.length} 箇所で見つけました。F3で次へ`, 'success');
            this.jumpToNextSearchResult();
        } else {
            this.showNotification(`"${query}" は見つかりませんでした`, 'info');
        }
    }

    clearSearchHighlights() {
        // 既存のハイライトを削除
        const highlights = document.querySelectorAll('.search-highlight');
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
            parent.normalize();
        });
        
        this.searchResults = [];
        this.currentSearchIndex = -1;
        
        // アクティブハイライトも削除
        document.querySelectorAll('.search-highlight-active').forEach(el => {
            el.classList.remove('search-highlight-active');
        });
    }

    jumpToNextSearchResult() {
        if (!this.searchResults || this.searchResults.length === 0) return;
        
        // 前のアクティブハイライトを削除
        document.querySelectorAll('.search-highlight-active').forEach(el => {
            el.classList.remove('search-highlight-active');
        });
        
        // 次の結果に移動
        this.currentSearchIndex = (this.currentSearchIndex + 1) % this.searchResults.length;
        const result = this.searchResults[this.currentSearchIndex];
        
        // アクティブハイライトを設定
        result.element.classList.add('search-highlight-active');
        
        // スクロールして表示
        result.element.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
        
        // 現在位置を表示
        this.showNotification(`検索結果 ${this.currentSearchIndex + 1}/${this.searchResults.length}`, 'info', 2000);
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
        
        // F3: 次の検索結果
        if (e.key === 'F3') {
            e.preventDefault();
            if (this.searchResults && this.searchResults.length > 0) {
                this.jumpToNextSearchResult();
            }
        }
        
        // Escape: モーダル・検索結果を閉じる
        if (e.key === 'Escape') {
            if (!this.elements.modal.classList.contains('hidden')) {
                this.hideModal();
            } else if (this.searchResults && this.searchResults.length > 0) {
                this.clearSearchHighlights();
                this.showNotification('検索を終了しました', 'info');
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
    
    
    // ページネーション関連メソッド
    updatePagination() {
        this.elements.currentPage.textContent = this.state.currentPage;
        this.elements.totalPages.textContent = this.state.totalPages;
        this.elements.totalMessages.textContent = this.state.totalMessageCount;
        
        const start = (this.state.currentPage - 1) * this.state.perPage + 1;
        const end = Math.min(this.state.currentPage * this.state.perPage, this.state.totalMessageCount);
        this.elements.messageRange.textContent = `${start}-${end}`;
        
        // ボタンの有効/無効制御
        this.elements.prevPage.disabled = this.state.currentPage === 1;
        this.elements.nextPage.disabled = this.state.currentPage === this.state.totalPages;
        
        // ページネーションの表示/非表示
        if (this.state.totalPages > 1) {
            this.elements.pagination.classList.remove('hidden');
        } else {
            this.elements.pagination.classList.add('hidden');
        }
    }
    
    async goToPreviousPage() {
        if (this.state.currentPage > 1) {
            this.state.currentPage--;
            await this.loadCurrentMessages();
            this.scrollToTop();
        }
    }
    
    async goToNextPage() {
        if (this.state.currentPage < this.state.totalPages) {
            this.state.currentPage++;
            await this.loadCurrentMessages();
            this.scrollToTop();
        }
    }
    
    scrollToTop() {
        const scrollContent = document.getElementById('scrollContent');
        if (scrollContent) {
            scrollContent.scrollTop = 0;
        }
        
        // チャット領域全体も一番上にスクロール
        const chatArea = document.querySelector('.chat-area');
        if (chatArea) {
            chatArea.scrollTop = 0;
        }
    }
    
    async loadCurrentMessages() {
        if (this.state.currentFile) {
            await this.loadSingleFile(this.state.currentFile);
        }
    }
    
    async loadSingleFile(filePath) {
        try {
            this.showLoading('メッセージを読み込み中...');
            
            const startTime = Date.now();
            const data = await apiClient.getMessages(filePath, this.state.currentPage, this.state.perPage);
            const loadTime = Date.now() - startTime;
            
            if (!data || !data.success) {
                throw new Error(data?.error || 'データの取得に失敗しました');
            }
            
            // ページネーション情報を更新
            this.state.totalMessageCount = data.total;
            this.state.totalPages = Math.ceil(data.total / this.state.perPage);
            
            // メッセージ表示
            this.showMessages(data.messages);
            this.updatePagination();
            this.updateStats(data.total, loadTime);
            
        } catch (error) {
            console.error('ファイル読み込みエラー:', error);
            this.showNotification('メッセージの読み込みに失敗しました: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }
}

// グローバル関数 - メッセージコピー
window.copyMessageToClipboard = function(button) {
    const messageText = button.getAttribute('data-message');
    // HTMLエンティティをデコード
    const decodedMessage = messageText
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    
    console.log('メッセージコピー:', decodedMessage);
    
    navigator.clipboard.writeText(decodedMessage).then(() => {
        const originalText = button.innerHTML;
        button.innerHTML = '✅ コピー済み';
        button.style.color = '#22c55e';
        setTimeout(() => {
            button.innerHTML = originalText;
            button.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('メッセージコピーに失敗:', err);
        // Fallbackとして古い方法を試す
        try {
            const textArea = document.createElement('textarea');
            textArea.value = decodedMessage;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            const originalText = button.innerHTML;
            button.innerHTML = '✅ コピー済み';
            button.style.color = '#22c55e';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.style.color = '';
            }, 2000);
        } catch (fallbackErr) {
            console.error('Fallbackメッセージコピーも失敗:', fallbackErr);
            if (window.uiManager) {
                window.uiManager.showNotification('メッセージのコピーに失敗しました', 'error');
            }
        }
    });
};

// グローバルUIマネージャー
window.uiManager = new UIManager();