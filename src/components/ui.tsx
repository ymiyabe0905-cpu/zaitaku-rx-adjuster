/**
 * 画面共通の小さな UI 部品（8ビット風）
 * 業務で読みやすいよう、入力欄・結果表示はシンプルに保つ。
 */
import { ReactNode } from 'react';
import { addDays, addMonths, formatJP, parseDate, toISO, todayISO } from '../lib/dateUtils';
import { SLOT_LABEL, SLOT_ORDER, Slot, sortSlots } from '../lib/timing';

/** クイック設定の1項目（日数 or 月数） */
export interface QuickItem {
  label: string;
  days?: number;
  months?: number;
}

/**
 * クイック日付ボタン（基準日 + N日／+Nか月 をセット）。
 * 既定は「＋14/21/28日」。items を渡すと任意のプリセット（月数など）にできる。
 */
export function QuickDays({
  baseISO,
  onPick,
  days = [14, 21, 28],
  items,
}: {
  baseISO: string;
  onPick: (iso: string) => void;
  days?: number[];
  items?: QuickItem[];
}) {
  const list: QuickItem[] = items ?? days.map((n) => ({ label: `＋${n}日`, days: n }));
  return (
    <div className="quick-row">
      {list.map((it, i) => (
        <button
          key={i}
          type="button"
          className="quick-btn"
          onClick={() => {
            const base = parseDate(baseISO || todayISO());
            const next = it.months != null ? addMonths(base, it.months) : addDays(base, it.days ?? 0);
            onPick(toISO(next));
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 用法（服用タイミング）選択。
 * 朝・昼・夕・就寝前の4チェックで任意の組み合わせを表現する。
 */
export function SlotPicker({
  slots,
  onChange,
}: {
  slots: Slot[];
  onChange: (next: Slot[]) => void;
}) {
  function toggle(s: Slot) {
    const next = slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s];
    onChange(sortSlots(next));
  }
  return (
    <div className="slot-checks">
      {SLOT_ORDER.map((s) => (
        <label key={s} className={`slot-chip${slots.includes(s) ? ' is-on' : ''}`}>
          <input type="checkbox" checked={slots.includes(s)} onChange={() => toggle(s)} />
          {SLOT_LABEL[s]}
        </label>
      ))}
    </div>
  );
}

/** スロット（開始/終了タイミング）の選択。指定 slots の中から1つ選ぶ */
export function SlotSelect({
  slots,
  value,
  onChange,
}: {
  slots: Slot[];
  value: Slot;
  onChange: (s: Slot) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Slot)}>
      {sortSlots(slots).map((s) => (
        <option key={s} value={s}>
          {SLOT_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

/**
 * 本数・キット数などの小さな整数を、iPadでタップしやすい −／＋ ステッパーで入力する。
 * value/onChange は文字列（他の入力欄と揃えるため）。
 */
export function CountStepper({
  value,
  onChange,
  unit = '',
  min = 0,
  max = 99,
}: {
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  min?: number;
  max?: number;
}) {
  const n = Number(value);
  const cur = Number.isFinite(n) ? n : 0;
  const set = (x: number) => onChange(String(Math.min(max, Math.max(min, x))));
  return (
    <div className="stepper">
      <button type="button" className="step-btn" onClick={() => set(cur - 1)} aria-label="減らす">
        −
      </button>
      <span className="step-val">
        {cur}
        {unit}
      </span>
      <button type="button" className="step-btn" onClick={() => set(cur + 1)} aria-label="増やす">
        ＋
      </button>
    </div>
  );
}

/** 入力欄1行（ラベル＋子要素） */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** ブロック風の見出し付きパネル */
export function Panel({ title, icon, children }: { title: string; icon?: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2 className="panel-title">
        {icon && <span className="panel-icon">{icon}</span>}
        {title}
      </h2>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** スタートボタン風 */
export function GameButton({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'sub' | 'sample';
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={`game-btn game-btn--${variant}`} onClick={onClick}>
      {children}
    </button>
  );
}

/** 結果の1項目（コイン風アイコン＋ラベル＋値） */
export function ResultItem({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={`result-item${accent ? ' result-item--accent' : ''}`}>
      <span className="result-coin">◆</span>
      <span className="result-label">{label}</span>
      <span className="result-value">{value}</span>
    </div>
  );
}

/** 結果項目を並べるグリッド */
export function ResultGrid({ children }: { children: ReactNode }) {
  return <div className="result-grid">{children}</div>;
}

/** 重要指標を大きく目立たせて表示（最終的に知りたい結論） */
export function HeroResult({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="hero-result">
      {items.map((it, i) => (
        <div className="hero-item" key={i}>
          <span className="hero-value">{it.value}</span>
          <span className="hero-label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** 計算内容（根拠）を下にまとめる折りたたみボックス */
export function DetailBox({ children }: { children: ReactNode }) {
  return (
    <details className="detail-box">
      <summary>計算内容（根拠）を表示</summary>
      <div className="detail-body">{children}</div>
    </details>
  );
}

/** 服用予定日一覧 */
export function DateChips({ dates }: { dates: Date[] }) {
  if (dates.length === 0) {
    return <p className="empty-note">該当する服用日はありません。</p>;
  }
  return (
    <div className="date-chips">
      {dates.map((d, i) => (
        <span className="date-chip" key={i}>
          <span className="chip-no">{i + 1}</span>
          {formatJP(d)}
        </span>
      ))}
    </div>
  );
}

/** 参考文ボックス */
export function NoteBox({ text }: { text: string }) {
  return (
    <div className="note-box">
      <div className="note-head">★ 参考文（コピーして使えます）</div>
      <p className="note-text">{text}</p>
    </div>
  );
}

/** エラー表示 */
export function ErrorBox({ message }: { message: string }) {
  return <div className="error-box">⚠ {message}</div>;
}
