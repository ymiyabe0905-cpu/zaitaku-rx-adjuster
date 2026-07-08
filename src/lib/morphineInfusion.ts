/**
 * モルヒネ持続投与計算ロジック（UI から分離）
 *
 * 目的:
 *  シリンジポンプ・レガシー・クデクエイミーなどの持続投与デバイスについて、
 *  薬液全量・モルヒネ総量・投与速度から
 *    - モルヒネ濃度 / 1時間・1日あたりモルヒネ量
 *    - ボーラス（追加投与）を反映した使用可能日数
 *    - 空になる予定日時 / 推奨交換目安日時
 *  を「確認補助」として計算する。
 *
 * 設計方針:
 *  - 計算は表示から独立させ、丸めは一切しない（丸めは表示側の責務）。
 *  - 変数名に単位（Ml / Mg / Hours / Days）を含め、単位の取り違えを防ぐ。
 *  - 致命的な入力不備（0以下・未入力）は errors に入れ、値は null にする。
 *  - 医療判断が絡む範囲チェックは「警告(warnings)」に留め、上限下限は
 *    MORPHINE_LIMITS 定数で簡単に調整できるようにする。
 *  - これらの上限下限は医学的な安全域ではなく、明らかな入力ミス検知のための目安。
 */

import { addHours } from './dateUtils';

export type BolusMode = 'hours' | 'ml';

export interface MorphineInfusionInput {
  deviceKey: string; // デバイス種別（morphineDevices の key）
  totalVolumeMl: number; // 薬液全量 mL
  morphineTotalMg: number; // モルヒネ総量 mg
  rateMlPerHour: number; // 投与速度 mL/時
  startDateTime: Date; // 投与開始日時
  bolusEnabled: boolean; // ボーラス（追加投与）あり／なし
  bolusMode: BolusMode; // 'hours'=投与速度の◯時間分 / 'ml'=直接mL入力
  bolusHours: number; // 時間分モードでの時間（例: 1.0）
  bolusManualMl: number; // 直接入力モードでのボーラス1回量 mL
  bolusCount: number; // ボーラス使用回数（0以上の整数）
  safetyMarginHours: number; // 安全マージン（交換を何時間前倒しするか）
}

export interface MorphineInfusionResult {
  ok: boolean; // 主要計算（濃度・使用可能日数）が成立したか
  errors: string[]; // 計算を妨げる致命的な入力エラー
  warnings: string[]; // 注意（赤字表示）警告
  bolusExceedsVolume: boolean; // ボーラス総使用量が薬液全量以上か

  // 入力の確認用（エコーバック）
  deviceKey: string;
  totalVolumeMl: number;
  morphineTotalMg: number;
  rateMlPerHour: number;
  startDateTime: Date;
  bolusEnabled: boolean;
  bolusMode: BolusMode;
  bolusHours: number;
  bolusCount: number;
  safetyMarginHours: number;

  // 計算結果（ok=false のとき一部 null）
  concentrationMgPerMl: number | null; // モルヒネ濃度 mg/mL
  mgPerHour: number | null; // 1時間あたりモルヒネ量 mg/時
  mgPerDay: number | null; // 1日あたりモルヒネ量 mg/日
  bolusOnceMl: number; // ボーラス1回量 mL（なし・不成立時は0）
  bolusOnceMg: number | null; // ボーラス1回あたりモルヒネ量 mg
  bolusTotalMl: number; // ボーラス総使用量 mL
  bolusTotalMg: number | null; // ボーラス総モルヒネ量 mg
  shortenHours: number | null; // ボーラスによる短縮時間 時間
  usableHoursBeforeBolus: number | null; // ボーラス反映前の使用可能時間
  usableHoursAfterBolus: number | null; // ボーラス反映後の使用可能時間
  usableDaysBeforeBolus: number | null; // ボーラス反映前の使用可能日数
  usableDaysAfterBolus: number | null; // ボーラス反映後の使用可能日数
  emptyDateTime: Date | null; // 空になる予定日時
  recommendedExchangeDateTime: Date | null; // 推奨交換目安日時
}

/**
 * 入力値の範囲チェック用の定数。
 * ※ これは医学的な安全域ではなく、明らかな入力ミス（桁違いなど）を検知するための目安。
 *    現場の運用や対象薬剤に合わせて、ここの数値だけ調整すればよい。
 */
