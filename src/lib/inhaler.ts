/**
 * 吸入薬残数の計算ロジック（UI から分離）
 *
 * 前提:
 *  - カウンターなし吸入薬の理論残数計算は行わない。
 *  - 空噴霧・試し噴霧・初回準備吸入の差し引きは行わない。
 *  - 残量カウンター／確認できる残吸入数を入力して計算する。
 *
 * 2モード:
 *  - 定期吸入モード: 残吸入数と1日使用吸入数から、次回訪問日までの不足を計算。
 *  - 頓用吸入モード: 前回〜今回の使用量をもとにした「参考計算」。
 */

import { addDays, diffDays, formatJP, inclusiveDayCount } from './dateUtils';

export type VisitInclusion = 'includeVisitDay' | 'untilDayBefore';
export type EstimateMethod = 'average' | 'manual';

/** 1キットあたり総吸入数のプリセット */
export const KIT_PRESETS = [14, 28, 30, 56, 60, 120] as const;

/* ============================================================
 * 定期吸入モード
 * ========================================================== */
export interface RegularInput {
  totalPerKit: number; // 1キットあたり総吸入数
  unusedKits: number; // 未使用キット数
  currentKitRemaining: number; // 使用中キットの残吸入数（0可）
  perDose: number; // 1回あたり吸入数
  timesPerDay: number; // 1日の使用回数
  startDate: Date;
  nextVisitDate: Date;
  visitInclusion: VisitInclusion;
  includeSpare: boolean; // 予備を含めるか
  spareDays: number; // 予備日数
}

export interface RegularResult {
  totalPerKit: number;
  unusedKits: number;
  currentKitRemaining: number;
  perDose: number;
  timesPerDay: number;
  dailyPuffs: number; // 1日使用吸入数
  totalAvailable: number; // 現在の総使用可能吸入数
  startDate: Date;
  nextVisitDate: Date;
  visitInclusion: VisitInclusion;
  needDays: number; // 必要日数
  spareDays: number;
  neededPuffs: number; // 次回訪問日までに必要な吸入数（予備込み）
  usableDays: number; // 現在の残量で使える日数
  remainderPuffs: number; // 余り吸入数
  remainderDoses: number; // 余り使用回数
  partialPuffs: number; // 1回量に満たない端数吸入数
  shortagePuffs: number; // 不足吸入数
  addKits: number; // 追加で必要なキット数
  leftoverAfter: number; // 追加後の余り吸入数
}

export function calcRegular(input: RegularInput): RegularResult {
  if (input.perDose <= 0) throw new Error('1回あたり吸入数は1以上を入力してください');
  if (input.timesPerDay <= 0) throw new Error('1日の使用回数は1以上を入力してください');

  const dailyPuffs = input.perDose * input.timesPerDay;
  const totalAvailable = input.unusedKits * input.totalPerKit + input.currentKitRemaining;

  // 必要日数（開始日を含めて計算）
  const needDays =
    input.visitInclusion === 'includeVisitDay'
      ? inclusiveDayCount(input.startDate, input.nextVisitDate) // 次回訪問日 − 開始日 + 1
      : Math.max(0, diffDays(input.startDate, input.nextVisitDate)); // 次回訪問日 − 開始日

  let neededPuffs = needDays * dailyPuffs;
  if (input.includeSpare) neededPuffs += input.spareDays * dailyPuffs;

  const shortagePuffs = neededPuffs - totalAvailable;
  const addKits = shortagePuffs > 0 ? Math.ceil(shortagePuffs / input.totalPerKit) : 0;
  const leftoverAfter = totalAvailable + addKits * input.totalPerKit - neededPuffs;

  const usableDays = Math.floor(totalAvailable / dailyPuffs);
  const remainderPuffs = totalAvailable % dailyPuffs;
  const remainderDoses = Math.floor(remainderPuffs / input.perDose);
  const partialPuffs = remainderPuffs % input.perDose;

  return {
    totalPerKit: input.totalPerKit,
    unusedKits: input.unusedKits,
    currentKitRemaining: input.currentKitRemaining,
    perDose: input.perDose,
    timesPerDay: input.timesPerDay,
    dailyPuffs,
    totalAvailable,
    startDate: input.startDate,
    nextVisitDate: input.nextVisitDate,
    visitInclusion: input.visitInclusion,
    needDays,
    spareDays: input.includeSpare ? input.spareDays : 0,
    neededPuffs,
    usableDays,
    remainderPuffs,
    remainderDoses,
    partialPuffs,
    shortagePuffs,
    addKits,
    leftoverAfter,
  };
}

export function buildRegularNote(r: RegularResult): string {
  const visitJP = formatJP(r.nextVisitDate);
  let main =
    `現在、使用中キットの残量が${r.currentKitRemaining}吸入、未使用キットが${r.unusedKits}個あります。` +
    `1回${r.perDose}吸入を1日${r.timesPerDay}回使用する場合、` +
    `現在の残量で${r.usableDays}日分と${r.remainderDoses}回分使用可能です。` +
    `${visitJP}まで持たせるには合計${r.neededPuffs}吸入必要であり、`;
  main +=
    r.addKits > 0
      ? `追加で${r.addKits}キットの処方が必要です。追加後は${r.leftoverAfter}吸入余る見込みです。`
      : `現在の残量で足ります（追加処方は不要）。${Math.max(0, -r.shortagePuffs)}吸入余る見込みです。`;
  if (r.partialPuffs > 0) {
    main +=
      `\nなお、残り${r.partialPuffs}吸入は1回量${r.perDose}吸入に満たないため、` +
      `1回分としては不完全な端数として表示しています。`;
  }
  return main;
}

