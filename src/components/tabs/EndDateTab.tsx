import { useState } from 'react';
import { calcEndDate, nthDoseEvent } from '../../lib/calc';
import { formatJP, parseDate } from '../../lib/dateUtils';
import { SLOT_LABEL, Slot, dosesPerDay, formatSlots, sortSlots } from '../../lib/timing';
import {
  DetailBox,
  ErrorBox,
  Field,
  GameButton,
  HeroResult,
  Panel,
  ResultGrid,
  ResultItem,
  SlotPicker,
  SlotSelect,
} from '../ui';

/** 機能1: 開始日 + 日数 → 終了日（開始日=1日目）。用法を指定すると飲み終わり日時も表示 */
export default function EndDateTab() {
  const [startISO, setStartISO] = useState('2026-06-17');
  const [days, setDays] = useState('14');
  const [slots, setSlots] = useState<Slot[]>(['morning', 'noon', 'evening']);
  const [startSlot, setStartSlot] = useState<Slot>('morning');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    end: ReturnType<typeof calcEndDate>;
    totalDoses: number;
    finish: { date: Date; slot: Slot }; // 飲み終わり（回数ベース）
    nextDose: { date: Date; slot: Slot }; // 次回の服用（飲み終わりの次）
  } | null>(null);

  function changeSlots(next: Slot[]) {
    setSlots(next);
    if (next.length && !next.includes(startSlot)) setStartSlot(sortSlots(next)[0]);
  }

  function run() {
    setError('');
    try {
      const d = Number(days);
      if (!startISO) throw new Error('開始日を入力してください');
      if (!Number.isFinite(d) || d < 1) throw new Error('日数は1以上の整数で入力してください');
      if (slots.length === 0) throw new Error('用法（服用タイミング）を1つ以上選んでください');
      const start = parseDate(startISO);
      const end = calcEndDate(start, Math.floor(d));
      const totalDoses = Math.floor(d) * dosesPerDay(slots);
      const finish = nthDoseEvent(start, startSlot, slots, totalDoses);
      const nextDose = nthDoseEvent(start, startSlot, slots, totalDoses + 1);
      setResult({ end, totalDoses, finish, nextDose });
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  return (
    <Panel title="日数 → 終了日" icon="▶">
      <p className="lead">
        開始日を1日目として数えます。終了・次回開始は、用法と開始タイミングをもとに回数ベースで「最後に飲む日時／次に飲む日時」を表示します（暦日の終了日は計算内容に表示）。
      </p>
      <div className="form-row">
        <Field label="開始日">
          <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
        </Field>
        <Field label="日数（日分）">
          <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label="開始タイミング">
          <SlotSelect slots={slots} value={startSlot} onChange={setStartSlot} />
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
              { label: '開始', value: `${formatJP(result.end.start)} ${SLOT_LABEL[startSlot]}` },
              {
                label: '終了（飲み終わり）',
                value: `${formatJP(result.finish.date)} ${SLOT_LABEL[result.finish.slot]}`,
              },
            ]}
          />
          <DetailBox>
            <ResultGrid>
              <ResultItem
                label="次回開始"
                value={`${formatJP(result.nextDose.date)} ${SLOT_LABEL[result.nextDose.slot]}`}
              />
              <ResultItem label="日数" value={`${result.end.days}日分`} />
              <ResultItem label="必要服用回数" value={`${result.totalDoses}回`} />
              <ResultItem label="終了日（暦日）" value={formatJP(result.end.end)} />
              <ResultItem label="次回開始日（暦日）" value={formatJP(result.end.nextStart)} />
            </ResultGrid>
          </DetailBox>
        </>
      )}
    </Panel>
  );
}
