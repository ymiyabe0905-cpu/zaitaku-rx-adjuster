import { useState } from 'react';
import { buildComplianceNote, calcCompliance, rateLabel, statusLabel } from '../lib/compliance';
import { addDays, parseDate, toISO, todayISO } from '../lib/dateUtils';
import {
  DetailBox,
  ErrorBox,
  Field,
  GameButton,
  HeroResult,
  NoteBox,
  ResultGrid,
  ResultItem,
} from './ui';

/**
 * コンプライアンス判定モードの共通セクション。
 * 用法から得た「1日使用量」を compute() で受け取り、前回・今回の残薬から達成率を判定する。
 */
export function ComplianceSection({
  compute,
  baseUnit,
}: {
  compute: () => { dailyUse: number };
  baseUnit: string; // 単位 / 吸入
}) {
  const [prevISO, setPrevISO] = useState(toISO(addDays(new Date(), -14)));
  const [currISO, setCurrISO] = useState(todayISO());
  const [prevRem, setPrevRem] = useState('');
  const [currRem, setCurrRem] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcCompliance> | null>(null);

  function run() {
    setError('');
    try {
      const { dailyUse } = compute(); // 用法の検証もここ
      if (!prevISO || !currISO) throw new Error('前回確認日・今回確認日を入力してください');
      const prevRemain = Number(prevRem);
      const currRemain = Number(currRem);
      if (!Number.isFinite(prevRemain) || prevRemain < 0) throw new Error(`前回残薬（${baseUnit}）を正しく入力してください`);
      if (!Number.isFinite(currRemain) || currRemain < 0) throw new Error(`今回残薬（${baseUnit}）を正しく入力してください`);
      setResult(
        calcCompliance({
          prevDate: parseDate(prevISO),
          currDate: parseDate(currISO),
          prevRemain,
          currRemain,
          dailyUse,
        }),
      );
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  return (
    <>
      <p className="lead">
        前回と今回の残薬（{baseUnit}）から実使用量を出し、用法から見た期待使用量と比べて達成率を判定します（補充なし前提・残薬ベースの参考判定）。
      </p>
      <div className="form-row">
        <Field label="前回確認日">
          <input type="date" value={prevISO} onChange={(e) => setPrevISO(e.target.value)} />
        </Field>
        <Field label="今回確認日">
          <input type="date" value={currISO} onChange={(e) => setCurrISO(e.target.value)} />
        </Field>
      </div>
      <div className="form-row">
        <Field label={`前回残薬（${baseUnit}）`}>
          <input type="number" min={0} value={prevRem} onChange={(e) => setPrevRem(e.target.value)} />
        </Field>
        <Field label={`今回残薬（${baseUnit}）`}>
          <input type="number" min={0} value={currRem} onChange={(e) => setCurrRem(e.target.value)} />
        </Field>
      </div>

      <GameButton onClick={run}>けいさん</GameButton>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <HeroResult
            items={[
              { label: '達成率', value: rateLabel(result) },
              { label: '判定', value: statusLabel(result.status) },
              { label: '実使用量', value: `${result.usedActual}${baseUnit}` },
            ]}
          />
          <NoteBox text={buildComplianceNote(result, baseUnit)} />
          <DetailBox>
            <ResultGrid>
              <ResultItem label="期間日数" value={`${result.periodDays}日`} />
              <ResultItem label="前回残薬" value={`${result.prevRemain}${baseUnit}`} />
              <ResultItem label="今回残薬" value={`${result.currRemain}${baseUnit}`} />
              <ResultItem label="実使用量" value={`${result.usedActual}${baseUnit}`} />
              <ResultItem label="1日使用量" value={`${result.dailyUse}${baseUnit}`} />
              <ResultItem label="期待使用量" value={`${result.expectedUsed}${baseUnit}`} />
              <ResultItem label="達成率" value={rateLabel(result)} accent />
            </ResultGrid>
          </DetailBox>
          <div className="sub-notice">
            ※ 残薬ベースの参考判定です。実際の使用状況・手技・残量表示を確認し、最終判断は医師・薬剤師が行ってください。
          </div>
        </>
      )}
    </>
  );
}
