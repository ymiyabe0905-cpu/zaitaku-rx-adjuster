/**
 * 計算ロジック本体（UI から分離）
 *
 * 重要な設計ルール（依頼仕様より）:
 *  - 開始日は「1日目」として数える。
 *  - 毎日服用薬は「服用回数ベース」で計算し、最後に処方日数へ変換する。
 *      必要錠数   = 必要服用回数 × 1回量
 *      1日量(錠)  = 1日の服用回数 × 1回量
 *      処方日数   = ceil(不足錠数 / 1日量)        ← 錠数と日数は別物
 *  - 残薬があれば必要錠数から差し引く。
 *  - 服用タイミング（朝・昼・夕・就寝前）はグローバルな並び順で前後を判定し、
 *    初日・最終日の部分回（端数）を正しく数える。
 *  - 隔日薬・曜日固定薬・月固定薬は、期間内の実際の服用日を列挙して回数を数える。
 */

import {
  addDays,
  formatJP,
  inclusiveDayCount,
  isOnOrBefore,
  isSameDate,
  toISO,
} from './dateUtils';
import { Slot, SLOT_LABEL, dosesPerDay, slotGlobalIndex, sortSlots } from './timing';

/* ============================================================
 * 機能1: 開始日 + 日数 → 終了日（開始日=1日目）
 * ========================================================== */
export interface EndDateResult {
  start: Date;
  end: Date;
  nextStart: Date; // 終了日の翌日
  days: number;
}

export function calcEndDate(start: Date, days: number): EndDateResult {
  if (days < 1) throw new Error('日数は1以上を入力してください');
  // 開始日が1日目なので、終了日 = 開始日 + (days - 1)
  const end = addDays(start, days - 1);
  const nextStart = addDays(end, 1);
  return { start, end, nextStart, days };
}

/* ============================================================
 * 機能2: 開始日 + 終了日 → 必要日数（開始日を含めて数える）
 * ========================================================== */
export interface RequiredDaysResult {
  start: Date;
  end: Date;
  nextStart: Date;
  days: number;
}

export function calcRequiredDays(start: Date, end: Date): RequiredDaysResult {
  const days = inclusiveDayCount(start, end);
  return { start, end, nextStart: addDays(end, 1), days };
}

/* ============================================================
 * 服用イベント（日付 + スロット）の集計
 *  - グローバルなスロット順（朝<昼<夕<就寝前）で前後を判定する
 * ========================================================== */

/**
 * 服用境界 (開始日・開始スロット) 〜 (終了日・終了スロット) の間に入る
 * 服用イベント数を数える。
 *  - 用法 slots は任意のスロット集合（例: 朝夕、毎食、朝就寝前 など）。
 *  - 終了スロットが slots に含まれていなくても、その時点までを正しく数える
 *    （定期薬と追加薬の用法が違うケースに対応）。
 */
export function countDosesInRange(
  startDate: Date,
  startSlot: Slot,
  endDate: Date,
  endSlot: Slot,
  slots: Slot[],
): number {
  if (!isOnOrBefore(startDate, endDate)) return 0;
  const ordered = sortSlots(slots);
  const startGI = slotGlobalIndex(startSlot);
  const endGI = slotGlobalIndex(endSlot);
  let count = 0;
  let cur = startDate;
  while (isOnOrBefore(cur, endDate)) {
    for (const s of ordered) {
      const gi = slotGlobalIndex(s);
      // 開始境界より前のスロットは除外
      if (isSameDate(cur, startDate) && gi < startGI) continue;
      // 終了境界より後のスロットは除外
      if (isSameDate(cur, endDate) && gi > endGI) continue;
      count++;
    }
    cur = addDays(cur, 1);
  }
  return count;
}

/**
 * 開始(日付・スロット)から数えて count 回目の服用イベント(日付・スロット)を返す。
 * 定期薬の「処方日数分を回数ベースで飲み切る最後の服用日時」を求めるのに使う。
 */
