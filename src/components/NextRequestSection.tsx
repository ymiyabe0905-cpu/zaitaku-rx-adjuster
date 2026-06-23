import { useState } from 'react';
import { calcNextRequest, buildNextRequestNote } from '../lib/nextRequest';
import { diffDays, parseDate, todayISO } from '../lib/dateUtils';
import {
  CountStepper,
  DetailBox,
  ErrorBox,
  Field,
  GameButton,
  HeroResult,
  NoteBox,
  QuickDays,
  QuickItem,
  ResultGrid,
  ResultItem,
} from './ui';

/**
 * 次回処方依頼モードの共通セクション。
 * 用法から得た「1日使用量(U)」と「パッケージ量(Pk)」を compute() で受け取り、
 * 訪問時の残数・今回処方数・訪問日2つから次回の依頼パッケージ数を計算する。
 */
export function NextRequestSection({
  compute,
  baseUnit,
  pkg,
  quickItems,
}: {
  compute: () => { dailyUse: number; packageSize: number; remainingUnits: number };
  baseUnit: string; // 単位 / 吸入 / 滴
  pkg: string; // 本 / キット
  quickItems?: QuickItem[]; // クイック設定のプリセット（省略時は＋14/21/28日）
}) {
  const [rxPkg, setRxPkg] = useState('1');
  const [visitISO, setVisitISO] = useState(todayISO());
  const [nextVisitISO, setNextVisitISO] = useState(todayISO());
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcNextRequest> | null>(null);

  function run() {
    setError('');
    try {
      const { dailyUse, packageSize, remainingUnits } = compute(); // 用法・在庫の検証もここ
      if (!visitISO || !nextVisitISO) throw new Error('今回訪問日・次回訪問日を入力してください');
      const cycleDays = diffDays(parseDate(visitISO), parseDate(nextVisitISO));
      if (cycleDays <= 0) throw new Error('次回訪問日は今回訪問日より後にしてください');
      const prescribed = Number(rxPkg);
      if (!Number.isFinite(prescribed) || prescribed < 0) throw new Error(`今回処方数（${pkg}）を正しく入力してください`);
      setResult(
        calcNextRequest({
          dailyUse,
          packageSize,
          remainingUnits,
          prescribedPackages: prescribed,
          cycleDays,
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
        訪問時の残数は上の在庫入力（未使用＋使用中の残）をそのまま使います。今回処方数（{pkg}）と訪問日を入れると、
        次サイクル（今回と同じ間隔）に向けて次回処方で依頼すべき{pkg}数を概算します。
      </p>
      <div className="form-row">
        <Field label={`今回処方数（${pkg}）`}>
          <CountStepper value={rxPkg} onChange={setRxPkg} unit={pkg} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="今回訪問日">
          <input type="date" value={visitISO} onChange={(e) => setVisitISO(e.target.value)} />
        </Field>
        <Field label="次回訪問日">
          <input type="date" value={nextVisitISO} onChange={(e) => setNextVisitISO(e.target.value)} />
        </Field>
        <Field label="クイック設定（次回訪問日）">
          <QuickDays baseISO={visitISO} onPick={setNextVisitISO} items={quickItems} />
        </Field>
      </div>

      <GameButton onClick={run}>けいさん</GameButton>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <HeroResult
            items={[
              { label: '次回処方依頼', value: result.requestPackages > 0 ? `${result.requestPackages}${pkg}` : '不要' },
              { label: '次回訪問時の予測残数', value: `約${result.predictedRemainUnits}${baseUnit}` },
              { label: '今サイクル日数', value: `${result.cycleDays}日` },
            ]}
          />
          <NoteBox text={buildNextRequestNote(result, baseUnit, pkg)} />
          <DetailBox>
            <ResultGrid>
              <ResultItem label="1日使用量" value={`${result.dailyUse}${baseUnit}`} />
              <ResultItem label={`1${pkg}あたりの量`} value={`${result.packageSize}${baseUnit}`} />
              <ResultItem label="訪問時の残数" value={`${result.remainingUnits}${baseUnit}`} />
              <ResultItem label="今回処方" value={`${result.prescribedUnits}${baseUnit}`} />
              <ResultItem label="合計量（残数＋今回処方）" value={`${result.totalUnits}${baseUnit}`} />
              <ResultItem label="今サイクル消費量" value={`${result.consumeThisCycle}${baseUnit}`} />
              <ResultItem label="次回訪問時の予測残数" value={`${result.predictedRemainUnits}${baseUnit}`} />
              <ResultItem label="次回必要量" value={`${result.nextNeedUnits}${baseUnit}`} />
              <ResultItem label="次回処方依頼量" value={`${result.requestUnits}${baseUnit}`} accent />
              <ResultItem label="依頼パッケージ数" value={`${result.requestPackages}${pkg}`} accent />
            </ResultGrid>
          </DetailBox>
        </>
      )}
    </>
  );
}
