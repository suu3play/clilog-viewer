/**
 * Virtual Scrolling 実装
 * 大量のメッセージを効率的に描画
 */

class VirtualScroller {
    constructor(container, options = {}) {
        this.container = container;
        this.scrollContent = container.querySelector('#scrollContent');
        
        // 設定
        this.itemHeight = options.itemHeight || 150;
        this.renderBuffer = options.renderBuffer || 5;
        this.scrollThrottle = options.scrollThrottle || 16;
        
        // 状態
        this.items = [];
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.renderedItems = new Map();
        
        // スクロールイベント
        this.throttledScroll = this.throttle(this.handleScroll.bind(this), this.scrollThrottle);
        this.container.addEventListener('scroll', this.throttledScroll);
        
        // リサイズイベント
        this.handleResize = this.throttle(this.updateVisibleRange.bind(this), 100);
        window.addEventListener('resize', this.handleResize);
        
        this.init();
    }
    
    init() {
        this.container.style.position = 'relative';
        this.container.style.overflowY = 'auto';
        this.scrollContent.style.position = 'relative';
    }
    
    setItems(items) {
        this.items = items;
        this.updateScrollHeight();
        this.updateVisibleRange();
        this.render();
    }
    
    updateScrollHeight() {
        const totalHeight = this.items.length * this.itemHeight;
        this.scrollContent.style.height = `${totalHeight}px`;
    }
    
    handleScroll() {
        this.updateVisibleRange();
        this.render();
    }
    
    updateVisibleRange() {
        const scrollTop = this.container.scrollTop;
        const containerHeight = this.container.clientHeight;
        
        // 可視範囲計算
        this.visibleStart = Math.floor(scrollTop / this.itemHeight);
        this.visibleEnd = Math.ceil((scrollTop + containerHeight) / this.itemHeight);
        
        // バッファ追加
        this.visibleStart = Math.max(0, this.visibleStart - this.renderBuffer);
        this.visibleEnd = Math.min(this.items.length, this.visibleEnd + this.renderBuffer);
    }
    
    render() {
        // 表示範囲外のアイテムを削除
        for (const [index, element] of this.renderedItems.entries()) {
            if (index < this.visibleStart || index >= this.visibleEnd) {
                element.remove();
                this.renderedItems.delete(index);
            }
        }
        
        // 新しいアイテムを描画
        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            if (!this.renderedItems.has(i) && this.items[i]) {
                const element = this.createMessageElement(this.items[i], i);
                this.renderedItems.set(i, element);
                this.scrollContent.appendChild(element);
            }
        }
    }
    
    createMessageElement(message, index) {
        const element = document.createElement('div');
        element.className = `message message-${message.role}`;
        element.style.position = 'absolute';
        element.style.top = `${index * this.itemHeight}px`;
        element.style.width = '100%';
        element.style.minHeight = `${this.itemHeight}px`;
        element.dataset.index = index;
        
        // メッセージコンテンツ
        element.innerHTML = this.renderMessageContent(message);
        
        return element;
    }
    
    renderMessageContent(message) {
        const timestamp = this.formatTimestamp(message.timestamp);
        const roleIcon = this.getRoleIcon(message.role);
        const roleName = this.getRoleName(message.role);
        
        let content = this.escapeHtml(message.content);
        
        // コードブロック処理
        content = this.processCodeBlocks(content);
        
        // ツール使用の処理
        if (message.content_type === 'tool_use' && message.tool_name) {
            content = this.processToolUse(content, message.tool_name);
        }
        
        // リンクの処理
        content = this.processLinks(content);
        
        return `
            <div class="message-header">
                <div class="message-role">
                    <span class="role-icon">${roleIcon}</span>
                    <span class="role-name">${roleName}</span>
                </div>
                <div class="message-timestamp">${timestamp}</div>
            </div>
            <div class="message-content">
                ${content}
            </div>
        `;
    }
    
    processCodeBlocks(content) {
        // コードブロック（```で囲まれた部分）を処理
        return content.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (match, language, code) => {
            const lang = language || 'text';
            const escapedCode = this.escapeHtml(code);
            return `
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-language">${lang}</span>
                        <button class="copy-btn" onclick="copyToClipboard(this)" data-code="${this.escapeHtml(code)}">
                            📋 コピー
                        </button>
                    </div>
                    <pre class="code-content"><code class="language-${lang}">${escapedCode}</code></pre>
                </div>
            `;
        });
    }
    
    processToolUse(content, toolName) {
        // ツール使用ブロックを展開可能にする
        const match = content.match(/\[ツール使用:\s*([^\]]+)\]\n```json\n([\s\S]*?)\n```/);
        if (match) {
            const [, tool, jsonData] = match;
            return content.replace(match[0], `
                <div class="tool-use">
                    <div class="tool-header" onclick="toggleToolDetails(this)">
                        🔧 ツール使用: ${tool}
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="tool-details">
                        <pre class="json-content">${this.escapeHtml(jsonData)}</pre>
                    </div>
                </div>
            `);
        }
        return content;
    }
    
    processLinks(content) {
        // URLを自動リンク化
        const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
        return content.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
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
    
    getRoleName(role) {
        const names = {
            'user': 'ユーザー',
            'assistant': 'アシスタント', 
            'system': 'システム',
            'summary': 'サマリー'
        };
        return names[role] || role;
    }
    
    formatTimestamp(timestamp) {
        try {
            // "2024-03-31 14:28:15 JST" 形式を想定
            return timestamp.replace(' JST', '');
        } catch (e) {
            return timestamp;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    scrollToMessage(index) {
        const targetScrollTop = index * this.itemHeight;
        this.container.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth'
        });
    }
    
    destroy() {
        this.container.removeEventListener('scroll', this.throttledScroll);
        window.removeEventListener('resize', this.handleResize);
        this.renderedItems.clear();
    }
}

// グローバル関数
window.copyToClipboard = function(button) {
    const code = button.getAttribute('data-code');
    navigator.clipboard.writeText(code).then(() => {
        button.textContent = '✅ コピー済み';
        setTimeout(() => {
            button.innerHTML = '📋 コピー';
        }, 2000);
    }).catch(err => {
        console.error('コピーに失敗:', err);
        showNotification('コピーに失敗しました', 'error');
    });
};

window.toggleToolDetails = function(header) {
    const details = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');
    
    if (details.style.display === 'none' || !details.style.display) {
        details.style.display = 'block';
        icon.textContent = '▲';
    } else {
        details.style.display = 'none';
        icon.textContent = '▼';
    }
};