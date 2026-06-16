/**
 * 桌面版右側明細：點清單列箭頭後，在右側空白區顯示該服務的帳密資訊。
 * 檢視與編輯整合在同一處——以帶框輸入框呈現，一眼可知可編輯；變更後去抖自動儲存。
 */
import { useEffect, useRef, useState } from 'react';
import {
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { CustomField, ServiceEntry } from '@/types/entry';
import { ServiceIcon } from '@/components/ServiceIcon';
import { AutoTextarea } from '@/components/AutoTextarea';
import { newId } from '@/lib/id';
import { toast } from '@/store/toastStore';

interface Props {
  entry: ServiceEntry;
  onSave: (entry: ServiceEntry) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

async function copy(value: string, label: string) {
  if (!value) return;
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

export function EntryDetail({ entry, onSave, onDelete, onClose }: Props) {
  const cred = entry.credentials[0];

  // 本地草稿：以選取項目初始化（父層用 key={entry.id} 確保切換項目時重新掛載）。
  const [service, setService] = useState(entry.service);
  const [url, setUrl] = useState(entry.url ?? '');
  const [username, setUsername] = useState(cred?.username ?? '');
  const [password, setPassword] = useState(cred?.password ?? '');
  const [note, setNote] = useState(cred?.note ?? '');
  const [tags, setTags] = useState(entry.tags.join(', '));
  const [fields, setFields] = useState<CustomField[]>(cred?.fields ?? []);
  const [showPw, setShowPw] = useState(false);
  const [revealField, setRevealField] = useState<Record<string, boolean>>({});

  function buildEntry(): ServiceEntry {
    const cleanFields = fields
      .map((f) => ({ ...f, label: f.label.trim(), value: f.value.trim() }))
      .filter((f) => f.label || f.value);
    return {
      ...entry,
      service: service.trim() || entry.service,
      url: url.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      credentials: [
        {
          id: cred?.id ?? newId(),
          username: username.trim() || undefined,
          password: password || undefined,
          otp: cred?.otp,
          note: note.trim() || undefined,
          fields: cleanFields.length ? cleanFields : undefined,
        },
      ],
      updatedAt: Date.now(),
    };
  }

  // 變更偵測：序列化草稿，與上次已存內容比對，避免無謂寫入。
  const snapshot = JSON.stringify({ service, url, username, password, note, tags, fields });
  const lastSaved = useRef(snapshot);

  // 去抖自動儲存：任何欄位變動後 600ms 無新變更即寫入。
  useEffect(() => {
    if (snapshot === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = snapshot;
      void onSave(buildEntry());
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  function updateField(id: string, patch: Partial<CustomField>) {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  return (
    <div className="flex h-full flex-col">
      {/* 標題列：圖示 + 可編輯服務名稱／網址 */}
      <div className="border-b border-base-300 px-6 py-4">
        <div className="flex w-full items-center gap-3">
          <ServiceIcon entry={entry} className="h-12 w-12 flex-none" />
          <div className="min-w-0 flex-1">
            <input
              className="input input-ghost w-full px-0 text-xl font-bold focus:outline-none"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="服務名稱"
              aria-label="服務名稱"
            />
            <input
              className="input input-ghost h-6 min-h-0 w-full px-0 text-sm text-base-content/60 focus:outline-none"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="網址（選填）"
              inputMode="url"
              aria-label="網址"
            />
          </div>
          <button
            className="btn btn-ghost btn-sm btn-circle touch-target flex-none"
            onClick={onClose}
            aria-label="關閉明細"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* 內容：帶框輸入框的表單，邊複製邊編輯 */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="w-full space-y-4">
          {/* 帳號 */}
          <label className="form-control">
            <span className="label-text mb-1">帳號</span>
            <div className="relative">
              <input
                className="input input-bordered w-full pr-11 touch-target"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ID / Email / 電話"
                autoComplete="off"
              />
              <InputIcon label="複製帳號" onClick={() => void copy(username, '帳號')}>
                <ClipboardDocumentIcon className="h-4 w-4" />
              </InputIcon>
            </div>
          </label>

          {/* 密碼 */}
          <label className="form-control">
            <span className="label-text mb-1">密碼</span>
            <div className="relative">
              <input
                className="input input-bordered w-full pr-20 touch-target"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密碼"
                autoComplete="off"
              />
              <div className="absolute inset-y-0 right-1 my-auto flex items-center">
                <InputIcon
                  label={showPw ? '隱藏密碼' : '顯示密碼'}
                  onClick={() => setShowPw((v) => !v)}
                  inline
                >
                  {showPw ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </InputIcon>
                <InputIcon label="複製密碼" onClick={() => void copy(password, '密碼')} inline>
                  <ClipboardDocumentIcon className="h-4 w-4" />
                </InputIcon>
              </div>
            </div>
          </label>

          {/* 自訂欄位 */}
          {fields.map((f) => (
            <div key={f.id} className="form-control">
              <input
                className="label-text mb-1 w-full bg-transparent text-sm text-base-content/70 focus:outline-none"
                value={f.label}
                onChange={(e) => updateField(f.id, { label: e.target.value })}
                placeholder="欄位名稱"
                aria-label="欄位名稱"
              />
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    className="input input-bordered w-full pr-11 touch-target"
                    type={f.secret && !revealField[f.id] ? 'password' : 'text'}
                    value={f.value}
                    onChange={(e) => updateField(f.id, { value: e.target.value })}
                    placeholder="值"
                    autoComplete="off"
                    aria-label="欄位值"
                  />
                  {f.secret && (
                    <InputIcon
                      label={revealField[f.id] ? '隱藏' : '顯示'}
                      onClick={() =>
                        setRevealField((s) => ({ ...s, [f.id]: !s[f.id] }))
                      }
                    >
                      {revealField[f.id] ? (
                        <EyeSlashIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </InputIcon>
                  )}
                </div>
                <button
                  className={`btn btn-ghost btn-square touch-target ${
                    f.secret ? 'text-primary' : 'text-base-content/40'
                  }`}
                  onClick={() => updateField(f.id, { secret: !f.secret })}
                  aria-label={f.secret ? '取消機密' : '標記為機密'}
                  title={f.secret ? '機密（遮蔽）' : '一般'}
                >
                  {f.secret ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
                <button
                  className="btn btn-ghost btn-square touch-target"
                  onClick={() => void copy(f.value, f.label || '欄位')}
                  aria-label="複製"
                >
                  <ClipboardDocumentIcon className="h-5 w-5" />
                </button>
                <button
                  className="btn btn-ghost btn-square touch-target text-base-content/60"
                  onClick={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}
                  aria-label="移除此欄位"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}

          {/* 備註 */}
          <label className="form-control">
            <span className="label-text mb-1">備註</span>
            <AutoTextarea
              className="textarea textarea-bordered min-h-[3.5rem] w-full text-sm"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="可放較長的復原碼等"
            />
          </label>

          {/* 標籤 */}
          <label className="form-control">
            <span className="label-text mb-1">標籤（逗號分隔）</span>
            <input
              className="input input-bordered w-full touch-target"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="社群, 個人"
            />
          </label>

          <button
            className="btn btn-ghost btn-sm w-full justify-start gap-2 border border-dashed border-base-300"
            onClick={() => setFields((fs) => [...fs, { id: newId(), label: '', value: '' }])}
          >
            <PlusIcon className="h-4 w-4" />
            新增自訂欄位
          </button>

          {/* 底部：刪除 */}
          <div className="border-t border-base-300 pt-4">
            <button
              className="btn btn-ghost btn-sm gap-1 text-error"
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
    </div>
  );
}

/** 嵌在輸入框右側的小圖示鈕（複製 / 顯示密碼）。 */
function InputIcon({
  label,
  onClick,
  inline = false,
  children,
}: {
  label: string;
  onClick: () => void;
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-xs btn-circle text-base-content/60 ${
        inline ? '' : 'absolute inset-y-0 right-1 my-auto'
      }`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