/* ============================================================
 * 頓用吸入モード（参考計算）
 * ========================================================== */
export interface PrnInput {
  totalPerKit: number;
  prevDate: Date; // 前回確認日
  currDate: Date; // 今回確認日
  prevRemaining: number; // 前回確認時の残吸入数
  currRemaining: number; // 今回確認時の残吸入数（＝現在の使用中キットの残）
  addedKits: number; // 前回から今回までに追加されたキット数
  perDose: number; // 1回あたり吸入数
  currentUnusedKits: number; // 現在の未使用キット数
  nextVisitDate: Date;
  estimateMethod: EstimateMethod;
  manualDailyPuffs: number; // 手入力の1日見込み吸入数
}

export interface PrnResult {
  totalPerKit: number;
  prevDate: Date;
  currDate: Date;
  prevRemaining: number;
  currRemaining: number;
  addedKits: number;
  usedPuffs: number; // 前回から今回までの使用吸入数
  periodDays: number; // 前回から今回までの日数
  avgDaily: number; // 1日平均使用吸入数
  perDose: number;
  currentUnusedKits: number;
  totalAvailable: number; // 現在の総使用可能吸入数（未使用キット＋今回確認時の残）
  nextVisitDate: Date;
  daysToVisit: number; // 次回訪問日までの日数
  estimateMethod: EstimateMethod;
  estDaily: number; // 見込みに使った1日吸入数
  estNeeded: number; // 次回訪問日までの見込み必要吸入数
  shortagePuffs: number; // 不足吸入数
  addKits: number; // 追加で必要なキット数
}

export function calcPrn(input: PrnInput): PrnResult {
  const periodDays = diffDays(input.prevDate, input.currDate);
  if (periodDays <= 0) throw new Error('今回確認日は前回確認日より後にしてください');
  if (input.perDose <= 0) throw new Error('1回あたり吸入数は1以上を入力してください');

  const usedPuffs =
    input.prevRemaining + input.addedKits * input.totalPerKit - input.currRemaining;
  const avgDaily = usedPuffs / periodDays;
  // 今回確認時の残＝現在の使用中キットの残として総数を計算
  const totalAvailable = input.currentUnusedKits * input.totalPerKit + input.currRemaining;

  // 翌日から次回訪問日まで（今回確認日は含めない）
  const daysToVisit = Math.max(0, diffDays(input.currDate, input.nextVisitDate));

  const estDaily = input.estimateMethod === 'average' ? avgDaily : input.manualDailyPuffs;
  const estNeeded = estDaily * daysToVisit;
  const shortagePuffs = estNeeded - totalAvailable;
  const addKits = shortagePuffs > 0 ? Math.ceil(shortagePuffs / input.totalPerKit) : 0;

  return {
    totalPerKit: input.totalPerKit,
    prevDate: input.prevDate,
    currDate: input.currDate,
    prevRemaining: input.prevRemaining,
    currRemaining: input.currRemaining,
    addedKits: input.addedKits,
    usedPuffs,
    periodDays,
    avgDaily,
    perDose: input.perDose,
    currentUnusedKits: input.currentUnusedKits,
    totalAvailable,
    nextVisitDate: input.nextVisitDate,
    daysToVisit,
    estimateMethod: input.estimateMethod,
    estDaily,
    estNeeded,
    shortagePuffs,
    addKits,
  };
}

/** 平均・見込みなどの数値表示（小数1桁・整数はそのまま） */
export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function buildPrnNote(r: PrnResult): string {
  if (r.shortagePuffs > 0) {
    return (
      `前回確認日から今回確認日までに${r.usedPuffs}吸入使用しており、1日平均${fmtNum(r.avgDaily)}吸入の使用です。` +
      `現在の残量は合計${r.totalAvailable}吸入です。この見込み（1日${fmtNum(r.estDaily)}吸入）で${formatJP(r.nextVisitDate)}まで見込むと、` +
      `約${fmtNum(r.estNeeded)}吸入必要です。現在の残量では${fmtNum(r.shortagePuffs)}吸入不足するため、追加で${r.addKits}キット必要な見込みです。`
    );
  }
  return (
    `前回から今回までの使用状況（1日平均${fmtNum(r.avgDaily)}吸入）をもとにすると、現在の残量（合計${r.totalAvailable}吸入）で` +
    `持たせたい日（${formatJP(r.nextVisitDate)}）まで足りる見込みです。ただし、頓用薬のため、発作頻度や使用状況により必要量は変動します。`
  );
}

/** UI から使う日付ヘルパー（前日） */
export function dayBefore(d: Date): Date {
  return addDays(d, -1);
}
