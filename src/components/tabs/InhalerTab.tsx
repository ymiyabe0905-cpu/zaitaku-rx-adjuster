import { useState } from 'react';
import {
  EstimateMethod,
  KIT_PRESETS,
  PrnInput,
  RegularInput,
  buildPrnNote,
  buildRegularNote,
  calcPrn,
  calcRegular,
  fmtNum,
} from '../../lib/inhaler';
import { formatJP, parseDate, todayISO } from '../../lib/dateUtils';
import {
  CountStepper,
  DetailBox,
  ErrorBox,
  Field,
  GameButton,
  HeroResult,
  NoteBox,
  Panel,
  QuickDays,
  ResultGrid,
  ResultItem,
} from '../ui';
import { NextRequestSection } from '../NextRequestSection';

type Mode = 'regular' | 'prn';

/** キット数プリセット選択（共通） */
function KitSelect({
  preset,
  other,
  onPreset,
  onOther,
}: {
  preset: string;
  other: string;
  onPreset: (v: string) => void;
  onOther: (v: string) => void;
}) {
  return (
    <>
      <Field label="1キットあたり総吸入数">
        <select value={preset} onChange={(e) => onPreset(e.target.value)}>
          {KIT_PRESETS.map((k) => (
            <option key={k} value={k}>
              {k}吸入
            </option>
          ))}
          <option value="other">その他</option>
        </select>
      </Field>
      {preset === 'other' && (
        <Field label="総吸入数（手入力）">
          <input type="number" min={1} value={other} onChange={(e) => onOther(e.target.value)} />
        </Field>
      )}
    </>
  );
}

function toNum(s: string, name: string, allowZero = true): number {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n <= 0)) {
    throw new Error(`${name}を正しく入力してください`);
  }
  return n;
}

function kitUnits(preset: string, other: string): number {
  const v = preset === 'other' ? Number(other) : Number(preset);
  if (!Number.isFinite(v) || v <= 0) throw new Error('1キットあたり総吸入数を正しく入力してください');
  return v;
}

