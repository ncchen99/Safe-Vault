/**
 * 單張匯入候選卡：顯示解析猜測，低信心欄位高亮，使用者可逐欄編輯或整筆略過。
 * 「AI 猜測、使用者確認」——絕不自動寫入。
 */
import { useState } from 'react';
import {
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { FieldKey, ImportCandidate, ImportFields } from '@/types/import';

interface Props {
  candidate: ImportCandidate;
  included: boolean;
  onToggle: (included: boolean) => void;
  onChange: (fields: ImportFields) => void;
}

const FIELD_META: { key: FieldKey; label: string; type?: string }[] = [
  { key: 'service', label: '服務名稱' },
  { key: 'username', label: '帳號' },
  { key: 'password', label: '密碼', type: 'password' },
  { key: 'url', label: '網址' },
  { key: 'otp', label: 'OTP / 2FA' },
  { key: 'note', label: '備註' },
];

export function CandidateCard({ candidate, included, onToggle, onChange }: Props) {
  const [showPw, setShowPw] = useState(false);
  const { fields, confidence, duplicateOf, needsReview } = candidate;

  function update(key: FieldKey, value: string) {
    onChange({ ...fields, [key]: value });
  }

  function updateCustom(i: number, patch: Partial<{ label: string; value: string; secret: boolean }>) {
    const next = (fields.fields ?? []).map((f, j) => (j === i ? { ...f, ...patch } : f));
    onChange({ ...fields, fields: next });
  }

  function removeCustom(i: number) {
    const next = (fields.fields ?? []).filter((_, j) => j !== i);
    onChange({ ...fields, fields: next.length ? next : undefined });
  }

  return (
    <li className={`py-4 ${included ? '' : 'opacity-50'}`}>
      {/* 整個標題列可點選切換是否匯入；checkbox 維持正常大小（不套 touch-target 放大） */}
      <label className="mb-3 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="checkbox checkbox-primary checkbox-sm mt-0.5 flex-none"
          checked={included}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label="是否匯入此筆"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">
              {fields.service?.trim() || '（未命名）'}
            </span>
            {needsReview && (
              <span className="badge badge-warning badge-sm gap-1 whitespace-nowrap">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                需確認
              </span>
            )}
          </div>
          {duplicateOf && (
            <p className="mt-1 text-xs text-warning">
              疑似與既有條目「{duplicateOf}」重複
            </p>
          )}
        </div>
      </label>

      <div className="grid gap-2 pl-8">
        {FIELD_META.map(({ key, label, type }) => {
          const value = fields[key] ?? '';
          const conf = confidence[key];
          const low = conf !== undefined && conf < 0.6;
          const isPw = type === 'password';
          return (
            <label key={key} className="form-control">
              <span className="mb-0.5 flex items-center gap-1.5 text-xs text-base-content/60">
                {label}
                {conf !== undefined && (
                  <span
                    className={`badge badge-xs ${low ? 'badge-warning' : 'badge-ghost'}`}
                    title={`信心 ${Math.round(conf * 100)}%`}
                  >
                    {Math.round(conf * 100)}%
                  </span>
                )}
              </span>
              <div className="relative">
                <input
                  className={`input input-bordered input-sm w-full touch-target ${
                    isPw ? 'pr-10' : ''
                  } ${low ? 'input-warning' : ''}`}
                  type={isPw && !showPw ? 'password' : 'text'}
                  value={value}
                  onChange={(e) => update(key, e.target.value)}
                  placeholder={key === 'service' ? '必填' : '（空）'}
                  autoComplete="off"
                />
                {isPw && value && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-circle absolute right-1 inset-y-0 my-auto"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? '隱藏密碼' : '顯示密碼'}
                  >
                    {showPw ? (
                      <EyeSlashIcon className="h-4 w-4" />
                    ) : (
                      <EyeIcon className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </label>
          );
        })}

        {/* 自訂欄位：標籤未命中字典的雜項（理財密碼、卡片密碼、電話…） */}
        {(fields.fields ?? []).map((f, i) => (
          <div key={i} className="flex items-end gap-1.5">
            <input
              className="input input-bordered input-sm w-28 flex-none touch-target"
              value={f.label}
              onChange={(e) => updateCustom(i, { label: e.target.value })}
              placeholder="標籤"
              autoComplete="off"
            />
            <input
              className="input input-bordered input-sm w-full flex-1 touch-target"
              type={f.secret ? 'password' : 'text'}
              value={f.value}
              onChange={(e) => updateCustom(i, { value: e.target.value })}
              placeholder="值"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square touch-target"
              onClick={() => removeCustom(i)}
              aria-label="移除此欄位"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </li>
  );
}
