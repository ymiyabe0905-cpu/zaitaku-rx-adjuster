import { useState } from 'react';
import { calcRequiredDays, countDosesInRange } from '../../lib/calc';
import { formatJP, isOnOrBefore, parseDate, todayISO } from '../../lib/dateUtils';
import { SLOT_LABEL, Slot, formatSlots, sortSlots } from '../../lib/timing';
import {
  DetailBox,
  ErrorBox,
  Field,
  GameButton,
  HeroResult,
  Panel,
  QuickDays,
  ResultGrid,
  ResultItem,
  SlotPicker,
  SlotSelect,
} from '../ui';

/**
 * 機能2: 開始日 + 終了日 → 必要日数（開始日を含めて数える）。
 * 用法・開始タイミングを指定すると、終了日の最後の服用までの服用回数も表示する。
 */
export default function RequiredDaysTab() {
  const [startISO, setStartISO] = useState(todayISO());
  const [endISO, setEndISO] = useState('2026-06-30');
  const [slots, setSlots] = useState<Slot[]>(['morning', 'noon', 'evening']);
  const [startSlot, setStartSlot] = useState<Slot>('morning');
  const [perDose, setPerDose] = useState('1');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    base: ReturnType<typeof calcRequiredDays>;
    doses: number;
    endSlot: Slot;
    requiredTablets: number; // 必要錠数 = 服用回数 × 1回量
    dispensedTablets: number; // 必要日数分を処方したときの錠数
    leftoverTablets: number; // 余る錠数（処方錠数 − 必要錠数）
  } | null>(null);

  function changeSlots(next: Slot[]) {
    setSlots(next);
    if (next.length && !next.includes(startSlot)) setStartSlot(sortSlots(next)[0]);
  }

  function run() {
    setError('');
    try {
      if (!startISO || !endISO) throw new Error('開始日と終了日を入力してください');
      if (slots.length === 0) throw new Error('用法（服用タイミング）を1つ以上選んでください');
      const pd = Number(perDose);
      if (!Number.isFinite(pd) || pd <= 0) throw new Error('1回量は0より大きい数を入力してください');
      const s = parseDate(startISO);
      const e = parseDate(endISO);
      if (!isOnOrBefore(s, e)) throw new Error('終了日は開始日以降にしてください');
      // 終了タイミングは終了日の最後の服用スロットとみなす
      const endSlot = sortSlots(slots)[slots.length - 1];
      const doses = countDosesInRange(s, startSlot, e, endSlot, slots);
      const base = calcRequiredDays(s, e);
      const requiredTablets = doses * pd;
      const dispensedTablets = base.days * slots.length * pd; // 必要日数 × 1日量(錠)
      const leftoverTablets = dispensedTablets - requiredTablets;
      setResult({ base, doses, endSlot, requiredTablets, dispensedTablets, leftoverTablets });
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  return (
    <Panel title="終了日 → 必要日数" icon="◀">
      <p className="lead">
        合わせたい終了日まで、開始日を含めて何日分必要かを逆算します。用法・1回量を指定すると、
        必要日数分を処方したときに余る錠数も表示します（終了日はその日の最後の服用まで飲む前提）。
      </p>
      <div className="form-row">
        <Field label="開始日">
          <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
        </Field>
        <Field label="合わせたい終了日">
          <input type="date" value={endISO} onChange={(e) => setEndISO(e.target.value)} />
        </Field>
        <Field label="クイック設定（開始日＋）">
          <QuickDays baseISO={startISO} onPick={setEndISO} />
        </Field>
        <Field label="開始タイミング">
          <SlotSelect slots={slots} value={startSlot} onChange={setStartSlot} />
        </Field>
        <Field label="1回量（錠）">
          <input type="number" min={0} step="0.5" value={perDose} onChange={(e) => setPerDose(e.target.value)} />
        </Field>
      </div>
      <Field label="用法（朝・昼・夕・就寝前）" hint={slots.length ? `現在: ${formatSlots(slots)}（1日${slots.length}回）` : ''}>
        <SlotPicker slots={slots} onChange={changeSlots} />
      </Field>
      <GameButton onClick={run}>けいさん</GameButton>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <HeroResult
            items={[
              { label: '必要日数', value: `${result.base.days}日分` },
              { label: '余る錠数', value: `${result.leftoverTablets}錠` },
            ]}
          />
          <DetailBox>
            <ResultGrid>
              <ResultItem label="次回開始日" value={formatJP(result.base.nextStart)} />
              <ResultItem
                label="開始"
                value={`${formatJP(result.base.start)} ${SLOT_LABEL[startSlot]}`}
              />
              <ResultItem
                label="終了日"
                value={`${formatJP(result.base.end)} ${SLOT_LABEL[result.endSlot]}まで`}
              />
              <ResultItem label="必要服用回数" value={`${result.doses}回`} />
              <ResultItem label="必要錠数" value={`${result.requiredTablets}錠`} />
              <ResultItem label="処方錠数（必要日数分）" value={`${result.dispensedTablets}錠`} />
            </ResultGrid>
          </DetailBox>
        </>
      )}
    </Panel>
  );
}
