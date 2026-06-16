import { useMemo, useState } from 'react';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  MoonIcon,
  SunIcon,
  ArrowDownOnSquareIcon,
} from '@heroicons/react/24/outline';
import { ShieldCheckIcon } from '@heroicons/react/24/solid';
import type { ServiceEntry } from '@/types/entry';
import { useVaultStore } from '@/store/vaultStore';
import { useAuthStore } from '@/store/authStore';
import { useMediaQuery } from '@/app/useMediaQuery';
import { searchEntries } from '@/search/searchEntries';
import { useTheme } from '@/app/useTheme';
import { Avatar } from '@/components/Avatar';
import { EntryRow } from './EntryRow';
import { EntryForm } from './EntryForm';
import { EntryDetail } from './EntryDetail';
import { SortControl, type SortKey } from './SortControl';
import { ImportPage } from '@/features/import/ImportPage';
import { ProfilePage } from '@/features/profile/ProfilePage';

type View = 'list' | 'profile';

const SORT_STORAGE_KEY = 'vault.sort';

function loadSort(): SortKey {
  return localStorage.getItem(SORT_STORAGE_KEY) === 'name' ? 'name' : 'recent';
}

/** 依使用者選擇排序；name 用 localeCompare（繁中／英文皆合理），recent 用 updatedAt 由新到舊。 */
function sortEntries(entries: ServiceEntry[], sort: SortKey): ServiceEntry[] {
  const sorted = [...entries];
  if (sort === 'name') {
    sorted.sort((a, b) =>
      a.service.localeCompare(b.service, 'zh-Hant', {
        sensitivity: 'base',
        numeric: true,
      }),
    );
  } else {
    sorted.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return sorted;
}

export function VaultPage() {
  const entries = useVaultStore((s) => s.entries);
  const saveEntry = useVaultStore((s) => s.saveEntry);
  const removeEntry = useVaultStore((s) => s.removeEntry);
  const touch = useVaultStore((s) => s.touch);
  const { mode, toggle } = useTheme();

  // 桌面（≥1024px）才有右側明細欄；平板 / 手機點箭頭仍沿用全頁表單。
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [view, setView] = useState<View>('list');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceEntry | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>(loadSort);

  function changeSort(key: SortKey) {
    setSort(key);
    localStorage.setItem(SORT_STORAGE_KEY, key);
  }

  // 無查詢時依使用者選擇排序；有查詢時保留相關性排序（最符合的在前）。
  const results = useMemo(() => {
    const hits = searchEntries(query, entries).map((h) => h.entry);
    return query.trim() ? hits : sortEntries(hits, sort);
  }, [query, entries, sort]);

  // 由 id 取得目前選取項目；若已被刪除/不存在則右側顯示概況。
  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }
  function openEdit(entry: ServiceEntry) {
    setEditing(entry);
    setFormOpen(true);
  }
  /** 點清單列箭頭：桌面 → 右側明細；平板/手機 → 全頁表單。 */
  function openEntry(entry: ServiceEntry) {
    if (isDesktop) setSelectedId(entry.id);
    else openEdit(entry);
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row" onClick={touch}>
      {/* 側邊欄：平板僅 icon 細條，桌面展開為完整側欄 */}
      <DesktopSidebar
        mode={mode}
        onToggleTheme={toggle}
        onNew={openNew}
        onImport={() => setImportOpen(true)}
        onProfile={() => setView('profile')}
      />

      {view === 'profile' ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <ProfilePage onBack={() => setView('list')} />
        </div>
      ) : (
        <>
          {/* 清單欄：桌面固定較窄寬度，留出右側給明細 */}
          <div className="flex min-w-0 flex-1 flex-col lg:flex-[3] lg:border-r lg:border-base-300">
            {/* 手機頂部列（桌面/平板由側邊欄取代）：左邊 Brand，右邊主題切換與頭像 */}
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur md:hidden">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="h-6 w-6 text-primary" />
                <h1 className="text-lg font-bold">SafeVault</h1>
              </div>
              <div className="flex items-center gap-2">
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
                <Avatar onClick={() => setView('profile')} />
              </div>
            </header>

            {/* 搜尋（與下方清單同寬、靠左對齊） */}
            <div className="px-4 pt-4 md:px-6 md:pt-6">
              <h2 className="mb-3 hidden text-2xl font-bold md:block">所有項目</h2>
              <label className="input input-bordered flex w-full items-center gap-2 touch-target">
                <MagnifyingGlassIcon className="h-5 w-5 text-base-content/50" />
                <input
                  type="search"
                  className="grow"
                  placeholder="搜尋服務（臉書 / FB / 網銀…）"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="搜尋"
                />
              </label>
            </div>

            {/* 排序列：僅在未搜尋且有多筆時顯示（搜尋時以相關性排序） */}
            {!query.trim() && results.length > 1 && (
              <div className="flex items-center justify-end px-4 pt-2 md:px-6">
                <SortControl value={sort} onChange={changeSort} />
              </div>
            )}

            {/* 清單：以分隔線取代卡片，外框與搜尋框等寬 */}
            <main className="flex-1 px-4 pb-28 pt-4 md:px-6 md:pb-8">
              {results.length === 0 ? (
                <EmptyState
                  hasEntries={entries.length > 0}
                  onAdd={openNew}
                  onImport={() => setImportOpen(true)}
                />
              ) : (
                <ul className="divide-y divide-base-300 border border-base-300">
                  {results.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      onOpen={openEntry}
                      selected={isDesktop && entry.id === selectedId}
                    />
                  ))}
                </ul>
              )}
            </main>

            {/* 手機底部固定動作列（桌面/平板由側邊欄取代） */}
            <nav
              className="fixed inset-x-0 bottom-0 z-20 border-t border-base-300 bg-base-100/95 backdrop-blur md:hidden"
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
          </div>

          {/* 桌面右側欄：選取項目 → 顯示帳密明細；未選取 → 顯示金庫概況 */}
          <aside className="sticky top-0 hidden h-dvh min-w-0 flex-1 flex-col bg-base-100 lg:flex lg:flex-[2]">
            {selected ? (
              <EntryDetail
                key={selected.id}
                entry={selected}
                onSave={saveEntry}
                onDelete={async (id) => {
                  await removeEntry(id);
                  setSelectedId(null);
                }}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <Overview entries={entries} />
            )}
          </aside>
        </>
      )}

      {/* 開啟時才掛載，確保每次開啟都是乾淨的表單狀態 */}
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