/* ===================== 定期吸入 ===================== */
function RegularMode() {
  const [kitPreset, setKitPreset] = useState('60');
  const [kitOther, setKitOther] = useState('');
  const [unusedKits, setUnusedKits] = useState('0');
  const [currentKit, setCurrentKit] = useState('20');
  const [perDose, setPerDose] = useState('1');
  const [timesPerDay, setTimesPerDay] = useState('2');
  const [startISO, setStartISO] = useState(todayISO());
  const [visitISO, setVisitISO] = useState('2026-07-14');
  const [mode, setMode] = useState<'check' | 'request'>('check');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcRegular> | null>(null);

  // 用法から1日使用吸入数(U)・1キット総吸入数(Pk)・訪問時残数(吸入)を求める（次回処方依頼モード用）
  function computeUsage(): { dailyUse: number; packageSize: number; remainingUnits: number } {
    const packageSize = kitUnits(kitPreset, kitOther);
    const dailyUse = Math.floor(toNum(perDose, '1回あたり吸入数', false)) * Number(timesPerDay);
    // 訪問時の残数 = 未使用キット × 1キット総吸入数 ＋ 使用中キットの残吸入数
    const unused = Math.max(0, Math.floor(Number(unusedKits) || 0));
    const curr = Math.max(0, Math.floor(Number(currentKit) || 0));
    const remainingUnits = unused * packageSize + curr;
    return { dailyUse, packageSize, remainingUnits };
  }

  function run() {
    setError('');
    try {
      if (!startISO || !visitISO) throw new Error('開始日・持たせたい日を入力してください');
      const input: RegularInput = {
        totalPerKit: kitUnits(kitPreset, kitOther),
        unusedKits: Math.floor(toNum(unusedKits, '未使用キット数')),
        currentKitRemaining: Math.floor(toNum(currentKit, '使用中キットの残吸入数')),
        perDose: Math.floor(toNum(perDose, '1回あたり吸入数', false)),
        timesPerDay: Number(timesPerDay),
        startDate: parseDate(startISO),
        nextVisitDate: parseDate(visitISO),
        visitInclusion: 'includeVisitDay',
        includeSpare: false,
        spareDays: 0,
      };
      if (input.startDate > input.nextVisitDate) throw new Error('持たせたい日は開始日以降にしてください');
      setResult(calcRegular(input));
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  const visitLabel = '持たせたい日の当日分まで必要';

  return (
    <>
      <div className="mode-toggle">
        <button className={`mode-btn${mode === 'check' ? ' is-active' : ''}`} onClick={() => setMode('check')}>
          残数チェック
        </button>
        <button className={`mode-btn${mode === 'request' ? ' is-active' : ''}`} onClick={() => setMode('request')}>
          次回処方依頼
        </button>
      </div>

      <h3 className="section-head">① 吸入薬</h3>
      <div className="form-row">
        <KitSelect preset={kitPreset} other={kitOther} onPreset={setKitPreset} onOther={setKitOther} />
        <Field label="未使用キット数">
          <CountStepper value={unusedKits} onChange={setUnusedKits} unit="キット" />
        </Field>
        <Field label="使用中キットの残吸入数（0可）">
          <input type="number" min={0} value={currentKit} onChange={(e) => setCurrentKit(e.target.value)} />
        </Field>
      </div>

      <h3 className="section-head">② 使用量</h3>
      <div className="form-row">
        <Field label="1回あたり吸入数">
          <input type="number" min={1} value={perDose} onChange={(e) => setPerDose(e.target.value)} />
        </Field>
        <Field label="1日の使用回数">
          <select value={timesPerDay} onChange={(e) => setTimesPerDay(e.target.value)}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}回</option>
            ))}
          </select>
        </Field>
      </div>

      {mode === 'check' && (
        <>
      <h3 className="section-head">③ 期間</h3>
      <div className="form-row">
        <Field label="開始日">
          <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
        </Field>
        <Field label="持たせたい日" hint="この日まで残数を持たせたい">
          <input type="date" value={visitISO} onChange={(e) => setVisitISO(e.target.value)} />
        </Field>
        <Field label="クイック設定（開始日＋）">
          <QuickDays baseISO={startISO} onPick={setVisitISO} />
        </Field>
      </div>

      <GameButton onClick={run}>けいさん</GameButton>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <HeroResult
            items={[
              { label: '追加キット', value: result.addKits > 0 ? `${result.addKits}キット` : '不要' },
              {
                label: '現在の残量で',
                value: `${result.usableDays}日分＋${result.remainderDoses}回分`,
              },
              { label: '不足吸入数', value: `${Math.max(0, result.shortagePuffs)}吸入` },
            ]}
          />
          <NoteBox text={buildRegularNote(result)} />
          <DetailBox>
            <ResultGrid>
              <ResultItem label="1キットあたり総吸入数" value={`${result.totalPerKit}吸入`} />
              <ResultItem label="未使用キット数" value={`${result.unusedKits}個`} />
              <ResultItem label="使用中キットの残吸入数" value={`${result.currentKitRemaining}吸入`} />
              <ResultItem label="現在の総使用可能吸入数" value={`${result.totalAvailable}吸入`} />
              <ResultItem label="1回あたり吸入数" value={`${result.perDose}吸入`} />
              <ResultItem label="1日の使用回数" value={`${result.timesPerDay}回`} />
              <ResultItem label="1日使用吸入数" value={`${result.dailyPuffs}吸入`} />
              <ResultItem label="開始日" value={formatJP(result.startDate)} />
              <ResultItem label="持たせたい日" value={formatJP(result.nextVisitDate)} />
              <ResultItem label="対象範囲" value={visitLabel} />
              <ResultItem label="必要日数" value={`${result.needDays}日分`} />
              <ResultItem label="必要な吸入数" value={`${result.neededPuffs}吸入`} />
              <ResultItem label="残量で使える日数" value={`${result.usableDays}日分`} />
              <ResultItem label="余り使用回数" value={`${result.remainderDoses}回分`} />
              <ResultItem label="1回量に満たない端数" value={`${result.partialPuffs}吸入`} />
              <ResultItem label="不足吸入数" value={`${Math.max(0, result.shortagePuffs)}吸入`} accent />
              <ResultItem label="追加で必要なキット数" value={`${result.addKits}キット`} accent />
              <ResultItem label="追加後の余り吸入数" value={`${result.leftoverAfter}吸入`} />
            </ResultGrid>
          </DetailBox>
        </>
      )}
        </>
      )}

      {mode === 'request' && (
        <NextRequestSection baseUnit="吸入" pkg="キット" compute={computeUsage} />
      )}
    </>
  );
}

