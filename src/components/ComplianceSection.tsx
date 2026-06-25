import { useState } from 'react';
import { buildComplianceNote, calcCompliance, rateLabel, statusLabel } from '../lib/compliance';
import { addDays, parseDate, toISO, todayISO } from '../lib/dateUtils';
import {
  CountStepper,
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
 * 今回残薬は①の在庫（未使用＋使用中の残）を流用し、前回残薬のみ入力する。
 * compute() は用法から 1日使用量・今回残薬(基本単位)・1パッケージ量 を返す。
 */
export function ComplianceSection({
  compute,
  baseUnit,
  pkg,
}: {
  compute: () => { dailyUse: number; currentRemainUnits: number; packageSize: number };
  baseUnit: string; // 単位 / 吸入
  pkg: string; // 本 / キット
}) {
  const [prevISO, setPrevISO] = useState(toISO(addDays(new Date(), -14)));
  const [currISO, setCurrISO] = useState(todayISO());
  const [prevUnused, setPrevUnused] = useState('0'); // 前回の未使用本数/キット数
  const [prevCurrentRem, setPrevCurrentRem] = useState(''); // 前回の使用中の残（基本単位）
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcCompliance> | null>(null);

  function run() {
    setError('');
    try {
      const { dailyUse, currentRemainUnits, packageSize } = compute(); // 用法・在庫の検証もここ
      if (!prevISO || !currISO) throw new Error('前回確認日・今回確認日を入力してください');
      const prevUnusedN = Math.max(0, Math.floor(Number(prevUnused) || 0));
      const prevCurr = Number(prevCurrentRem);
      if (!Number.isFinite(prevCurr) || prevCurr < 0)
        throw new Error(`前回の使用中の残（${baseUnit}）を正しく入力してください`);
      const prevRemain = prevUnusedN * packageSize + prevCurr;
      setResult(
        calcCompliance({
          prevDate: parseDate(prevISO),
          currDate: parseDate(currISO),
          prevRemain,
          currRemain: currentRemainUnits, // 今回残薬＝①の在庫
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
        今回残薬は①の在庫（未使用＋使用中の残）を使います。前回残薬だけ入力すると、実使用量と達成率を判定します
        （補充なし前提・残薬ベースの参考判定）。
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
        <Field label={`前回の未使用${pkg}数`}>
          <CountStepper value={prevUnused} onChange={setPrevUnused} unit={pkg} />
        </Field>
        <Field label={`前回の使用中の残（${baseUnit}）`}>
          <input type="number" min={0} value={prevCurrentRem} onChange={(e) => setPrevCurrentRem(e.target.value)} />
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
              <ResultItem label="今回残薬（①の在庫）" value={`${result.currRemain}${baseUnit}`} />
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
