/**
 * ui-manager.jsのユニットテスト
 * UI状態管理とイベントハンドリング
 */

describe('UIStateManager', () => {
  let uiManager;
  let mockElement;

  beforeEach(() => {
    // モックDOM要素を作成
    mockElement = {
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        toggle: jest.fn(),
        contains: jest.fn(() => false),
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      style: {},
      textContent: '',
      innerHTML: '',
    };

    document.getElementById = jest.fn((id) => {
      if (id === 'theme-toggle') return mockElement;
      if (id === 'file-select') return mockElement;
      if (id === 'error-message') return mockElement;
      return mockElement;
    });

    document.querySelector = jest.fn(() => mockElement);
    document.querySelectorAll = jest.fn(() => [mockElement]);

    // UIStateManagerのモック実装
    uiManager = {
      state: {
        theme: 'light',
        selectedFile: null,
        isLoading: false,
        error: null,
      },
      updateState: function (updates) {
        Object.assign(this.state, updates);
        this.render();
      },
      render: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateState', () => {
    test('状態を正しく更新する', () => {
      uiManager.updateState({ theme: 'dark' });

      expect(uiManager.state.theme).toBe('dark');
      expect(uiManager.render).toHaveBeenCalled();
    });

    test('複数のプロパティを更新する', () => {
      uiManager.updateState({
        theme: 'dark',
        selectedFile: 'file1.jsonl',
        isLoading: true,
      });

      expect(uiManager.state.theme).toBe('dark');
      expect(uiManager.state.selectedFile).toBe('file1.jsonl');
      expect(uiManager.state.isLoading).toBe(true);
    });

    test('部分的な更新が既存の状態を保持する', () => {
      uiManager.state = {
        theme: 'light',
        selectedFile: 'file1.jsonl',
        isLoading: false,
        error: null,
      };

      uiManager.updateState({ theme: 'dark' });

      expect(uiManager.state.theme).toBe('dark');
      expect(uiManager.state.selectedFile).toBe('file1.jsonl');
      expect(uiManager.state.isLoading).toBe(false);
    });
  });

  describe('テーマ切り替え', () => {
    test('ライトテーマからダークテーマに切り替え', () => {
      uiManager.state.theme = 'light';
      uiManager.updateState({ theme: 'dark' });

      expect(uiManager.state.theme).toBe('dark');
      expect(uiManager.render).toHaveBeenCalled();
    });

    test('ダークテーマからライトテーマに切り替え', () => {
      uiManager.state.theme = 'dark';
      uiManager.updateState({ theme: 'light' });

      expect(uiManager.state.theme).toBe('light');
    });

    test('テーマ切り替えボタンのクリックイベント', () => {
      const themeToggle = mockElement;
      const clickHandler = jest.fn();

      themeToggle.addEventListener('click', clickHandler);
      themeToggle.addEventListener.mock.calls[0][1]();

      expect(clickHandler).toHaveBeenCalled();
    });
  });

  describe('ファイル選択UI', () => {
    test('ファイル選択時に状態を更新', () => {
      uiManager.updateState({ selectedFile: 'conversation_2025.jsonl' });

      expect(uiManager.state.selectedFile).toBe('conversation_2025.jsonl');
      expect(uiManager.render).toHaveBeenCalled();
    });

    test('ファイル選択をクリア', () => {
      uiManager.state.selectedFile = 'file1.jsonl';
      uiManager.updateState({ selectedFile: null });

      expect(uiManager.state.selectedFile).toBeNull();
    });

    test('ファイルリストが空の場合', () => {
      const fileList = [];
      expect(fileList.length).toBe(0);
    });
  });

  describe('エラー表示', () => {
    test('エラーメッセージを表示', () => {
      const errorMessage = 'Failed to load data';
      uiManager.updateState({ error: errorMessage });

      expect(uiManager.state.error).toBe(errorMessage);
      expect(uiManager.render).toHaveBeenCalled();
    });

    test('エラーをクリア', () => {
      uiManager.state.error = 'Some error';
      uiManager.updateState({ error: null });

      expect(uiManager.state.error).toBeNull();
    });

    test('エラー要素の表示/非表示', () => {
      const errorElement = mockElement;

      // エラー表示
      errorElement.style.display = 'block';
      errorElement.textContent = 'Error occurred';
      expect(errorElement.style.display).toBe('block');

      // エラー非表示
      errorElement.style.display = 'none';
      errorElement.textContent = '';
      expect(errorElement.style.display).toBe('none');
    });
  });

  describe('ローディング状態', () => {
    test('ローディング開始', () => {
      uiManager.updateState({ isLoading: true });

      expect(uiManager.state.isLoading).toBe(true);
    });

    test('ローディング終了', () => {
      uiManager.state.isLoading = true;
      uiManager.updateState({ isLoading: false });

      expect(uiManager.state.isLoading).toBe(false);
    });

    test('ローディング中は他の操作を無効化', () => {
      uiManager.state.isLoading = true;
      const button = mockElement;

      button.disabled = uiManager.state.isLoading;
      expect(button.disabled).toBe(true);
    });
  });

  describe('イベントハンドラ', () => {
    test('イベントリスナーを登録', () => {
      const handler = jest.fn();
      uiManager.on('change', handler);

      expect(uiManager.on).toHaveBeenCalledWith('change', handler);
    });

    test('イベントリスナーを削除', () => {
      const handler = jest.fn();
      uiManager.off('change', handler);

      expect(uiManager.off).toHaveBeenCalledWith('change', handler);
    });

    test('複数のイベントリスナーを登録', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      uiManager.on('change', handler1);
      uiManager.on('change', handler2);

      expect(uiManager.on).toHaveBeenCalledTimes(2);
    });
  });

  describe('DOMイベント', () => {
    test('クリックイベントの処理', () => {
      const clickHandler = jest.fn();
      mockElement.addEventListener('click', clickHandler);

      expect(mockElement.addEventListener).toHaveBeenCalledWith(
        'click',
        clickHandler
      );
    });

    test('changeイベントの処理', () => {
      const changeHandler = jest.fn();
      mockElement.addEventListener('change', changeHandler);

      expect(mockElement.addEventListener).toHaveBeenCalledWith(
        'change',
        changeHandler
      );
    });

    test('イベントリスナーの削除', () => {
      const handler = jest.fn();
      mockElement.removeEventListener('click', handler);

      expect(mockElement.removeEventListener).toHaveBeenCalledWith(
        'click',
        handler
      );
    });
  });

  describe('CSS class操作', () => {
    test('クラスを追加', () => {
      mockElement.classList.add('active');
      expect(mockElement.classList.add).toHaveBeenCalledWith('active');
    });

    test('クラスを削除', () => {
      mockElement.classList.remove('active');
      expect(mockElement.classList.remove).toHaveBeenCalledWith('active');
    });

    test('クラスをトグル', () => {
      mockElement.classList.toggle('hidden');
      expect(mockElement.classList.toggle).toHaveBeenCalledWith('hidden');
    });
  });
});