export function nthDoseEvent(
  startDate: Date,
  startSlot: Slot,
  slots: Slot[],
  count: number,
): { date: Date; slot: Slot } {
  if (count < 1) throw new Error('服用回数は1以上が必要です');
  const ordered = sortSlots(slots);
  const startGI = slotGlobalIndex(startSlot);
  let n = 0;
  let cur = startDate;
  // 安全弁（最大 10 年分）
  const limit = addDays(startDate, 366 * 10);
  while (isOnOrBefore(cur, limit)) {
    for (const s of ordered) {
      const gi = slotGlobalIndex(s);
      if (isSameDate(cur, startDate) && gi < startGI) continue;
      n++;
      if (n === count) return { date: cur, slot: s };
    }
    cur = addDays(cur, 1);
  }
  throw new Error('飲み終わり日時の計算範囲を超えました');
}

/* ============================================================
 * 機能3: 残薬から何日分使えるか（毎日服用薬）
 * ========================================================== */
export interface ResidualUsageResult {
  perDose: number; // 1回量
  dosesPerDay: number; // 1日の服用回数
  residual: number; // 残薬(錠)
  usableDoses: number; // 服用できる回数
  fullDays: number; // まるまる使える日数
  remainderDoses: number; // 余る回数（1日に満たない端数）
  leftoverTablets: number; // 1回量に満たず使えない錠数
}

export function calcResidualUsage(
  slots: Slot[],
  perDose: number,
  residual: number,
): ResidualUsageResult {
  const dpd = dosesPerDay(slots);
  const usableDoses = Math.floor(residual / perDose);
  const leftoverTablets = residual - usableDoses * perDose; // 1回分に満たない端数(錠)
  const fullDays = Math.floor(usableDoses / dpd);
  const remainderDoses = usableDoses - fullDays * dpd;
  return {
    perDose,
    dosesPerDay: dpd,
    residual,
    usableDoses,
    fullDays,
    remainderDoses,
    leftoverTablets,
  };
}

/* ============================================================
 * 機能4 + 5: 追加薬を定期薬の終了タイミングに合わせる
 *  - 定期薬: 用法 + 開始タイミング + 処方日数 → 実際の飲み終わり日時を回数ベースで算出
 *  - 追加薬: その飲み終わり日時に合わせ、必要服用回数→必要錠数→処方日数へ変換
 * ========================================================== */
export interface DailyAdjustInput {
  addStart: Date; // 追加薬の開始日
  addSlots: Slot[]; // 追加薬の用法
  addStartSlot: Slot; // 追加薬の開始タイミング
  perDose: number; // 追加薬の1回量
  residual: number; // 追加薬の残薬
  teikiStart: Date; // 定期薬の開始日
  teikiSlots: Slot[]; // 定期薬の用法
  teikiStartSlot: Slot; // 定期薬の開始タイミング
  teikiDays: number; // 定期薬の処方日数（日分）
}

export interface DailyAdjustResult {
  addStart: Date;
  addStartSlot: Slot; // 追加薬の開始タイミング
  endDate: Date; // 定期薬の飲み終わり日（＝追加薬を合わせる日）
  endSlot: Slot; // 定期薬の飲み終わりタイミング
  nextStart: Date; // 飲み終わりの翌日
  spanDays: number; // 追加薬の開始日〜飲み終わり日の暦日数
  teikiTotalDoses: number; // 定期薬の総服用回数（処方日数 × 1日回数）
  dosesPerDay: number; // 追加薬の1日服用回数
  requiredDoses: number; // 追加薬の必要服用回数
  perDose: number;
  requiredTablets: number; // 追加薬の必要錠数
  residual: number;
  shortageTablets: number; // 不足錠数（残薬差引後、マイナスは0）
  dailyTablets: number; // 追加薬の1日量(錠)
  prescriptionDays: number; // 処方上必要な日数（不足錠を切り上げ）
  dispensedTablets: number; // 処方日数で実際に出る錠数
  leftoverForecast: number; // 余る見込み
}

