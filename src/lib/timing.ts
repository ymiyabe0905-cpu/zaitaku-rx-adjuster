/**
 * 服用タイミング（毎日服用薬の用法）の定義
 *
 * 考え方:
 *  - 1日の中に「スロット（朝・昼・夕・就寝前）」が並んでいる。
 *  - 食前/食後は日数・回数計算に影響しないため区別しない（表記は4時点のみ）。
 *  - 用法はスロットの自由な組み合わせ（例: 毎食＝朝+昼+夕、朝就寝前＝朝+就寝前）。
 *  - 1日量(錠) = スロット数 × 1回量。
 *  - 開始/終了タイミングはその用法が持つスロットの中から選ぶ。
 */

export type Slot = 'morning' | 'noon' | 'evening' | 'bedtime';

/** スロットの並び順（朝→昼→夕→就寝前）。前後関係はこの順で判定する */
export const SLOT_ORDER: Slot[] = ['morning', 'noon', 'evening', 'bedtime'];

export const SLOT_LABEL: Record<Slot, string> = {
  morning: '朝',
  noon: '昼',
  evening: '夕',
  bedtime: '就寝前',
};

/** スロット配列を SLOT_ORDER 順（朝→就寝前）に正規化する */
export function sortSlots(slots: Slot[]): Slot[] {
  return SLOT_ORDER.filter((s) => slots.includes(s));
}

/** 1日の服用回数 */
export function dosesPerDay(slots: Slot[]): number {
  return slots.length;
}

/** スロットのグローバル位置（0=朝 … 3=就寝前） */
export function slotGlobalIndex(slot: Slot): number {
  return SLOT_ORDER.indexOf(slot);
}

/** 用法の表示文字列（例: 朝・昼・夕） */
export function formatSlots(slots: Slot[]): string {
  return sortSlots(slots)
    .map((s) => SLOT_LABEL[s])
    .join('・');
}