/** 側邊欄：平板（md）僅 icon 細條，桌面（lg）展開為含文字的完整側欄。 */
function DesktopSidebar({
  mode,
  onToggleTheme,
  onNew,
  onImport,
  onProfile,
}: {
  mode: string;
  onToggleTheme: () => void;
  onNew: () => void;
  onImport: () => void;
  onProfile: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-none flex-col border-r border-base-300 bg-base-100 py-6 md:flex md:w-16 md:px-2 lg:w-64 lg:px-4">
      <div className="mb-8 flex items-center gap-2 md:justify-center lg:justify-start lg:px-2">
        <ShieldCheckIcon className="h-7 w-7 flex-none text-primary" />
        <span className="hidden text-xl font-bold lg:inline">SafeVault</span>
      </div>

      <div className="flex flex-col gap-2">
        <button
          className="btn btn-primary w-full justify-center gap-2 touch-target lg:justify-start"
          onClick={onNew}
          title="新增項目"
        >
          <PlusIcon className="h-5 w-5 flex-none" />
          <span className="hidden lg:inline">新增項目</span>
        </button>
        <button
          className="btn btn-ghost w-full justify-center gap-2 touch-target lg:justify-start"
          onClick={onImport}
          title="智慧匯入"
        >
          <ArrowDownOnSquareIcon className="h-5 w-5 flex-none" />
          <span className="hidden lg:inline">智慧匯入</span>
        </button>
      </div>

      {/* 底部：主題切換 + 頭像（進入個人設定） */}
      <div className="mt-auto flex flex-col items-center gap-3 border-t border-base-300 pt-4 lg:flex-row lg:justify-between">
        <button
          className="btn btn-ghost btn-sm gap-2 touch-target"
          onClick={onToggleTheme}
          title={mode === 'dark' ? '切換淺色' : '切換深色'}
          aria-label={mode === 'dark' ? '切換淺色' : '切換深色'}
        >
          {mode === 'dark' ? (
            <SunIcon className="h-5 w-5" />
          ) : (
            <MoonIcon className="h-5 w-5" />
          )}
          <span className="hidden text-sm lg:inline">
            {mode === 'dark' ? '淺色' : '深色'}
          </span>
        </button>
        <Avatar onClick={onProfile} />
      </div>
    </aside>
  );
}

/** 桌面右側欄預設內容：金庫概況與安全提示，運用清單右側的空間。 */
function Overview({ entries }: { entries: ServiceEntry[] }) {
  const total = entries.length;
  const withPassword = entries.filter((e) => e.credentials[0]?.password).length;
  const enabled = useAuthStore((s) => s.enabled);
  const user = useAuthStore((s) => s.user);
  const lastSummary = useAuthStore((s) => s.lastSummary);

  return (
    <div className="flex h-full flex-col py-8">
      <div className="flex w-full max-w-md flex-1 flex-col gap-6 px-8">
        <div className="text-base-content/40">
          <ShieldCheckIcon className="mb-3 h-10 w-10" />
          <p className="text-sm">選擇左側項目即可在此檢視帳號與密碼。</p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-base-content/60">概況</h3>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="項目總數" value={String(total)} />
            <Stat label="含密碼" value={String(withPassword)} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-base-content/60">雲端備份</h3>
          <p className="text-sm text-base-content/70">
            {!enabled
              ? '純本地模式，未啟用雲端同步。'
              : user
                ? lastSummary
                  ? `已連結，上次同步 ${lastSummary}。`
                  : '已連結雲端備份。'
                : '尚未登入，資料僅保存在本機。'}
          </p>
        </div>

        <div className="mt-auto border-t border-base-300 pt-4 text-xs leading-relaxed text-base-content/50">
          所有密碼皆在本機端對端加密，雲端只存密文，無法解讀你的內容（零知識）。
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-base-300 bg-base-200 px-3 py-3">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-base-content/60">{label}</div>
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
    <div className="flex flex-col items-center justify-center px-2 py-16 text-center md:items-start md:text-left">
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
