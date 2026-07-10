/**
 * モルヒネ持続投与計算ロジック（UI から分離）
 *
 * 目的:
 *  持続投与デバイスについて、薬液全量・モルヒネ総量・投与速度から
 *    - モルヒネ濃度 / 1時間・1日あたりモルヒネ量
 *    - ボーラス（追加投与）を「1日の使用回数」で反映した使用可能日数
 *    - 空になる予定日時 / 安全マージンを引いた推奨交換目安日時
 *    - 途中の残液量からの残り時間の再計算
 *  を「確認補助」として計算する。
 *
 * 設計方針:
 *  - 計算は表示から独立させ、丸めは一切しない（丸めは表示側の責務）。
 *  - 変数名に単位（Ml / Mg / Hours / Days / PerDay）を含め、単位の取り違えを防ぐ。
 *  - ボーラスは「1日の使用回数」で扱い、持続投与に上乗せする1日消費量として計算する。
 *      実効消費速度 mL/時 = 投与速度 + （ボーラス1回量 × 1日回数）÷ 24
 *  - 致命的な入力不備（0以下・未入力）は errors に入れ、値は null にする。
 *  - 医療判断が絡む範囲チェックは warnings（赤字）に留め、上限下限は
 *    MORPHINE_LIMITS 定数で簡単に調整できるようにする。
 *    これらは医学的な安全域ではなく、明らかな入力ミス検知のための目安。
 */

import { addHours } from './dateUtils';

export type BolusMode = 'hours' | 'ml';
/** 'new' = 開始日時から新規計算 / 'remaining' = 途中の残液量から再計算 */
export type CalcMode = 'new' | 'remaining';

export interface MorphineInfusionInput {
  totalVolumeMl: number; // 薬液全量 mL（濃度計算・新規計算の基準量）
  morphineTotalMg: number; // モルヒネ総量 mg
  rateMlPerHour: number; // 投与速度 mL/時
  mode: CalcMode; // 計算モード
  startDateTime: Date; // 新規計算: 投与開始日時
  remainingVolumeMl: number; // 残液再計算: 現在の残液量 mL
  checkDateTime: Date; // 残液再計算: 残量を確認した日時
  bolusEnabled: boolean; // ボーラス（追加投与）あり／なし
  bolusMode: BolusMode; // 'hours'=投与速度の◯時間分 / 'ml'=直接mL入力
  bolusHours: number; // 時間分モードでの時間（例: 1.0）
  bolusManualMl: number; // 直接入力モードでのボーラス1回量 mL
  bolusPerDay: number; // ボーラス 1日の使用回数（0以上の整数）
  safetyMarginHours: number; // 安全マージン（交換を何時間前倒しするか）
}

export interface MorphineInfusionResult {
  ok: boolean; // 主要計算が成立したか
  errors: string[]; // 計算を妨げる致命的な入力エラー
  warnings: string[]; // 注意（赤字表示）警告
  exhausted: boolean; // 残液再計算で残量が0以下（交換必要）

  // 入力の確認用（エコーバック）
  mode: CalcMode;
  totalVolumeMl: number;
  morphineTotalMg: number;
  rateMlPerHour: number;
  startDateTime: Date;
  remainingVolumeMl: number;
  checkDateTime: Date;
  bolusEnabled: boolean;
  bolusMode: BolusMode;
  bolusHours: number;
  bolusPerDay: number;
  safetyMarginHours: number;

  // 計算に使った基準（新規=薬液全量/開始日時、残液=残液量/確認日時）
  volumeForDurationMl: number; // 残り時間計算に使う量
  referenceDateTime: Date; // 空予定を数える起点日時

  // 計算結果（ok=false のとき一部 null）
  concentrationMgPerMl: number | null; // モルヒネ濃度 mg/mL
  mgPerHour: number | null; // 1時間あたりモルヒネ量 mg/時（持続）
  mgPerDayContinuous: number | null; // 1日あたりモルヒネ量 mg/日（持続のみ）
  mgPerDayTotal: number | null; // 1日あたりモルヒネ量 mg/日（持続＋ボーラス）
  bolusOnceMl: number; // ボーラス1回量 mL
  bolusOnceMg: number | null; // ボーラス1回あたりモルヒネ量 mg
  bolusPerDayCount: number; // ボーラス1日回数（正規化後）
  bolusMlPerDay: number; // ボーラス1日使用量 mL/日
  bolusMgPerDay: number | null; // ボーラス1日モルヒネ量 mg/日
  effectiveRateMlPerHour: number | null; // 実効消費速度 mL/時（持続＋ボーラス平均）
  shortenHours: number | null; // ボーラスによる短縮時間 時間
  usableHoursBeforeBolus: number | null; // ボーラス反映前の使用可能時間（持続のみ）
  usableHoursAfterBolus: number | null; // ボーラス反映後の使用可能時間
  usableDaysBeforeBolus: number | null; // ボーラス反映前の使用可能日数
  usableDaysAfterBolus: number | null; // ボーラス反映後の使用可能日数
  emptyDateTime: Date | null; // 空になる予定日時
  recommendedExchangeDateTime: Date | null; // 推奨交換目安日時
}

/**
 * 入力値の範囲チェック用の定数。
 * ※ 医学的な安全域ではなく、明らかな入力ミス（桁違いなど）検知のための目安。
 *    現場や対象薬剤に合わせて、ここの数値だけ調整すればよい。
 */
