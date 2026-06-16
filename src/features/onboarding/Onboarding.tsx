/**
 * 首次使用導覽：用幾張卡片說明「零知識 + Passkey 解鎖 + 一鍵匯入 + 本地搜尋」，
 * 結束後進入建立金庫。純展示，不觸碰任何資料；完成狀態存在 localStorage。
 */
import { useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import {
  ShieldCheckIcon,
  FingerPrintIcon,
  ArrowDownOnSquareIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
} from '@heroicons/react/24/outline';

const STORAGE_KEY = 'safevault.onboarded.v1';

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* localStorage 不可用時忽略，下次仍會顯示導覽 */
  }
}

interface Slide {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
  points: string[];
}

const SLIDES: Slide[] = [
  {
    Icon: ShieldCheckIcon,
    title: '只有你能打開',
    body: '我們是「零知識」密碼管理器：你的帳號密碼一律先在這台裝置上加密，伺服器只看得到一團密文。',
    points: [
      '密碼絕不以明文離開你的裝置',
      '我們、雲端、甚至 Google 都無法解讀你的內容',
      '沒有後門，也沒有客服能幫你「救回」內容',
    ],
  },
  {
    Icon: FingerPrintIcon,
    title: '用 Passkey 解鎖，免記密碼',
    body: '預設用 Google 登入 + 這台裝置的 Passkey 建立金庫，完全不必設主密碼（指紋、Face ID 或裝置密碼皆可）。換新裝置時，用「復原碼」還原一次，即可在新裝置改用 Passkey。',
    points: [
      'Passkey 秘密只留在這台裝置，永不上傳',
      'Google 登入只用來「找到」你的密文，無法解密',
      '復原碼是唯一可攜的備援，請務必離線保存',
    ],
  },
  {
    Icon: ArrowDownOnSquareIcon,
    title: '一鍵搬家',
    body: '還把帳密記在記事本或備忘錄裡嗎？整段複製貼上，App 會在「本機」自動解析成一筆筆條目，你確認後即可入庫。',
    points: [
      '解析全程在裝置本機完成，不送任何網路請求',
      '自動辨識服務、帳號、密碼與各種自訂欄位',
      '匯入前可逐筆檢查與修改',
    ],
  },
  {
    Icon: MagnifyingGlassIcon,
    title: '新增與尋找，都很直覺',
    body: '隨時點「新增」加入任何帳號密碼；要找東西時，用你習慣的叫法搜尋就好。',
    points: [
      '搜尋「網銀」「Gmail」「FB」都找得到（含中英別名）',
      '搜尋同樣在本地進行，不外洩你的服務清單',
      '點一下條目即可複製密碼',
    ],
  },
];

interface Props {
  onDone: () => void;
}

export function Onboarding({ onDone }: Props) {
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const isLast = i === SLIDES.length - 1;
  const { Icon } = slide;

  return (
    <div className="mx-auto flex min-h-[var(--app-content-height)] max-w-md flex-col px-6 py-10">
      {/* 略過 */}
      <div className="flex justify-end">
        <button
          className="btn btn-ghost btn-sm text-base-content/50 touch-target"
          onClick={onDone}
        >
          略過
        </button>
      </div>

      {/* 內容 */}
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-bold">{slide.title}</h1>
        <p className="mt-3 text-base-content/70">{slide.body}</p>
        <ul className="mt-5 space-y-2">
          {slide.points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-primary" />
              <span className="text-base-content/80">{p}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 進度點 */}
      <div className="my-6 flex justify-center gap-2" aria-hidden>
        {SLIDES.map((_, n) => (
          <span
            key={n}
            className={`h-2 rounded-full transition-all ${
              n === i ? 'w-6 bg-primary' : 'w-2 bg-base-300'
            }`}
          />
        ))}
      </div>

      {/* 導覽列 */}
      <div className="flex items-center gap-3">
        <button
          className="btn btn-ghost touch-target"
          onClick={() => setI((v) => Math.max(0, v - 1))}
          disabled={i === 0}
          aria-label="上一步"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button
          className="btn btn-primary flex-1 touch-target"
          onClick={() => (isLast ? onDone() : setI((v) => v + 1))}
        >
          {isLast ? '開始使用' : '下一步'}
          {!isLast && <ChevronRightIcon className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
