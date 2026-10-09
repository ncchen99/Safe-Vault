import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntryForm, UNTITLED_SERVICE } from './EntryForm';
import { useVaultStore } from '@/store/vaultStore';

describe('EntryForm 密碼產生按鈕', () => {
  it('密碼為空時顯示 Generate 按鈕，點擊後自動產生符合規格的 10 位密碼', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <EntryForm
        open={true}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    const generateBtn = screen.getByRole('button', { name: '產生密碼' });
    expect(generateBtn).toBeInTheDocument();

    const pwInput = screen.getByPlaceholderText('密碼') as HTMLInputElement;
    expect(pwInput.value).toBe('');

    // 點擊 Generate 按鈕
    fireEvent.click(generateBtn);

    // 驗證產生的密碼為 10 位長，且包含大寫字母、小寫字母、數字與符號
    expect(pwInput.value).toHaveLength(10);
    expect(/[A-Z]/.test(pwInput.value)).toBe(true);
    expect(/[a-z]/.test(pwInput.value)).toBe(true);
    expect(/[0-9]/.test(pwInput.value)).toBe(true);
    expect(/[^a-zA-Z0-9]/.test(pwInput.value)).toBe(true);

    // 密碼非空後，Generate 按鈕應消失
    expect(screen.queryByRole('button', { name: '產生密碼' })).not.toBeInTheDocument();

    // 清空密碼後，Generate 按鈕應重新出現
    fireEvent.change(pwInput, { target: { value: '' } });
    expect(screen.getByRole('button', { name: '產生密碼' })).toBeInTheDocument();
  });
});

describe('EntryForm 自動儲存', () => {
  it('開始輸入後自動儲存，且多次儲存都寫入同一筆', async () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<EntryForm open onSave={onSave} onClose={vi.fn()} />);

      // 尚未輸入任何內容 → 不儲存
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(onSave).not.toHaveBeenCalled();

      fireEvent.change(screen.getByPlaceholderText('密碼'), {
        target: { value: 'secret' },
      });
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(onSave).toHaveBeenCalledTimes(1);
      const first = onSave.mock.calls[0][0];
      // 未填服務名稱也要存下來，避免遺失
      expect(first.service).toBe(UNTITLED_SERVICE);
      expect(first.credentials[0].password).toBe('secret');

      fireEvent.change(screen.getByPlaceholderText(/例如 Facebook/), {
        target: { value: 'My Site' },
      });
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave.mock.calls[1][0].id).toBe(first.id);
      expect(onSave.mock.calls[1][0].service).toBe('My Site');
    } finally {
      vi.useRealTimers();
    }
  });

  it('關閉表單時立即寫入尚未儲存的變更', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<EntryForm open onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('密碼'), {
      target: { value: 'typed-then-closed' },
    });
    expect(onSave).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].credentials[0].password).toBe('typed-then-closed');
  });

  it('金庫上鎖前先寫入草稿', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    useVaultStore.setState({ status: 'unlocked' });
    render(<EntryForm open onSave={onSave} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('密碼'), {
      target: { value: 'before-lock' },
    });
    await act(() => useVaultStore.getState().lock());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(useVaultStore.getState().status).toBe('locked');
  });
});
