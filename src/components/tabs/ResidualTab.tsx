import { useState } from 'react';
import { calcResidualUsage } from '../../lib/calc';
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
} from '../ui';

/** 機能3: 残薬から何日分使えるか（定期・頓用とも1日の回数で計算） */
export default function ResidualTab() {
  const [timesPerDay, setTimesPerDay] = useState('3');
  const [perDose, setPerDose] = useState('1');
  const [residual, setResidual] = useState('15');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcResidualUsage> | null>(null);

  function run() {
    setError('');
    try {
      const dpd = Number(timesPerDay);
      const pd = Number(perDose);
      const res = Number(residual);
      if (!Number.isFinite(dpd) || dpd <= 0) throw new Error('1日の回数を選んでください');
      if (!Number.isFinite(pd) || pd <= 0) throw new Error('1回量は0より大きい数を入力してください');
      if (!Number.isFinite(res) || res < 0) throw new Error('残薬数は0以上を入力してください');
      setResult(calcResidualUsage(dpd, pd, res));
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  const note = result
    ? `残薬が${result.residual}錠あり、1日${result.dosesPerDay}回・1回${result.perDose}錠で使用する場合、` +
      `${result.fullDays}日分使用可能です` +
      (result.remainderDoses > 0 ? `（さらに${result.remainderDoses}回分）` : '') +
      (result.leftoverTablets > 0 ? `。1回量に満たない${result.leftoverTablets}錠が余ります。` : '。')
    : '';

  return (
    <Panel title="残薬調整（何日分使えるか）" icon="◆">
      <p className="lead">
        1日の回数・1回量・残薬数から、残薬で何日分・何回分使えるかを計算します。頓用の場合は1日あたりの想定回数を選んでください。
      </p>
      <div className="form-row">
        <Field label="1日の回数" hint="頓用は想定回数">
          <select value={timesPerDay} onChange={(e) => setTimesPerDay(e.target.value)}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}回
              </option>
            ))}
          </select>
        </Field>
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
              <ResultItem label="1日の回数" value={`${result.dosesPerDay}回`} />
              <ResultItem label="余る回数（端数）" value={`${result.remainderDoses}回分`} />
              <ResultItem label="使えない端数" value={`${result.leftoverTablets}錠`} />
            </ResultGrid>
          </DetailBox>
        </>
      )}
    </Panel>
  );
}
