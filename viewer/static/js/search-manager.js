/**
 * 検索機能を管理するクラス
 * キーワード検索、検索結果表示、検索状態管理を担当
 */
class SearchManager {
    /**
     * コンストラクタ
     * @param {Object} elements - DOM要素のキャッシュオブジェクト
     * @param {Object} messageDisplay - メッセージ表示管理オブジェクト
     * @param {Object} uiStateManager - UI状態管理オブジェクト
     */
    constructor(elements, messageDisplay, uiStateManager) {
        this.elements = elements;
        this.messageDisplay = messageDisplay;
        this.uiStateManager = uiStateManager;
    }

    /**
     * 検索を実行
     * 検索入力フィールドからキーワードを取得してAPI検索を実行
     */
    async handleSearch() {
        const query = this.elements.searchInput?.value?.trim();
        if (!query) {
            this.uiStateManager.showNotification(
                '検索キーワードを入力してください',
                'warning'
            );
            return;
        }

        try {
            this.showSearchLoading('検索中...');

            const response = await fetch(
                `/api/search?q=${encodeURIComponent(query)}&limit=1000`
            );
            const data = await response.json();

            if (data.success) {
                this.displaySearchResults(data.results, query);
                this.uiStateManager.updateStats({
                    messageCount: data.total,
                    dateRange: `検索: "${query}"`
                });
                this.uiStateManager.showNotification(
                    `"${query}"の検索結果: ${data.total}件`,
                    'success'
                );
            } else {
                throw new Error(data.error || 'メッセージ検索に失敗しました');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.uiStateManager.showNotification(error.message, 'error');
        } finally {
            this.hideSearchLoading();
        }
    }

    /**
     * 検索結果を表示
     * @param {Array} messages - 検索結果のメッセージ配列
     * @param {string} query - 検索クエリ
     */
    displaySearchResults(messages, query) {
        if (!this.elements.messageArea || !messages || messages.length === 0) {
            if (this.elements.messageArea) {
                this.elements.messageArea.innerHTML = `<div class="empty-state">"${query}"に一致するメッセージが見つかりません</div>`;
            }
            return;
        }

        this.messageDisplay.displayMessages(messages);
    }

    /**
     * 検索中ローディング表示を表示
     * @param {string} message - 表示メッセージ（デフォルト: '検索中...'）
     */
    showSearchLoading(message = '検索中...') {
        if (this.elements.searchLoading) {
            const textElement = this.elements.searchLoading.querySelector(
                '.search-loading-text'
            );
            if (textElement) {
                textElement.textContent = message;
            }
            this.elements.searchLoading.classList.add('active');
        }
    }

    /**
     * 検索中ローディング表示を非表示
     */
    hideSearchLoading() {
        if (this.elements.searchLoading) {
            this.elements.searchLoading.classList.remove('active');
        }
    }

    /**
     * 検索条件をクリア
     * 検索入力フィールドをクリアし、DateFilterを通じて全メッセージを表示
     * @param {Object} dateFilter - DateFilterインスタンス
     */
    clearSearchConditions(dateFilter) {
        // 検索入力フィールドをクリア
        if (this.elements.searchInput) this.elements.searchInput.value = '';

        // DateFilterを通じて検索条件クリアと全メッセージ表示を実行
        if (dateFilter && typeof dateFilter.clearSearchConditions === 'function') {
            dateFilter.clearSearchConditions();
        }
    }

    /**
     * 検索結果パネルを非表示
     */
    hideSearchResults() {
        if (this.elements.searchResults) {
            this.elements.searchResults.classList.add('hidden');
        }
    }
}

// グローバルスコープに公開
window.SearchManager = SearchManager;
