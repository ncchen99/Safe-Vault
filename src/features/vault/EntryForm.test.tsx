import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntryForm } from './EntryForm';

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