export const MORPHINE_LIMITS = {
  totalVolumeMl: { min: 0.1, max: 1000 }, // 薬液全量 mL
  morphineTotalMg: { min: 0.1, max: 5000 }, // モルヒネ総量 mg
  rateMlPerHour: { min: 0.01, max: 50 }, // 投与速度 mL/時
  mgPerDay: { max: 2000 }, // 1日モルヒネ量 mg/日（これを超えたら要確認）
  bolusCount: { max: 500 }, // ボーラス使用回数
} as const;

const HOURS_PER_DAY = 24;

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/** ok=false（計算不成立）の結果を、入力エコーと errors 付きで組み立てる */
function failed(input: MorphineInfusionInput, errors: string[]): MorphineInfusionResult {
  return {
    ok: false,
    errors,
    warnings: [],
    bolusExceedsVolume: false,
    deviceKey: input.deviceKey,
    totalVolumeMl: input.totalVolumeMl,
    morphineTotalMg: input.morphineTotalMg,
    rateMlPerHour: input.rateMlPerHour,
    startDateTime: input.startDateTime,
    bolusEnabled: input.bolusEnabled,
    bolusMode: input.bolusMode,
    bolusHours: input.bolusHours,
    bolusCount: input.bolusCount,
    safetyMarginHours: input.safetyMarginHours,
    concentrationMgPerMl: null,
    mgPerHour: null,
    mgPerDay: null,
    bolusOnceMl: 0,
    bolusOnceMg: null,
    bolusTotalMl: 0,
    bolusTotalMg: null,
    shortenHours: null,
    usableHoursBeforeBolus: null,
    usableHoursAfterBolus: null,
    usableDaysBeforeBolus: null,
    usableDaysAfterBolus: null,
    emptyDateTime: null,
    recommendedExchangeDateTime: null,
  };
}

/**
 * モルヒネ持続投与の計算本体。
 * 丸めは行わず、生の数値を返す（表示側で桁を丸める）。
 */