export const MORPHINE_LIMITS = {
  totalVolumeMl: { min: 0.1, max: 1000 }, // 薬液全量 mL
  morphineTotalMg: { min: 0.1, max: 5000 }, // モルヒネ総量 mg
  rateMlPerHour: { min: 0.01, max: 50 }, // 投与速度 mL/時
  mgPerDay: { max: 2000 }, // 1日モルヒネ量 mg/日（超えたら要確認）
  bolusPerDay: { max: 96 }, // ボーラス1日回数（15分ロックでも最大96回/日）
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
    exhausted: false,
    mode: input.mode,
    totalVolumeMl: input.totalVolumeMl,
    morphineTotalMg: input.morphineTotalMg,
    rateMlPerHour: input.rateMlPerHour,
    startDateTime: input.startDateTime,
    remainingVolumeMl: input.remainingVolumeMl,
    checkDateTime: input.checkDateTime,
    bolusEnabled: input.bolusEnabled,
    bolusMode: input.bolusMode,
    bolusHours: input.bolusHours,
    bolusPerDay: input.bolusPerDay,
    safetyMarginHours: input.safetyMarginHours,
    volumeForDurationMl: 0,
    referenceDateTime: input.mode === 'remaining' ? input.checkDateTime : input.startDateTime,
    concentrationMgPerMl: null,
    mgPerHour: null,
    mgPerDayContinuous: null,
    mgPerDayTotal: null,
    bolusOnceMl: 0,
    bolusOnceMg: null,
    bolusPerDayCount: 0,
    bolusMlPerDay: 0,
    bolusMgPerDay: null,
    effectiveRateMlPerHour: null,
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
  const mgPerHour = concentrationMgPerMl * rateMlPerHour; // mg/時（持続）
  const mgPerDayContinuous = mgPerHour * HOURS_PER_DAY; // mg/日（持続のみ）

  // --- ボーラス（1日の使用回数ベース） ---
  const bolusPerDayCount = input.bolusEnabled ? Math.max(0, Math.floor(input.bolusPerDay || 0)) : 0;
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
  const bolusMlPerDay = bolusOnceMl * bolusPerDayCount; // mL/日
  const bolusMgPerDay = bolusMlPerDay * concentrationMgPerMl; // mg/日
  const mgPerDayTotal = mgPerDayContinuous + bolusMgPerDay; // mg/日（持続＋ボーラス）

  // --- 実効消費速度（持続＋ボーラスを1日ならしたmL/時） ---
  const effectiveRateMlPerHour = rateMlPerHour + bolusMlPerDay / HOURS_PER_DAY;

  // --- 残り時間計算の基準（新規=薬液全量/開始日時、残液=残液量/確認日時） ---
  const isRemaining = input.mode === 'remaining';
  const referenceDateTime = isRemaining ? input.checkDateTime : input.startDateTime;
  // 残液再計算では残液量、それ以外は薬液全量。0以下は0にクランプ（落とさない）
  const rawVolume = isRemaining ? input.remainingVolumeMl : totalVolumeMl;
  const volumeForDurationMl = Number.isFinite(rawVolume) && rawVolume > 0 ? rawVolume : 0;
  const exhausted = isRemaining && volumeForDurationMl <= 0;

  // --- 使用可能時間・日数 ---
  const usableHoursBeforeBolus = volumeForDurationMl / rateMlPerHour; // 持続のみ
  const usableHoursAfterBolus = volumeForDurationMl / effectiveRateMlPerHour; // 持続＋ボーラス
  const usableDaysBeforeBolus = usableHoursBeforeBolus / HOURS_PER_DAY;
  const usableDaysAfterBolus = usableHoursAfterBolus / HOURS_PER_DAY;
  const shortenHours = usableHoursBeforeBolus - usableHoursAfterBolus; // ボーラスによる短縮

  // --- 日時計算 ---
  const startValid = referenceDateTime instanceof Date && !Number.isNaN(referenceDateTime.getTime());
  const emptyDateTime = startValid ? addHours(referenceDateTime, usableHoursAfterBolus) : null;
  const safetyMarginHours = Number.isFinite(input.safetyMarginHours)
    ? Math.max(0, input.safetyMarginHours)
    : 0;
  const recommendedExchangeDateTime = emptyDateTime ? addHours(emptyDateTime, -safetyMarginHours) : null;

  // --- 警告（赤字） ---
  const warnings: string[] = [];
  if (isRemaining && input.remainingVolumeMl > totalVolumeMl) {
    warnings.push('残液量が薬液全量を超えています。入力値（残液量・薬液全量）を確認してください。');
  }
  if (exhausted) {
    warnings.push('残液がありません（0mL以下）。交換が必要か、残液量の入力を確認してください。');
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
  if (mgPerDayTotal > L.mgPerDay.max) {
    warnings.push(`1日モルヒネ量が${L.mgPerDay.max}mg/日を超えています。濃度・投与速度・ボーラスの入力値を確認してください。`);
  }
  if (bolusPerDayCount > L.bolusPerDay.max) {
    warnings.push(`ボーラス1日回数が想定範囲（0〜${L.bolusPerDay.max}回/日）外です。入力値を確認してください。`);
  }

  return {
    ok: true,
    errors: [],
    warnings,
    exhausted,
    mode: input.mode,
    totalVolumeMl,
    morphineTotalMg,
    rateMlPerHour,
    startDateTime: input.startDateTime,
    remainingVolumeMl: input.remainingVolumeMl,
    checkDateTime: input.checkDateTime,
    bolusEnabled: input.bolusEnabled,
    bolusMode: input.bolusMode,
    bolusHours: input.bolusHours,
    bolusPerDay: input.bolusPerDay,
    safetyMarginHours,
    volumeForDurationMl,
    referenceDateTime,
    concentrationMgPerMl,
    mgPerHour,
    mgPerDayContinuous,
    mgPerDayTotal,
    bolusOnceMl,
    bolusOnceMg,
    bolusPerDayCount,
    bolusMlPerDay,
    bolusMgPerDay,
    effectiveRateMlPerHour,
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
