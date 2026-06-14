/**
 * 整筆品質評分與「需檢視」判定。
 */
import type { ImportFields, FieldKey } from '@/types/import';

export interface Quality {
  quality: number; // 0..1
  needsReview: boolean;
  missing: FieldKey[];
}

/**
 * 品質 = 關鍵欄位齊全度 × 平均信心。
 * 一筆有用的密碼條目至少需要 service 與 password（或 username）。
 */
export function scoreCandidate(
  fields: ImportFields,
  confidence: Partial<Record<FieldKey, number>>,
): Quality {
  const present = (Object.keys(fields) as FieldKey[]).filter(
    (k) => fields[k] !== undefined && fields[k] !== '',
  );

  const confs = present.map((k) => confidence[k] ?? 0.5);
  const avgConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;

  const missing: FieldKey[] = [];
  if (!fields.service) missing.push('service');
  if (!fields.password) missing.push('password');
  if (!fields.username && !fields.password) missing.push('username');

  // 完整度：service / (password|username) 為核心
  const hasService = Boolean(fields.service);
  const hasSecret = Boolean(fields.password);
  const hasIdentity = Boolean(fields.username || fields.password);
  const completeness =
    (hasService ? 0.45 : 0) + (hasSecret ? 0.35 : 0) + (hasIdentity ? 0.2 : 0);

  const quality = round2(0.5 * completeness + 0.5 * avgConf * (present.length ? 1 : 0));

  const needsReview =
    quality < 0.6 ||
    !hasService ||
    !hasSecret ||
    !hasIdentity ||
    present.some((k) => (confidence[k] ?? 1) < 0.6);

  return { quality, needsReview, missing };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
