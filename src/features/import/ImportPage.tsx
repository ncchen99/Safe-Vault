/**
 * 智慧匯入畫面：貼上雜亂文字 → 本機解析 → 逐張確認 → 寫入金庫。
 * 解析全程在裝置本機，不送任何網路請求。
 */
import { useMemo, useState } from 'react';
import { SparklesIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { ResponsiveSheet } from '@/components/ResponsiveSheet';
import { useVaultStore } from '@/store/vaultStore';
import { parseImport, candidateToEntry } from '@/import/pipeline';
import type { ImportCandidate, ImportFields } from '@/types/import';
import { CandidateCard } from './CandidateCard';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Stage = 'paste' | 'review';

interface Row {
  candidate: ImportCandidate;
  included: boolean;
}

const SAMPLE = `Facebook
帳號: me@example.com
密碼: Sup3rS3cret!99
facebook.com

Gmail
user: alice@gmail.com
pass: Hunter2-Goose!`;

export function ImportPage({ open, onClose }: Props) {
  const entries = useVaultStore((s) => s.entries);
  const saveMany = useVaultStore((s) => s.saveMany);

  const [stage, setStage] = useState<Stage>('paste');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  function reset() {
    setStage('paste');
    setText('');
    setRows([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function parse() {
    const cands = parseImport(text, entries);
    setRows(cands.map((c) => ({ candidate: c, included: !c.duplicateOf })));
    setStage('review');
  }

  function setIncluded(id: string, included: boolean) {
    setRows((rs) =>
      rs.map((r) => (r.candidate.id === id ? { ...r, included } : r)),
    );
  }

  function setFields(id: string, fields: ImportFields) {
    setRows((rs) =>
      rs.map((r) =>
        r.candidate.id === id
          ? { ...r, candidate: { ...r.candidate, fields } }
          : r,
      ),
    );
  }

  const selectedCount = useMemo(
    () => rows.filter((r) => r.included && r.candidate.fields.service?.trim()).length,
    [rows],
  );

  async function confirm() {
    if (!selectedCount || busy) return;
    setBusy(true);
    try {
      const toSave = rows
        .filter((r) => r.included && r.candidate.fields.service?.trim())
        .map((r) => candidateToEntry(r.candidate));
      await saveMany(toSave);
      handleClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveSheet open={open} title="智慧匯入" onClose={handleClose}>
      {stage === 'paste' ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-base-content/70">
            <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            貼上任意格式的帳密文字，於<strong className="mx-1">本機</strong>
            解析後逐筆確認。內容不會離開此裝置。
          </p>
          <textarea
            className="textarea textarea-bordered h-56 w-full font-mono text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={SAMPLE}
            aria-label="貼上要匯入的文字"
          />
          <div className="flex gap-3">
            <button
              type="button"
              className="btn btn-ghost flex-1 touch-target"
              onClick={() => setText(SAMPLE)}
            >
              填入範例
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1 touch-target"
              onClick={parse}
              disabled={!text.trim()}
            >
              <SparklesIcon className="h-5 w-5" />
              解析
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-base-content/60">
              <p>無法從文字中辨識出任何條目。</p>
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-3"
                onClick={() => setStage('paste')}
              >
                返回重貼
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-base-content/70">
                辨識到 {rows.length} 筆，請確認後匯入。標示
                <span className="badge badge-warning badge-sm mx-1">需確認</span>
                者請特別檢查。
              </p>
              <ul className="divide-y divide-base-300">
                {rows.map((r) => (
                  <CandidateCard
                    key={r.candidate.id}
                    candidate={r.candidate}
                    included={r.included}
                    onToggle={(v) => setIncluded(r.candidate.id, v)}
                    onChange={(f) => setFields(r.candidate.id, f)}
                  />
                ))}
              </ul>
              <div className="sticky bottom-0 flex gap-3 bg-base-100 pt-2">
                <button
                  type="button"
                  className="btn btn-ghost flex-1 touch-target"
                  onClick={() => setStage('paste')}
                >
                  返回
                </button>
                <button
                  type="button"
                  className="btn btn-primary flex-1 touch-target"
                  onClick={confirm}
                  disabled={!selectedCount || busy}
                >
                  {busy ? (
                    <span className="loading loading-spinner" />
                  ) : (
                    `匯入 ${selectedCount} 筆`
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </ResponsiveSheet>
  );
}
