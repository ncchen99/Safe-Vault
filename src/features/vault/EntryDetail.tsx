/**
 * 桌面版右側明細：點清單列箭頭後，在右側空白區顯示該服務的帳密資訊。
 * 唯讀檢視 + 複製 / 顯示密碼；編輯沿用既有 EntryForm 表單。
 */
import { useState } from 'react';
import {
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { ServiceEntry } from '@/types/entry';
import { ServiceIcon } from '@/components/ServiceIcon';
import { toast } from '@/store/toastStore';

interface Props {
  entry: ServiceEntry;
  onEdit: (entry: ServiceEntry) => void;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    toast('複製失敗，請手動選取複製', 'error');
    return;
  }
  toast(`已複製${label}`);
  // 安全：30 秒後嘗試清空剪貼簿
  setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
}

export function EntryDetail({ entry, onEdit, onDelete, onClose }: Props) {
  const cred = entry.credentials[0];

  return (
    <div className="flex h-full flex-col">
      {/* 標題列 */}
      <div className="border-b border-base-300 py-4">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-6">
          <ServiceIcon entry={entry} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-bold">{entry.service}</div>
            {entry.url && (
              <a
                href={/^https?:\/\//.test(entry.url) ? entry.url : `https://${entry.url}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-sm text-base-content/50 hover:underline"
              >
                {entry.url}
              </a>
            )}
          </div>
          <button
            className="btn btn-ghost btn-sm gap-1 touch-target"
            onClick={() => onEdit(entry)}
          >
            <PencilSquareIcon className="h-5 w-5" />
            編輯
          </button>
          <button
            className="btn btn-ghost btn-sm btn-circle touch-target"
            onClick={onClose}
            aria-label="關閉明細"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 內容 */}
      <div className="flex-1 overflow-y-auto py-5">
        <div className="mx-auto max-w-xl space-y-3 px-6">
          {cred?.username && (
            <FieldRow label="帳號" value={cred.username} copyLabel="帳號" />
          )}
          {cred?.password && (
            <FieldRow label="密碼" value={cred.password} copyLabel="密碼" secret />
          )}
          {cred?.fields?.map((f) => (
            <FieldRow
              key={f.id}
              label={f.label || '欄位'}
              value={f.value}
              copyLabel={f.label || '欄位'}
              secret={f.secret}
            />
          ))}
          {cred?.note && (
            <div className="border border-base-300 bg-base-100 px-4 py-3">
              <div className="mb-1 text-xs text-base-content/50">備註</div>
              <p className="whitespace-pre-wrap break-words text-sm">{cred.note}</p>
            </div>
          )}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {entry.tags.map((t) => (
                <span key={t} className="badge badge-outline">
                  {t}
                </span>
              ))}
            </div>
          )}
          {!cred?.username && !cred?.password && !cred?.fields?.length && (
            <p className="text-sm text-base-content/50">此項目尚未填寫帳號或密碼。</p>
          )}

          <button
            className="btn btn-ghost btn-sm mt-8 text-error"
            onClick={async () => {
              if (confirm(`確定要刪除「${entry.service}」？此動作無法復原。`)) {
                await onDelete(entry.id);
              }
            }}
          >
            <TrashIcon className="h-4 w-4" />
            刪除此項目
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  copyLabel,
  secret = false,
}: {
  label: string;
  value: string;
  copyLabel: string;
  secret?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const shown = secret && !reveal ? '••••••••••' : value;

  return (
    <div className="flex items-center gap-2 border border-base-300 bg-base-100 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-base-content/50">{label}</div>
        <div
          className={`truncate ${secret && !reveal ? 'tracking-widest' : 'break-all'}`}
        >
          {shown}
        </div>
      </div>
      {secret && (
        <button
          className="btn btn-ghost btn-sm btn-square touch-target"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? '隱藏' : '顯示'}
        >
          {reveal ? (
            <EyeSlashIcon className="h-5 w-5" />
          ) : (
            <EyeIcon className="h-5 w-5" />
          )}
        </button>
      )}
      <button
        className="btn btn-ghost btn-sm btn-square touch-target"
        onClick={() => void copy(value, copyLabel)}
        aria-label={`複製${copyLabel}`}
      >
        <ClipboardDocumentIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