export function calcDailyAdjust(input: DailyAdjustInput): DailyAdjustResult {
  const {
    addStart,
    addSlots,
    addStartSlot,
    perDose,
    residual,
    teikiStart,
    teikiSlots,
    teikiStartSlot,
    teikiDays,
  } = input;

  // 1) 定期薬の飲み終わり日時を回数ベースで算出
  const teikiTotalDoses = teikiDays * dosesPerDay(teikiSlots);
  const end = nthDoseEvent(teikiStart, teikiStartSlot, teikiSlots, teikiTotalDoses);

  // 2) 追加薬の必要服用回数（開始タイミング〜飲み終わり日時）
  const dpd = dosesPerDay(addSlots);
  const requiredDoses = countDosesInRange(
    addStart,
    addStartSlot,
    end.date,
    end.slot,
    addSlots,
  );
  const requiredTablets = requiredDoses * perDose;
  const shortageTablets = Math.max(0, requiredTablets - residual);
  const dailyTablets = dpd * perDose;
  const prescriptionDays =
    shortageTablets > 0 ? Math.ceil(shortageTablets / dailyTablets) : 0;
  const dispensedTablets = prescriptionDays * dailyTablets;
  const leftoverForecast = residual + dispensedTablets - requiredTablets;

  return {
    addStart,
    addStartSlot,
    endDate: end.date,
    endSlot: end.slot,
    nextStart: addDays(end.date, 1),
    spanDays: inclusiveDayCount(addStart, end.date),
    teikiTotalDoses,
    dosesPerDay: dpd,
    requiredDoses,
    perDose,
    requiredTablets,
    residual,
    shortageTablets,
    dailyTablets,
    prescriptionDays,
    dispensedTablets,
    leftoverForecast,
  };
}

/* ============================================================
 * 隔日/間隔/曜日固定/月固定: 服用日リストから集計
 * ========================================================== */
export interface ScheduleResult {
  dates: Date[];
  doseCount: number; // 服用回数
  perDose: number;
  requiredTablets: number; // 必要錠数
  residual: number;
  shortageTablets: number; // 不足錠数
}

export function calcScheduleResult(
  dates: Date[],
  perDose: number,
  residual: number,
): ScheduleResult {
  const doseCount = dates.length;
  const requiredTablets = doseCount * perDose;
  const shortageTablets = Math.max(0, requiredTablets - residual);
  return { dates, doseCount, perDose, requiredTablets, residual, shortageTablets };
}

/* ============================================================
 * 参考文（実務でそのまま使える説明文）の自動生成
 * ========================================================== */

/** 機能4: 追加薬を定期薬に合わせる用 */
export function buildDailyAdjustNote(r: DailyAdjustResult): string {
  const usable = Math.floor(r.residual / r.perDose); // 残薬で使える回数
  const usableDays = Math.floor(usable / r.dosesPerDay);
  const endStr = `${formatJP(r.endDate)}の${SLOT_LABEL[r.endSlot]}`;
  const head =
    r.residual > 0
      ? `追加薬の残薬が${r.residual}錠あり、現在の用法（1日${r.dosesPerDay}回・1回${r.perDose}錠）では約${usableDays}日分（${usable}回分）使用可能です。`
      : `追加薬の残薬はありません。`;
  if (r.shortageTablets <= 0) {
    return (
      head +
      `定期薬の飲み終わり（${endStr}）に合わせるには残薬で足ります（追加処方は不要）。` +
      `必要錠数は${r.requiredTablets}錠で、${r.leftoverForecast}錠余る見込みです。`
    );
  }
  return (
    head +
    `定期薬の飲み終わり（${endStr}）に合わせるには、必要服用回数${r.requiredDoses}回・必要錠数${r.requiredTablets}錠で、` +
    `不足は${r.shortageTablets}錠です。今回は${r.prescriptionDays}日分の処方が必要です` +
    `（${r.prescriptionDays}日分＝${r.dispensedTablets}錠、${r.leftoverForecast}錠余る見込み）。` +
    `次回開始日は${formatJP(r.nextStart)}です。`
  );
}

/** 隔日/間隔/曜日固定/月固定用（回数・錠数中心） */
export function buildScheduleNote(
  r: ScheduleResult,
  label: string,
  start: Date,
  end: Date,
): string {
  if (r.doseCount === 0) {
    return `${formatJP(start)}〜${formatJP(end)}の期間に、${label}の服用日はありません。`;
  }
  const base =
    `${label}：${formatJP(start)}〜${formatJP(end)}の期間に${r.doseCount}回服用します。` +
    `必要錠数は${r.requiredTablets}錠（1回${r.perDose}錠）です。`;
  if (r.residual > 0) {
    return r.shortageTablets > 0
      ? base + `残薬${r.residual}錠を差し引くと、不足は${r.shortageTablets}錠です。`
      : base + `残薬${r.residual}錠で足ります（不足なし）。`;
  }
  return base;
}

/* 表示補助 */
export function joinDatesJP(dates: Date[]): string {
  return dates.map(formatJP).join('、');
}
export function datesToISO(dates: Date[]): string[] {
  return dates.map(toISO);
}
