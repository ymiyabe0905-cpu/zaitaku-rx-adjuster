import { useState } from 'react';
import { calcResidualUsage } from '../../lib/calc';
import { Slot, formatSlots } from '../../lib/timing';
import {
  DetailBox,
  ErrorBox,
  Field,
  GameButton,
  HeroResult,
  NoteBox,
  Panel,
  ResultGrid,
  ResultItem,
  SlotPicker,
} from '../ui';

/** 機能3: 残薬から何日分使えるか（毎日服用薬） */
export default function ResidualTab() {
  const [slots, setSlots] = useState<Slot[]>(['morning', 'noon', 'evening']);
  const [perDose, setPerDose] = useState('1');
  const [residual, setResidual] = useState('15');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcResidualUsage> | null>(null);

  function run() {
    setError('');
    try {
      if (slots.length === 0) throw new Error('用法（服用タイミング）を1つ以上選んでください');
      const pd = Number(perDose);
      const res = Number(residual);
      if (!Number.isFinite(pd) || pd <= 0) throw new Error('1回量は0より大きい数を入力してください');
      if (!Number.isFinite(res) || res < 0) throw new Error('残薬数は0以上を入力してください');
      setResult(calcResidualUsage(slots, pd, res));
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  const note = result
    ? `残薬が${result.residual}錠あり、現在の用法（1日${result.dosesPerDay}回・1回${result.perDose}錠）では` +
      `${result.fullDays}日分使用可能です` +
      (result.remainderDoses > 0 ? `（さらに${result.remainderDoses}回分）` : '') +
      (result.leftoverTablets > 0 ? `。1回量に満たない${result.leftoverTablets}錠が余ります。` : '。')
    : '';

  return (
    <Panel title="残薬調整（何日分使えるか）" icon="◆">
      <p className="lead">用法・1回量・残薬数から、残薬で何日分・何回分使えるかを計算します。</p>
      <Field label="用法（朝・昼・夕・就寝前を選択）" hint={slots.length ? `現在: ${formatSlots(slots)}（1日${slots.length}回）` : ''}>
        <SlotPicker slots={slots} onChange={setSlots} />
      </Field>
      <div className="form-row">
        <Field label="1回量（錠）">
          <input type="number" min={0} step="0.5" value={perDose} onChange={(e) => setPerDose(e.target.value)} />
        </Field>
        <Field label="残薬数（錠）">
          <input type="number" min={0} value={residual} onChange={(e) => setResidual(e.target.value)} />
        </Field>
      </div>
      <GameButton onClick={run}>けいさん</GameButton>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <HeroResult
            items={[
              { label: '使える日数', value: `${result.fullDays}日分` },
              { label: '使える回数', value: `${result.usableDoses}回分` },
            ]}
          />
          <NoteBox text={note} />
          <DetailBox>
            <ResultGrid>
              <ResultItem label="1日の服用回数" value={`${result.dosesPerDay}回`} />
              <ResultItem label="余る回数（端数）" value={`${result.remainderDoses}回分`} />
              <ResultItem label="使えない端数" value={`${result.leftoverTablets}錠`} />
            </ResultGrid>
          </DetailBox>
        </>
      )}
    </Panel>
  );
}
