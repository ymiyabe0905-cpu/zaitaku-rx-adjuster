/**
 * 点眼薬残数の計算ロジック（UI から分離）
 *
 * 重要: これは厳密計算ではなく「確認用の概算」。
 *  - 滴数は容量から自動換算する（1mLあたり20滴）。
 *      5mL = 100滴 / 2.5mL = 50滴 / その他 = floor(容量mL × 20)
 *  - 1本あたりの滴数を自由入力する方式にはしない。
 *  - 開封後期限・点眼失敗・空打ち・予備などは扱わない。
 */

import { formatJP, inclusiveDayCount } from './dateUtils';

export const DROPS_PER_ML = 20;

export type VolumePreset = '5' | '2.5' | 'other';
export type EyeTarget = 'right' | 'left' | 'both';
export type RemainMode = 'drops' | 'ratio';
export type RatioKey = 'full' | '3/4' | '1/2' | '1/4' | 'low' | 'empty';

export const RATIO_OPTIONS: { key: RatioKey; label: string; factor: number }[] = [
  { key: 'full', label: 'ほぼ満量', factor: 1.0 },
  { key: '3/4', label: '3/4', factor: 0.75 },
  { key: '1/2', label: '1/2', factor: 0.5 },
  { key: '1/4', label: '1/4', factor: 0.25 },
  { key: 'low', label: '少量', factor: 0.1 },
  { key: 'empty', label: '空', factor: 0 },
];

/** 容量(mL) → 1本あたり換算滴数 */
export function dropsPerBottle(preset: VolumePreset, volumeMl: number): number {
  if (preset === '5') return 100;
  if (preset === '2.5') return 50;
  return Math.floor(volumeMl * DROPS_PER_ML);
}

/** 点眼対象 → 対象眼数 */
export function eyesCount(target: EyeTarget): number {
  return target === 'both' ? 2 : 1;
}

export interface EyedropInput {
  preset: VolumePreset;
  volumeMl: number; // その他のときの容量(mL)
  unusedBottles: number;
  remainMode: RemainMode;
  currentDrops: number; // 滴数入力のとき
  ratioKey: RatioKey; // 割合入力のとき
  target: EyeTarget;
  dropsPerEyeDose: number; // 1眼あたりの1回滴数
  timesPerDay: number; // 1日の点眼回数
  startDate: Date;
  nextVisitDate: Date;
}

export interface EyedropResult {
  preset: VolumePreset;
  volumeMl: number;
  dropsPerMl: number; // 1mLあたり換算滴数（=20）
  dropsPerBottle: number; // 1本あたり換算滴数
  unusedBottles: number;
  remainMode: RemainMode;
  ratioKey: RatioKey;
  currentBottleDrops: number; // 使用中ボトルの残滴数
  totalAvailable: number; // 現在の総使用可能滴数
  target: EyeTarget;
  eyes: number; // 対象眼数
  dropsPerEyeDose: number; // 1眼あたりの1回滴数
  dosePerUse: number; // 1回使用滴数
  timesPerDay: number;
  dailyDrops: number; // 1日使用滴数
  startDate: Date;
  nextVisitDate: Date;
  needDays: number; // 必要日数
  neededDrops: number; // 必要滴数
  usableDays: number; // 現在の残量で使える日数
  remainderUses: number; // 余り回数
  partialDrops: number; // 1回量に満たない端数滴数
  shortageDrops: number; // 不足滴数
  addBottles: number; // 追加で必要な本数
  leftoverAfter: number; // 追加後の余り滴数
}

