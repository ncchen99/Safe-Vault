import { useMemo, useState } from 'react';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  LockClosedIcon,
  MoonIcon,
  SunIcon,
  ArrowDownOnSquareIcon,
  FingerPrintIcon,
} from '@heroicons/react/24/outline';
import { ShieldCheckIcon } from '@heroicons/react/24/solid';
import type { ServiceEntry } from '@/types/entry';
import { useVaultStore } from '@/store/vaultStore';
import { searchEntries } from '@/search/searchEntries';
import { useTheme } from '@/app/useTheme';
import { EntryRow } from './EntryRow';
import { EntryForm } from './EntryForm';
import { ImportPage } from '@/features/import/ImportPage';
import { SyncControls } from '@/features/sync/SyncControls';

export function VaultPage() {
  const entries = useVaultStore((s) => s.entries);
  const saveEntry = useVaultStore((s) => s.saveEntry);
  const removeEntry = useVaultStore((s) => s.removeEntry);
  const lock = useVaultStore((s) => s.lock);
  const touch = useVaultStore((s) => s.touch);
  const passkeySupported = useVaultStore((s) => s.passkeySupported);
  const hasPasskey = useVaultStore((s) => s.hasPasskey);
  const enablePasskey = useVaultStore((s) => s.enablePasskey);
  const disablePasskey = useVaultStore((s) => s.disablePasskey);
  const { mode, toggle } = useTheme();

  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceEntry | undefined>();
  const [bioBusy, setBioBusy] = useState(false);

  async function toggleBio() {
    if (bioBusy) return;
    setBioBusy(true);
    try {
      if (hasPasskey) {
        if (confirm('要停用指紋解鎖嗎？之後改用主密碼解鎖。')) await disablePasskey();
      } else {
        await enablePasskey(); // 觸發系統指紋/Face 註冊
        alert('已啟用指紋解鎖，下次開啟可用指紋快速解鎖。');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '指紋設定失敗');
    } finally {
      setBioBusy(false);
    }
  }

  const results = useMemo(
    () => searchEntries(query, entries).map((h) => h.entry),
    [query, entries],
  );

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }
  function openEdit(entry: ServiceEntry) {
    setEditing(entry);
    setFormOpen(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col" onClick={touch}>
      {/* 頂部列 */}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur">
        <ShieldCheckIcon className="h-6 w-6 text-primary" />
        <h1 className="flex-1 text-lg font-bold">SafeVault</h1>
        <SyncControls />
        {passkeySupported && (
          <button
            className={`btn btn-ghost btn-sm btn-circle touch-target ${
              hasPasskey ? 'text-primary' : ''
            }`}
            onClick={toggleBio}
            disabled={bioBusy}
            aria-label={hasPasskey ? '指紋解鎖已啟用（點擊停用）' : '啟用指紋解鎖'}
            title={hasPasskey ? '指紋解鎖已啟用' : '啟用指紋解鎖'}
          >
            {bioBusy ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <FingerPrintIcon className="h-5 w-5" />
            )}
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm btn-circle touch-target"
          onClick={toggle}
          aria-label={mode === 'dark' ? '切換淺色' : '切換深色'}
        >
          {mode === 'dark' ? (
            <SunIcon className="h-5 w-5" />
          ) : (
            <MoonIcon className="h-5 w-5" />
          )}
        </button>
        <button
          className="btn btn-ghost btn-sm btn-circle touch-target"
          onClick={lock}
          aria-label="鎖定金庫"
        >
          <LockClosedIcon className="h-5 w-5" />
        </button>
      </header>

      {/* 搜尋 */}
      <div className="px-4 py-3">
        <label className="input input-bordered flex items-center gap-2 touch-target">
          <MagnifyingGlassIcon className="h-5 w-5 text-base-content/50" />
          <input
            type="search"
            className="grow"
            placeholder="搜尋服務（臉書 / FB / 網銀 / 串流…）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜尋"
          />
        </label>
      </div>

      {/* 清單：以分隔線取代卡片（需求 6.2） */}
      <main className="flex-1 pb-28">
        {results.length === 0 ? (
          <EmptyState
            hasEntries={entries.length > 0}
            onAdd={openNew}
            onImport={() => setImportOpen(true)}
          />
        ) : (
          <ul className="divide-y divide-base-300">
            {results.map((entry) => (
              <EntryRow key={entry.id} entry={entry} onOpen={openEdit} />
            ))}
          </ul>
        )}
      </main>

      {/* 底部固定動作列：一條橫切兩半，左匯入 / 右新增（無內距、填滿） */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl border-t border-base-300 bg-base-100/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-2 divide-x divide-base-300">
          <button
            className="btn btn-ghost h-14 gap-2 touch-target"
            onClick={() => setImportOpen(true)}
            title="智慧匯入"
          >
            <ArrowDownOnSquareIcon className="h-5 w-5" />
            匯入
          </button>
          <button
            className="btn btn-ghost h-14 gap-2 font-semibold touch-target"
            onClick={openNew}
          >
            <PlusIcon className="h-5 w-5" />
            新增
          </button>
        </div>
      </nav>

      {/* 開啟時才掛載，確保每次開啟都是乾淨的表單狀態（含切換編輯對象） */}
      {formOpen && (
        <EntryForm
          open
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSave={saveEntry}
          onDelete={removeEntry}
        />
      )}

      {importOpen && <ImportPage open onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function EmptyState({
  hasEntries,
  onAdd,
  onImport,
}: {
  hasEntries: boolean;
  onAdd: () => void;
  onImport: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <ShieldCheckIcon className="mb-4 h-14 w-14 text-base-content/20" />
      <p className="text-base-content/60">
        {hasEntries ? '找不到符合的條目' : '金庫是空的，從這裡開始吧'}
      </p>
      {!hasEntries && (
        <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
          <button className="btn btn-primary touch-target" onClick={onImport}>
            <ArrowDownOnSquareIcon className="h-5 w-5" />
            從文字編輯器一鍵匯入
          </button>
          <button className="btn btn-ghost touch-target" onClick={onAdd}>
            <PlusIcon className="h-5 w-5" />
            手動新增一筆
          </button>
        </div>
      )}
    </div>
  );
}
