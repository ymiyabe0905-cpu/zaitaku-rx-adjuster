/**
 * モルヒネ持続投与デバイスの定義（設定ファイル）
 *
 * デバイス名は後から追加・修正できるよう、この配列だけを編集すればよい構成にしている。
 * デバイスごとの特殊仕様（PCA固有の設定など）は現時点では持たせず、共通計算で扱う。
 * 将来デバイス別の既定値や制約を持たせる場合は、この型にプロパティを足す。
 */

export interface MorphineDevice {
  key: string; // 内部識別子（履歴保存や状態管理で使う安定した値）
  label: string; // 画面表示名
}

export const MORPHINE_DEVICES: MorphineDevice[] = [
  { key: 'syringe_pump', label: 'シリンジポンプ' },
  { key: 'legacy', label: 'レガシー' },
  { key: 'cadd', label: 'クデクエイミー' },
  { key: 'other', label: 'その他' },
];

/** key から表示名を得る。未知の key はそのまま返す（表示が消えないように） */
export function deviceLabel(key: string): string {
  return MORPHINE_DEVICES.find((d) => d.key === key)?.label ?? key;
}