/* ===================== 頓用吸入 ===================== */
function PrnMode() {
  const [kitPreset, setKitPreset] = useState('100');
  const [kitOther, setKitOther] = useState('');
  const [prevISO, setPrevISO] = useState('2026-06-01');
  const [currISO, setCurrISO] = useState('2026-06-15');
  const [prevRem, setPrevRem] = useState('80');
  const [currRem, setCurrRem] = useState('50');
  const [addedKits, setAddedKits] = useState('0');
  const [perDose, setPerDose] = useState('2');
  const [unusedKits, setUnusedKits] = useState('0');
  const [visitISO, setVisitISO] = useState('2026-06-29');
  const [method, setMethod] = useState<EstimateMethod>('average');
  const [manualDaily, setManualDaily] = useState('4');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcPrn> | null>(null);

  function run() {
    setError('');
    try {
      if (!prevISO || !currISO || !visitISO) throw new Error('日付を入力してください');
      const totalPerKit = kitPreset === 'other' ? Number(kitOther) : Number(kitPreset);
      if (!Number.isFinite(totalPerKit) || totalPerKit <= 0)
        throw new Error('1キットあたり総吸入数を正しく入力してください');
      const input: PrnInput = {
        totalPerKit,
        prevDate: parseDate(prevISO),
        currDate: parseDate(currISO),
        prevRemaining: Math.floor(toNum(prevRem, '前回確認時の残吸入数')),
        currRemaining: Math.floor(toNum(currRem, '今回確認時の残吸入数')),
        addedKits: Math.floor(toNum(addedKits, '追加されたキット数')),
        perDose: Math.floor(toNum(perDose, '1回あたり吸入数', false)),
        currentUnusedKits: Math.floor(toNum(unusedKits, '現在の未使用キット数')),
        nextVisitDate: parseDate(visitISO),
        estimateMethod: method,
        manualDailyPuffs: method === 'manual' ? toNum(manualDaily, '1日見込み吸入数', false) : 0,
      };
      setResult(calcPrn(input));
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  const methodLabel = method === 'average' ? '前回〜今回の平均使用量' : '手入力の1日見込み';

  return (
    <>
      <div className="sub-notice">※ 頓用薬のため参考計算です（発作頻度・使用状況で必要量は変動します）。</div>

      <h3 className="section-head">① 吸入薬・前回/今回確認</h3>
      <div className="form-row">
        <Field label="1キットあたり総吸入数">
          <select value={kitPreset} onChange={(e) => setKitPreset(e.target.value)}>
            <option value="100">メプチン（100吸入）</option>
            <option value="other">その他</option>
          </select>
        </Field>
        {kitPreset === 'other' && (
          <Field label="総吸入数（手入力）">
            <input type="number" min={1} value={kitOther} onChange={(e) => setKitOther(e.target.value)} />
          </Field>
        )}
        <Field label="前回確認日">
          <input type="date" value={prevISO} onChange={(e) => setPrevISO(e.target.value)} />
        </Field>
        <Field label="今回確認日">
          <input type="date" value={currISO} onChange={(e) => setCurrISO(e.target.value)} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="前回確認時の残吸入数">
          <input type="number" min={0} value={prevRem} onChange={(e) => setPrevRem(e.target.value)} />
        </Field>
        <Field label="今回確認時の残吸入数" hint="＝現在の使用中キットの残（総数計算にも使用）">
          <input type="number" min={0} value={currRem} onChange={(e) => setCurrRem(e.target.value)} />
        </Field>
        <Field label="前回〜今回に追加されたキット数">
          <CountStepper value={addedKits} onChange={setAddedKits} unit="キット" />
        </Field>
      </div>

      <h3 className="section-head">② 現在の残量・見込み</h3>
      <div className="form-row">
        <Field label="1回あたり吸入数">
          <input type="number" min={1} value={perDose} onChange={(e) => setPerDose(e.target.value)} />
        </Field>
        <Field label="現在の未使用キット数">
          <CountStepper value={unusedKits} onChange={setUnusedKits} unit="キット" />
        </Field>
        <Field label="持たせたい日" hint="この日まで残数を持たせたい">
          <input type="date" value={visitISO} onChange={(e) => setVisitISO(e.target.value)} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="見込み使用量の計算方法">
          <select value={method} onChange={(e) => setMethod(e.target.value as EstimateMethod)}>
            <option value="average">前回から今回までの平均使用量で見込む</option>
            <option value="manual">手入力で1日見込み吸入数を入れる</option>
          </select>
        </Field>
        {method === 'manual' && (
          <Field label="手入力の1日見込み吸入数">
            <input type="number" min={0} step="0.5" value={manualDaily} onChange={(e) => setManualDaily(e.target.value)} />
          </Field>
        )}
      </div>

      <GameButton onClick={run}>けいさん</GameButton>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <HeroResult
            items={[
              { label: '1日平均使用', value: `${fmtNum(result.avgDaily)}吸入` },
              {
                label: '次回まで足りる？',
                value: result.shortagePuffs > 0 ? `不足${fmtNum(result.shortagePuffs)}吸入` : '足りる見込み',
              },
              { label: '追加キット', value: result.addKits > 0 ? `${result.addKits}キット` : '不要' },
            ]}
          />
          <NoteBox text={buildPrnNote(result)} />
          <DetailBox>
            <ResultGrid>
              <ResultItem label="1キットあたり総吸入数" value={`${result.totalPerKit}吸入`} />
              <ResultItem label="前回確認日" value={formatJP(result.prevDate)} />
              <ResultItem label="今回確認日" value={formatJP(result.currDate)} />
              <ResultItem label="前回確認時の残吸入数" value={`${result.prevRemaining}吸入`} />
              <ResultItem label="今回確認時の残吸入数" value={`${result.currRemaining}吸入`} />
              <ResultItem label="追加されたキット数" value={`${result.addedKits}キット`} />
              <ResultItem label="前回〜今回の使用吸入数" value={`${result.usedPuffs}吸入`} />
              <ResultItem label="前回〜今回の日数" value={`${result.periodDays}日`} />
              <ResultItem label="1日平均使用吸入数" value={`${fmtNum(result.avgDaily)}吸入`} />
              <ResultItem label="現在の未使用キット数" value={`${result.currentUnusedKits}個`} />
              <ResultItem label="現在の総使用可能吸入数" value={`${result.totalAvailable}吸入（未使用＋今回確認時の残）`} />
              <ResultItem label="持たせたい日" value={formatJP(result.nextVisitDate)} />
              <ResultItem label="持たせたい日までの日数" value={`${result.daysToVisit}日`} />
              <ResultItem label="見込みに使った1日吸入数" value={`${fmtNum(result.estDaily)}吸入（${methodLabel}）`} />
              <ResultItem label="見込み必要吸入数" value={`${fmtNum(result.estNeeded)}吸入`} />
              <ResultItem label="不足吸入数" value={`${Math.max(0, result.shortagePuffs)}吸入`} accent />
              <ResultItem label="追加で必要なキット数" value={`${result.addKits}キット`} accent />
            </ResultGrid>
          </DetailBox>
        </>
      )}
    </>
  );
}

export default function InhalerTab() {
  const [mode, setMode] = useState<Mode>('regular');
  return (
    <Panel title="吸入薬残数" icon="◆">
      <p className="lead">
        確認できる残吸入数（残量カウンター）をもとに計算します。カウンターなしの理論残数や、空噴霧・試し噴霧の差し引きには対応しません。
      </p>
      <div className="mode-toggle">
        <button className={`mode-btn${mode === 'regular' ? ' is-active' : ''}`} onClick={() => setMode('regular')}>
          定期吸入モード
        </button>
        <button className={`mode-btn${mode === 'prn' ? ' is-active' : ''}`} onClick={() => setMode('prn')}>
          頓用吸入モード
        </button>
      </div>

      {mode === 'regular' ? <RegularMode /> : <PrnMode />}

      <div className="sub-notice">
        ※ この計算結果は確認用です。吸入手技、残量カウンター、実際の使用状況、発作頻度、医師の指示を確認し、最終判断は医師・薬剤師が行ってください。
      </div>
      <div className="sub-notice">
        ※ 頓用吸入薬の計算は、過去の使用量からの参考計算です。今後の発作頻度を保証するものではありません。
      </div>
    </Panel>
  );
}
