/**
 * 服用日リストの生成
 *
 * 隔日薬・間隔薬・曜日固定薬・月固定薬は「日数」ではなく
 * 「期間内で実際に服用する日」を列挙して回数を数える。
 */

import { addDays, isOnOrBefore, weekday } from './dateUtils';

/** 一定間隔（N日ごと）に服用する日を列挙。start を起点に step 日ずつ進める */
export function intervalDates(start: Date, end: Date, stepDays: number): Date[] {
  if (stepDays < 1) throw new Error('間隔は1日以上にしてください');
  const out: Date[] = [];
  let cur = start;
  while (isOnOrBefore(cur, end)) {
    out.push(cur);
    cur = addDays(cur, stepDays);
  }
  return out;
}

/**
 * 指定曜日に該当する日をすべて列挙。
 * weekdays は 0(日)〜6(土) の集合。
 */
export function weekdayDates(start: Date, end: Date, weekdays: number[]): Date[] {
  const set = new Set(weekdays);
  const out: Date[] = [];
  let cur = start;
  while (isOnOrBefore(cur, end)) {
    if (set.has(weekday(cur))) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * 毎月決まった日（毎月○日）の服用日を列挙。
 * その月に該当日が存在しない場合（例: 31日で30日までの月）はスキップする。
 */
export function monthlyByDayOfMonth(start: Date, end: Date, dayOfMonth: number): Date[] {
  const out: Date[] = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  // 探索範囲を少し広めに回し、[start, end] に入るものだけ採用
  while (true) {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    if (dayOfMonth <= daysInMonth) {
      const d = new Date(y, m, dayOfMonth);
      if (d.getTime() > endMs(end)) break;
      if (d.getTime() >= startMs(start)) out.push(d);
    }
    // 次の月へ
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    // 念のための安全弁（最大 120 か月）
    if (out.length > 0 && new Date(y, m, 1).getTime() > endMs(end)) break;
    if (y > end.getFullYear() + 11) break;
  }
  return out;
}

function startMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function endMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