export function calcEyedrop(input: EyedropInput): EyedropResult {
  if (input.dropsPerEyeDose <= 0) throw new Error('1眼あたりの1回滴数は1以上を入力してください');
  if (input.timesPerDay <= 0) throw new Error('1日の点眼回数は1以上を入力してください');

  const perBottle = dropsPerBottle(input.preset, input.volumeMl);
  if (perBottle <= 0) throw new Error('容量から換算した滴数が0です。容量を確認してください');

  const eyes = eyesCount(input.target);
  const dosePerUse = eyes * input.dropsPerEyeDose;
  const dailyDrops = dosePerUse * input.timesPerDay;

  // 使用中ボトルの残滴数
  const currentBottleDrops =
    input.remainMode === 'drops'
      ? Math.floor(input.currentDrops)
      : Math.floor(perBottle * ratioFactor(input.ratioKey));

  const totalAvailable = input.unusedBottles * perBottle + currentBottleDrops;

  // 必要日数（開始日・次回訪問日をどちらも含める）
  const needDays = inclusiveDayCount(input.startDate, input.nextVisitDate);
  const neededDrops = needDays * dailyDrops;

  const shortageDrops = neededDrops - totalAvailable;
  const addBottles = shortageDrops > 0 ? Math.ceil(shortageDrops / perBottle) : 0;
  const leftoverAfter = totalAvailable + addBottles * perBottle - neededDrops;

  const usableDays = Math.floor(totalAvailable / dailyDrops);
  const remainderDrops = totalAvailable % dailyDrops;
  const remainderUses = Math.floor(remainderDrops / dosePerUse);
  const partialDrops = remainderDrops % dosePerUse;

  return {
    preset: input.preset,
    volumeMl: input.volumeMl,
    dropsPerMl: DROPS_PER_ML,
    dropsPerBottle: perBottle,
    unusedBottles: input.unusedBottles,
    remainMode: input.remainMode,
    ratioKey: input.ratioKey,
    currentBottleDrops,
    totalAvailable,
    target: input.target,
    eyes,
    dropsPerEyeDose: input.dropsPerEyeDose,
    dosePerUse,
    timesPerDay: input.timesPerDay,
    dailyDrops,
    startDate: input.startDate,
    nextVisitDate: input.nextVisitDate,
    needDays,
    neededDrops,
    usableDays,
    remainderUses,
    partialDrops,
    shortageDrops,
    addBottles,
    leftoverAfter,
  };
}

function ratioFactor(key: RatioKey): number {
  return RATIO_OPTIONS.find((r) => r.key === key)?.factor ?? 0;
}

export function eyeTargetLabel(target: EyeTarget): string {
  return target === 'right' ? '右眼' : target === 'left' ? '左眼' : '両眼';
}

export function volumeLabel(r: EyedropResult): string {
  if (r.preset === '5') return '5mL';
  if (r.preset === '2.5') return '2.5mL';
  return `${r.volumeMl}mL（その他）`;
}

/** 実務で使える説明文を自動生成 */
export function buildEyedropNote(r: EyedropResult): string {
  const visitJP = formatJP(r.nextVisitDate);
  const head =
    `現在、使用中ボトルの残量が約${r.currentBottleDrops}滴、未使用が${r.unusedBottles}本あります。` +
    `${eyeTargetLabel(r.target)}に1回${r.dropsPerEyeDose}滴、1日${r.timesPerDay}回点眼する場合、`;

  let main: string;
  if (r.shortageDrops > 0) {
    main =
      head +
      `1日あたり${r.dailyDrops}滴使用します。現在の残量で${r.usableDays}日分と${r.remainderUses}回分使用可能です。` +
      `${visitJP}まで持たせるには合計${r.neededDrops}滴必要であり、追加で${r.addBottles}本の処方が必要です。` +
      `追加後は約${r.leftoverAfter}滴余る見込みです。`;
  } else {
    main =
      head +
      `現在の残量で${r.usableDays}日分と${r.remainderUses}回分使用可能です。` +
      `${visitJP}までに必要な滴数は${r.neededDrops}滴であり、現在の残量で足りる見込みです。`;
  }

  if (r.partialDrops > 0) {
    main +=
      `\nなお、残り${r.partialDrops}滴は1回使用量${r.dosePerUse}滴に満たないため、` +
      `1回分としては不完全な端数として表示しています。`;
  }
  return main;
}
