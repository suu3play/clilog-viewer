/**
 * virtual-scroller.jsのユニットテスト
 */

// virtual-scroller.jsの読み込み
const fs = require('fs');
const path = require('path');
const virtualScrollerCode = fs.readFileSync(
  path.join(__dirname, '../virtual-scroller.js'),
  'utf8'
);
eval(virtualScrollerCode);

describe('VirtualScroller', () => {
  let container;
  let scrollContent;
  let scroller;

  beforeEach(() => {
    // DOM要素のセットアップ
    document.body.innerHTML = `
      <div id="container" style="height: 600px; overflow-y: auto;">
        <div id="scrollContent"></div>
      </div>
    `;

    container = document.getElementById('container');
    scrollContent = document.getElementById('scrollContent');
    scroller = new VirtualScroller(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    test('正しく初期化される', () => {
      expect(scroller.container).toBe(container);
      expect(scroller.scrollContent).toBe(scrollContent);
      expect(scroller.itemHeight).toBe(150); // デフォルト値
      expect(scroller.renderBuffer).toBe(5);
      expect(scroller.items).toEqual([]);
    });

    test('カスタムオプションで初期化できる', () => {
      const customScroller = new VirtualScroller(container, {
        itemHeight: 200,
        renderBuffer: 10,
        scrollThrottle: 32
      });

      expect(customScroller.itemHeight).toBe(200);
      expect(customScroller.renderBuffer).toBe(10);
      expect(customScroller.scrollThrottle).toBe(32);
    });

    test('スタイルが正しく設定される', () => {
      expect(container.style.position).toBe('relative');
      expect(container.style.overflowY).toBe('auto');
      expect(scrollContent.style.position).toBe('relative');
    });
  });

  describe('setItems', () => {
    test('アイテムを設定できる', () => {
      const items = [
        { id: 1, content: 'Item 1' },
        { id: 2, content: 'Item 2' },
        { id: 3, content: 'Item 3' }
      ];

      scroller.setItems(items);

      expect(scroller.items).toEqual(items);
      expect(scroller.items.length).toBe(3);
    });

    test('スクロール高さが更新される', () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        content: `Item ${i}`
      }));

      scroller.setItems(items);

      // 10アイテム × 150px(itemHeight) = 1500px
      const expectedHeight = items.length * scroller.itemHeight;
      expect(scrollContent.style.height).toBe(`${expectedHeight}px`);
    });

    test('空配列を設定できる', () => {
      scroller.setItems([]);

      expect(scroller.items).toEqual([]);
      expect(scrollContent.style.height).toBe('0px');
    });
  });

  describe('updateScrollHeight', () => {
    test('アイテム数に応じて高さが計算される', () => {
      scroller.items = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      scroller.updateScrollHeight();

      // 20アイテム × 150px = 3000px
      expect(scrollContent.style.height).toBe('3000px');
    });

    test('アイテムがない場合は高さ0', () => {
      scroller.items = [];
      scroller.updateScrollHeight();

      expect(scrollContent.style.height).toBe('0px');
    });
  });

  describe('throttle', () => {
    test('スロットル関数が動作する', (done) => {
      let callCount = 0;
      const throttled = scroller.throttle(() => {
        callCount++;
      }, 100);

      // 複数回呼び出し
      throttled();
      throttled();
      throttled();

      // 即座には1回だけ実行される
      expect(callCount).toBe(1);

      // 100ms後に再度実行可能
      setTimeout(() => {
        throttled();
        expect(callCount).toBe(2);
        done();
      }, 150);
    });
  });

  describe('handleScroll', () => {
    test('スクロールイベントが処理される', () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        content: `Item ${i}`
      }));
      scroller.setItems(items);

      // スクロール位置を変更
      container.scrollTop = 1000;

      // handleScrollを呼び出し
      scroller.handleScroll();

      // 可視範囲が更新されているはず
      expect(scroller.visibleStart).toBeGreaterThanOrEqual(0);
      expect(scroller.visibleEnd).toBeGreaterThan(scroller.visibleStart);
    });
  });

  describe('destroy', () => {
    test('イベントリスナーがクリーンアップされる', () => {
      const removeEventListenerSpy = jest.spyOn(container, 'removeEventListener');
      const windowRemoveSpy = jest.spyOn(window, 'removeEventListener');

      if (scroller.destroy) {
        scroller.destroy();

        expect(removeEventListenerSpy).toHaveBeenCalled();
        expect(windowRemoveSpy).toHaveBeenCalled();
      }
    });
  });
});
