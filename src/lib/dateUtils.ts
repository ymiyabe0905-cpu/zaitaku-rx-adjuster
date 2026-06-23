/**
 * 日付計算ユーティリティ
 *
 * 方針:
 *  - 日付は「時刻を持たないローカル日付」として扱う（new Date(年, 月-1, 日)）。
 *  - 日本にはサマータイムが無いため、ミリ秒差は常に 86400000 の倍数になり、
 *    日数差の計算は安全。
 *  - 入力は <input type="date"> が返す "YYYY-MM-DD" 文字列を前提とする。
 */

const MS_PER_DAY = 86400000;
const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** "YYYY-MM-DD" をローカル日付(0時)に変換 */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 当日の "YYYY-MM-DD"（入力欄の初期値などに使う） */
export function todayISO(): string {
  return toISO(new Date());
}

/** Date を "YYYY-MM-DD" に変換 */
export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** n 日後（n が負なら n 日前）。月またぎ・年またぎも正しく処理する */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** n か月後（暦月ベース）。月末日の調整は JS の Date 仕様に従う */
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

/** 同じ日付かどうか */
export function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** a <= b（日付として）かどうか */
export function isOnOrBefore(a: Date, b: Date): boolean {
  return startOfDayMs(a) <= startOfDayMs(b);
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * 2日付の暦日数差（end - start）。同日なら 0。
 * 開始日を1日目として数える「必要日数」は diffDays + 1 で求める。
 */
export function diffDays(start: Date, end: Date): number {
  return Math.round((startOfDayMs(end) - startOfDayMs(start)) / MS_PER_DAY);
}

/** 開始日を含めた日数（開始日=1日目）。終了日が開始日より前なら 0 を返す */
export function inclusiveDayCount(start: Date, end: Date): number {
  const diff = diffDays(start, end);
  return diff < 0 ? 0 : diff + 1;
}

/** 曜日番号(0=日)を返す */
export function weekday(d: Date): number {
  return d.getDay();
}

/** "6月17日(火)" 形式 */
export function formatJP(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAY_JP[d.getDay()]})`;
}

/** "2026/06/17(火)" 形式（年つき） */
export function formatJPFull(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${m}/${day}(${WEEKDAY_JP[d.getDay()]})`;
}

export { WEEKDAY_JP };