export function calculateMorphineInfusion(input: MorphineInfusionInput): MorphineInfusionResult {
  // --- 致命的な入力チェック（0以下・未入力は計算しない） ---
  const errors: string[] = [];
  if (!isPositiveFinite(input.totalVolumeMl)) errors.push('薬液全量は0より大きい数値を入力してください。');
  if (!isPositiveFinite(input.morphineTotalMg)) errors.push('モルヒネ総量は0より大きい数値を入力してください。');
  if (!isPositiveFinite(input.rateMlPerHour)) errors.push('投与速度は0より大きい数値を入力してください。');
  if (errors.length > 0) return failed(input, errors);

  const totalVolumeMl = input.totalVolumeMl;
  const morphineTotalMg = input.morphineTotalMg;
  const rateMlPerHour = input.rateMlPerHour;

  // --- 基本計算（丸めない） ---
  const concentrationMgPerMl = morphineTotalMg / totalVolumeMl; // mg/mL
  const mgPerHour = concentrationMgPerMl * rateMlPerHour; // mg/時
  const mgPerDay = mgPerHour * HOURS_PER_DAY; // mg/日

  // --- ボーラス ---
  const bolusCount = input.bolusEnabled ? Math.max(0, Math.floor(input.bolusCount || 0)) : 0;
  let bolusOnceMl = 0;
  if (input.bolusEnabled) {
    bolusOnceMl =
      input.bolusMode === 'hours'
        ? rateMlPerHour * (Number.isFinite(input.bolusHours) ? input.bolusHours : 0)
        : Number.isFinite(input.bolusManualMl)
          ? input.bolusManualMl
          : 0;
    if (bolusOnceMl < 0) bolusOnceMl = 0;
  }
  const bolusOnceMg = bolusOnceMl * concentrationMgPerMl;
  const bolusTotalMl = bolusOnceMl * bolusCount;
  const bolusTotalMg = bolusTotalMl * concentrationMgPerMl;
  const shortenHours = bolusTotalMl / rateMlPerHour; // 短縮時間 時間

  // --- 使用可能時間・日数 ---
  const usableHoursBeforeBolus = totalVolumeMl / rateMlPerHour;
  const usableHoursAfterBolus = (totalVolumeMl - bolusTotalMl) / rateMlPerHour; // = before - shorten
  const usableDaysBeforeBolus = usableHoursBeforeBolus / HOURS_PER_DAY;
  const usableDaysAfterBolus = usableHoursAfterBolus / HOURS_PER_DAY;

  // --- ボーラス総使用量が薬液全量以上（計算不能・要確認） ---
  const bolusExceedsVolume = bolusTotalMl >= totalVolumeMl;

  // --- 日時計算（ボーラス超過時は空になる予定・交換目安を出さない） ---
  const startValid = input.startDateTime instanceof Date && !Number.isNaN(input.startDateTime.getTime());
  const emptyDateTime =
    !bolusExceedsVolume && startValid ? addHours(input.startDateTime, usableHoursAfterBolus) : null;
  const safetyMarginHours = Number.isFinite(input.safetyMarginHours)
    ? Math.max(0, input.safetyMarginHours)
    : 0;
  const recommendedExchangeDateTime = emptyDateTime ? addHours(emptyDateTime, -safetyMarginHours) : null;

  // --- 警告（赤字） ---
  const warnings: string[] = [];
  if (bolusExceedsVolume) {
    warnings.push(
      'ボーラス総使用量が薬液全量以上です。すでに交換が必要か、入力値（ボーラス回数・1回量・薬液全量）に誤りがある可能性があります。ご確認ください。',
    );
  }
  const L = MORPHINE_LIMITS;
  if (totalVolumeMl < L.totalVolumeMl.min || totalVolumeMl > L.totalVolumeMl.max) {
    warnings.push(`薬液全量が想定範囲（${L.totalVolumeMl.min}〜${L.totalVolumeMl.max}mL）外です。入力値を確認してください。`);
  }
  if (morphineTotalMg < L.morphineTotalMg.min || morphineTotalMg > L.morphineTotalMg.max) {
    warnings.push(`モルヒネ総量が想定範囲（${L.morphineTotalMg.min}〜${L.morphineTotalMg.max}mg）外です。入力値を確認してください。`);
  }
  if (rateMlPerHour < L.rateMlPerHour.min || rateMlPerHour > L.rateMlPerHour.max) {
    warnings.push(`投与速度が想定範囲（${L.rateMlPerHour.min}〜${L.rateMlPerHour.max}mL/時）外です。入力値を確認してください。`);
  }
  if (mgPerDay > L.mgPerDay.max) {
    warnings.push(`1日モルヒネ量が${L.mgPerDay.max}mg/日を超えています。濃度・投与速度の入力値を確認してください。`);
  }
  if (bolusCount > L.bolusCount.max) {
    warnings.push(`ボーラス使用回数が想定範囲（0〜${L.bolusCount.max}回）外です。入力値を確認してください。`);
  }

  return {
    ok: true,
    errors: [],
    warnings,
    bolusExceedsVolume,
    deviceKey: input.deviceKey,
    totalVolumeMl,
    morphineTotalMg,
    rateMlPerHour,
    startDateTime: input.startDateTime,
    bolusEnabled: input.bolusEnabled,
    bolusMode: input.bolusMode,
    bolusHours: input.bolusHours,
    bolusCount,
    safetyMarginHours,
    concentrationMgPerMl,
    mgPerHour,
    mgPerDay,
    bolusOnceMl,
    bolusOnceMg,
    bolusTotalMl,
    bolusTotalMg,
    shortenHours,
    usableHoursBeforeBolus,
    usableHoursAfterBolus,
    usableDaysBeforeBolus,
    usableDaysAfterBolus,
    emptyDateTime,
    recommendedExchangeDateTime,
  };
}

/* ---------- 表示用の丸めヘルパー（計算では使わず、表示時のみ使う） ---------- */

/** 数値を指定桁で丸めて文字列化。null/NaN は '—' を返す */
export function fmt(value: number | null | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export const fmtMgPerMl = (v: number | null) => fmt(v, 2); // mg/mL: 小数第2位
export const fmtMgPerHour = (v: number | null) => fmt(v, 2); // mg/時: 小数第2位
export const fmtMgPerDay = (v: number | null) => fmt(v, 1); // mg/日: 小数第1位
export const fmtMl = (v: number | null) => fmt(v, 2); // mL: 小数第2位
export const fmtDays = (v: number | null) => fmt(v, 2); // 日数: 小数第2位
export const fmtShortenHours = (v: number | null) => fmt(v, 1); // 短縮時間: 小数第1位
