import { useState } from 'react';
import {
  EyeTarget,
  EyedropInput,
  RatioKey,
  RATIO_OPTIONS,
  VolumePreset,
  buildEyedropNote,
  calcEyedrop,
  dropsPerBottle,
  volumeLabel,
} from '../../lib/eyedrops';
import { formatJP, parseDate, todayISO } from '../../lib/dateUtils';
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
import { NextRequestSection } from '../NextRequestSection';

function toNum(s: string, name: string, allowZero = true): number {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n <= 0)) {
    throw new Error(`${name}を正しく入力してください`);
  }
  return n;
}

export default function EyedropTab() {
  const [preset, setPreset] = useState<VolumePreset>('5');
  const [volumeOther, setVolumeOther] = useState('3');
  const [unusedBottles, setUnusedBottles] = useState('0');
  // 残量は割合のみで入力。初期は未選択（空）
  const [ratioKey, setRatioKey] = useState<RatioKey | ''>('');
  const [target, setTarget] = useState<EyeTarget>('both');
  const [timesPerDay, setTimesPerDay] = useState('2');
  const [startISO, setStartISO] = useState(todayISO());
  const [visitISO, setVisitISO] = useState('2026-07-14');
  const [mode, setMode] = useState<'check' | 'request'>('check');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcEyedrop> | null>(null);

  // 表示用の1本あたり換算滴数（入力中もリアルタイムに表示）
  const volumeMlNow = preset === 'other' ? Number(volumeOther) || 0 : preset === '5' ? 5 : 2.5;
  const perBottleNow = dropsPerBottle(preset, volumeMlNow);

  function run() {
    setError('');
    try {
      if (!startISO || !visitISO) throw new Error('開始日・持たせたい日を入力してください');
      if (ratioKey === '') throw new Error('使用中ボトルの残量割合を選んでください');
      const volumeMl = preset === 'other' ? toNum(volumeOther, '容量(mL)', false) : volumeMlNow;
      const input: EyedropInput = {
        preset,
        volumeMl,
        unusedBottles: Math.floor(toNum(unusedBottles, '未使用本数')),
        remainMode: 'ratio',
        currentDrops: 0,
        ratioKey,
        target,
        dropsPerEyeDose: 1, // 1眼あたりの1回滴数は1滴で固定
        timesPerDay: Number(timesPerDay),
        startDate: parseDate(startISO),
        nextVisitDate: parseDate(visitISO),
      };
      if (input.startDate > input.nextVisitDate) throw new Error('次回訪問日は開始日以降にしてください');
      setResult(calcEyedrop(input));
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  return (
    <Panel title="点眼薬残数" icon="◆">
      <p className="lead">
        点眼薬の容量から滴数を概算します（5mL＝100滴、2.5mL＝50滴、1mLあたり20滴）。厳密計算ではなく確認用です。
      </p>

      <div className="mode-toggle">
        <button className={`mode-btn${mode === 'check' ? ' is-active' : ''}`} onClick={() => setMode('check')}>
          残数チェック
        </button>
        <button className={`mode-btn${mode === 'request' ? ' is-active' : ''}`} onClick={() => setMode('request')}>
          次回処方依頼
        </button>
      </div>

      {/* 点眼薬 */}
      <h3 className="section-head">① 点眼薬</h3>
      <div className="form-row">
        <Field label="点眼薬容量">
          <select value={preset} onChange={(e) => setPreset(e.target.value as VolumePreset)}>
            <option value="5">5mL</option>
            <option value="2.5">2.5mL</option>
            <option value="other">その他</option>
          </select>
        </Field>
        {preset === 'other' && (
          <Field label="容量（mL・手入力）">
            <input type="number" min={0} step="0.1" value={volumeOther} onChange={(e) => setVolumeOther(e.target.value)} />
          </Field>
        )}
        <Field label="1本あたり換算滴数（自動）" hint="1mLあたり20滴で換算">
          <input type="text" value={`${perBottleNow}滴`} readOnly />
        </Field>
        <Field label="未使用本数">
          <input type="number" min={0} value={unusedBottles} onChange={(e) => setUnusedBottles(e.target.value)} />
        </Field>
      </div>

      {/* 使用中ボトルの残量（割合のみ） */}
      <h3 className="section-head">② 使用中ボトルの残量（割合）</h3>
      <div className="form-row">
        <Field label="使用中ボトルの残量割合" hint="概算（残量カウンターのような正確な値ではありません）">
          <select value={ratioKey} onChange={(e) => setRatioKey(e.target.value as RatioKey | '')}>
            <option value="">選択してください</option>
            {RATIO_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}（×{o.factor}）
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* 点眼方法 */}
      <h3 className="section-head">③ 点眼方法</h3>
      <div className="form-row">
        <Field label="点眼対象">
          <select value={target} onChange={(e) => setTarget(e.target.value as EyeTarget)}>
            <option value="right">右眼</option>
            <option value="left">左眼</option>
            <option value="both">両眼</option>
          </select>
        </Field>
        <Field label="1眼あたりの1回滴数" hint="1滴で固定">
          <input type="text" value="1滴" readOnly />
        </Field>
        <Field label="1日の点眼回数">
          <select value={timesPerDay} onChange={(e) => setTimesPerDay(e.target.value)}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}回</option>
            ))}
          </select>
        </Field>
      </div>

      {mode === 'check' && (
        <>
      {/* 期間 */}
      <h3 className="section-head">④ 期間</h3>
      <div className="form-row">
        <Field label="開始日">
          <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
        </Field>
        <Field label="持たせたい日" hint="この日まで残数を持たせたい（次回訪問・受診・配達など）">
          <input type="date" value={visitISO} onChange={(e) => setVisitISO(e.target.value)} />
        </Field>
      </div>

      <GameButton onClick={run}>けいさん</GameButton>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <HeroResult
            items={[
              { label: '追加本数', value: result.addBottles > 0 ? `${result.addBottles}本` : '不要' },
              {
                label: '現在の残量で',
                value: `${result.usableDays}日分＋${result.remainderUses}回分`,
              },
              { label: '不足滴数', value: `${Math.max(0, result.shortageDrops)}滴` },
            ]}
          />
          <NoteBox text={buildEyedropNote(result)} />
          <DetailBox>
            <ResultGrid>
              <ResultItem label="点眼薬容量" value={volumeLabel(result)} />
              <ResultItem label="1mLあたり換算滴数" value={`${result.dropsPerMl}滴`} />
              <ResultItem label="1本あたり換算滴数" value={`${result.dropsPerBottle}滴`} />
              <ResultItem label="未使用本数" value={`${result.unusedBottles}本`} />
              <ResultItem label="使用中ボトルの残滴数" value={`約${result.currentBottleDrops}滴`} />
              <ResultItem label="現在の総使用可能滴数" value={`${result.totalAvailable}滴`} />
              <ResultItem label="点眼対象" value={result.target === 'both' ? '両眼' : result.target === 'right' ? '右眼' : '左眼'} />
              <ResultItem label="対象眼数" value={`${result.eyes}眼`} />
              <ResultItem label="1眼あたりの1回滴数" value={`${result.dropsPerEyeDose}滴`} />
              <ResultItem label="1回使用滴数" value={`${result.dosePerUse}滴`} />
              <ResultItem label="1日の点眼回数" value={`${result.timesPerDay}回`} />
              <ResultItem label="1日使用滴数" value={`${result.dailyDrops}滴`} />
              <ResultItem label="開始日" value={formatJP(result.startDate)} />
              <ResultItem label="持たせたい日" value={formatJP(result.nextVisitDate)} />
              <ResultItem label="必要日数" value={`${result.needDays}日分`} />
              <ResultItem label="必要な滴数" value={`${result.neededDrops}滴`} />
              <ResultItem label="残量で使える日数" value={`${result.usableDays}日分`} />
              <ResultItem label="余り回数" value={`${result.remainderUses}回分`} />
              <ResultItem label="1回量に満たない端数" value={`${result.partialDrops}滴`} />
              <ResultItem label="不足滴数" value={`${Math.max(0, result.shortageDrops)}滴`} accent />
              <ResultItem label="追加で必要な本数" value={`${result.addBottles}本`} accent />
              <ResultItem label="追加後の余り滴数" value={`${result.leftoverAfter}滴`} />
            </ResultGrid>
          </DetailBox>

          <div className="sub-notice">
            ※ この計算結果は確認用です。このアプリでは、点眼薬の滴数を5mL＝100滴、2.5mL＝50滴、つまり1mLあたり20滴として概算しています。
            実際の滴数は製剤、容器、粘度、点眼方法により変わるため、確認用として使用してください。最終判断は医師・薬剤師が行ってください。
          </div>
          <div className="sub-notice">
            ※ 使用中ボトルの残量割合から計算する場合は概算です。残量カウンターのような正確な値ではありません。
          </div>
        </>
      )}
        </>
      )}

      {mode === 'request' && (
        <NextRequestSection
          baseUnit="滴"
          pkg="本"
          compute={() => {
            const volumeMl = preset === 'other' ? toNum(volumeOther, '容量(mL)', false) : volumeMlNow;
            const packageSize = dropsPerBottle(preset, volumeMl);
            const eyes = target === 'both' ? 2 : 1;
            const dailyUse = eyes * 1 * Number(timesPerDay);
            // 訪問時の残数 = 未使用本数 × 1本換算滴数 ＋ 使用中ボトルの残滴数（割合から）
            const factor = ratioKey === '' ? 0 : RATIO_OPTIONS.find((o) => o.key === ratioKey)?.factor ?? 0;
            const currentBottleDrops = Math.floor(packageSize * factor);
            const unused = Math.max(0, Math.floor(Number(unusedBottles) || 0));
            const remainingUnits = unused * packageSize + currentBottleDrops;
            return { dailyUse, packageSize, remainingUnits };
          }}
        />
      )}
    </Panel>
  );
}
