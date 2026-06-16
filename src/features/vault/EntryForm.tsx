import { useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { CustomField, ServiceEntry } from '@/types/entry';
import { AutoTextarea } from '@/components/AutoTextarea';
import { ResponsiveSheet } from '@/components/ResponsiveSheet';
import { canonicalServiceName } from '@/icons/match';
import { newId } from '@/lib/id';

interface Props {
  open: boolean;
  initial?: ServiceEntry;
  onClose: () => void;
  onSave: (entry: ServiceEntry) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function EntryForm({ open, initial, onClose, onSave, onDelete }: Props) {
  // 單一帳密：服務名稱 + 一組帳號/密碼/備註 + 自訂欄位。
  const cred0 = initial?.credentials?.[0];
  const [service, setService] = useState(initial?.service ?? '');
  const [username, setUsername] = useState(cred0?.username ?? '');
  const [password, setPassword] = useState(cred0?.password ?? '');
  const [note, setNote] = useState(cred0?.note ?? '');
  const [fields, setFields] = useState<CustomField[]>(cred0?.fields ?? []);
  const [url, setUrl] = useState(initial?.url ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));

  const [showPw, setShowPw] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [noteOpen, setNoteOpen] = useState(Boolean(cred0?.note));
  const [advOpen, setAdvOpen] = useState(Boolean(initial?.url || initial?.tags?.length));
  const [busy, setBusy] = useState(false);

  function updateField(id: string, patch: Partial<CustomField>) {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  /** 服務名正規化：FB / 臉書 / Gmail → Facebook / Google 帳號（失焦時套用）。 */
  function normalizeService() {
    const canon = canonicalServiceName(service);
    if (canon && canon.name !== service.trim()) setService(canon.name);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!service.trim() || busy) return;
    setBusy(true);
    const now = Date.now();

    const raw = service.trim();
    const canon = canonicalServiceName(raw);
    const name = canon?.name ?? raw;
    const aliases = [...(initial?.aliases ?? [])];
    if (canon && canon.name !== raw && !aliases.includes(raw)) aliases.push(raw);

    const cleanFields = fields
      .map((f) => ({ ...f, label: f.label.trim(), value: f.value.trim() }))
      .filter((f) => f.label || f.value);

    const entry: ServiceEntry = {
      id: initial?.id ?? newId(),
      service: name,
      aliases,
      url: url.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      credentials: [
        {
          id: cred0?.id ?? newId(),
          username: username.trim() || undefined,
          password: password || undefined,
          otp: cred0?.otp,
          note: note.trim() || undefined,
          fields: cleanFields.length ? cleanFields : undefined,
        },
      ],
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await onSave(entry);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const saveButton = (
    <button
      type="submit"
      form="entry-form"
      className="btn btn-primary btn-sm gap-1 touch-target"
      disabled={!service.trim() || busy}
    >
      {busy ? (
        <span className="loading loading-spinner loading-sm" />
      ) : (
        <>
          <CheckIcon className="h-5 w-5" />
          儲存
        </>
      )}
    </button>
  );

  return (
    <ResponsiveSheet
      open={open}
      title={initial ? '編輯條目' : '新增條目'}
      onClose={onClose}
      headerAction={saveButton}
    >
      <form id="entry-form" onSubmit={onSubmit} className="space-y-4">
        <label className="form-control">
          <span className="label-text mb-1">服務名稱 *</span>
          <input
            className="input input-bordered touch-target"
            value={service}
            onChange={(e) => setService(e.target.value)}
            onBlur={normalizeService}
            placeholder="例如 Facebook（可輸入 FB、臉書、Gmail）"
            autoFocus
            required
          />
        </label>

        <label className="form-control">
          <span className="label-text mb-1">帳號</span>
          <input
            className="input input-bordered touch-target"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ID / Email / 電話皆可"
            autoComplete="off"
          />
        </label>

        <label className="form-control">
          <span className="label-text mb-1">密碼</span>
          <div className="relative">
            <input
              className="input input-bordered w-full pr-10 touch-target"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密碼"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-circle absolute right-1 inset-y-0 my-auto"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? '隱藏密碼' : '顯示密碼'}
            >
              {showPw ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {/* 自訂欄位：理財密碼 / 卡片密碼 / 電話 / 代號… */}
        {fields.map((f) => (
          <div key={f.id} className="flex items-center gap-1.5">
            <input
              className="input input-bordered input-sm w-28 flex-none touch-target"
              value={f.label}
              onChange={(e) => updateField(f.id, { label: e.target.value })}
              placeholder="標籤"
              autoComplete="off"
            />
            <div className="relative flex-1">
              <input
                className="input input-bordered input-sm w-full pr-8 touch-target"
                type={f.secret && !reveal[f.id] ? 'password' : 'text'}
                value={f.value}
                onChange={(e) => updateField(f.id, { value: e.target.value })}
                placeholder="值"
                autoComplete="off"
              />
              {f.secret && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle absolute right-0.5 inset-y-0 my-auto"
                  onClick={() => setReveal((s) => ({ ...s, [f.id]: !s[f.id] }))}
                  aria-label={reveal[f.id] ? '隱藏' : '顯示'}
                >
                  {reveal[f.id] ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              )}
            </div>
            <button
              type="button"
              className={`btn btn-ghost btn-xs btn-square touch-target ${
                f.secret ? 'text-primary' : 'text-base-content/40'
              }`}
              onClick={() => updateField(f.id, { secret: !f.secret })}
              aria-label={f.secret ? '取消機密' : '標記為機密'}
              title={f.secret ? '機密（遮蔽）' : '一般'}
            >
              {f.secret ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square touch-target"
              onClick={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}
              aria-label="移除此欄位"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setFields((fs) => [...fs, { id: newId(), label: '', value: '' }])}
          >
            <PlusIcon className="h-4 w-4" />
            自訂欄位
          </button>
          {!noteOpen && !note && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setNoteOpen(true)}
            >
              <PlusIcon className="h-4 w-4" />
              備註
            </button>
          )}
        </div>

        {(noteOpen || note) && (
          <AutoTextarea
            className="textarea textarea-bordered min-h-[3.5rem] w-full text-sm"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備註（可放較長的復原碼等）"
          />
        )}

        {/* 進階：網址、標籤（預設收合） */}
        <div className="border-t border-base-300 pt-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm w-full justify-between"
            onClick={() => setAdvOpen((v) => !v)}
            aria-expanded={advOpen}
          >
            <span>進階（網址、標籤）</span>
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform ${advOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {advOpen && (
            <div className="space-y-3 pt-2">
              <label className="form-control">
                <span className="label-text mb-1">網址</span>
                <input
                  className="input input-bordered touch-target"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="facebook.com"
                  inputMode="url"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">標籤（逗號分隔）</span>
                <input
                  className="input input-bordered touch-target"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="社群, 個人"
                />
              </label>
            </div>
          )}
        </div>

        {initial && onDelete && (
          <button
            type="button"
            className="btn btn-ghost btn-sm w-full text-error"
            onClick={async () => {
              if (confirm(`確定要刪除「${initial.service}」？此動作無法復原。`)) {
                await onDelete(initial.id);
                onClose();
              }
            }}
          >
            <TrashIcon className="h-4 w-4" />
            刪除此條目
          </button>
        )}
      </form>
    </ResponsiveSheet>
  );
}
