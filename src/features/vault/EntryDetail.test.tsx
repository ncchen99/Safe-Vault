import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntryDetail } from './EntryDetail';
import type { ServiceEntry } from '@/types/entry';

function createSampleEntry(password?: string): ServiceEntry {
  return {
    id: 'test-1',
    service: 'Test Service',
    aliases: [],
    tags: [],
    credentials: [
      {
        id: 'c-1',
        username: 'user1',
        password,
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('EntryDetail 密碼產生按鈕', () => {
  it('密碼為空時顯示 Generate 按鈕，點擊後產生 10 位密碼', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();

    render(
      <EntryDetail
        entry={createSampleEntry(undefined)}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );

    const generateBtn = screen.getByRole('button', { name: '產生密碼' });
    expect(generateBtn).toBeInTheDocument();

    const pwInput = screen.getByPlaceholderText('密碼') as HTMLInputElement;
    expect(pwInput.value).toBe('');

    fireEvent.click(generateBtn);

    expect(pwInput.value).toHaveLength(10);
    expect(/[A-Z]/.test(pwInput.value)).toBe(true);
    expect(/[a-z]/.test(pwInput.value)).toBe(true);
    expect(/[0-9]/.test(pwInput.value)).toBe(true);
    expect(/[^a-zA-Z0-9]/.test(pwInput.value)).toBe(true);

    expect(screen.queryByRole('button', { name: '產生密碼' })).not.toBeInTheDocument();
  });

  it('密碼已有值時不顯示 Generate 按鈕，清空後出現', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();

    render(
      <EntryDetail
        entry={createSampleEntry('existingPass123')}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );

    expect(screen.queryByRole('button', { name: '產生密碼' })).not.toBeInTheDocument();

    const pwInput = screen.getByPlaceholderText('密碼') as HTMLInputElement;
    fireEvent.change(pwInput, { target: { value: '' } });

    expect(screen.getByRole('button', { name: '產生密碼' })).toBeInTheDocument();
  });
});
