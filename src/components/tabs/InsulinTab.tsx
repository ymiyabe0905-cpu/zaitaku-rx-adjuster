import { useState } from 'react';
import {
  InsulinInput,
  InsulinMode,
  buildInsulinExpiryNote,
  buildInsulinNote,
  calcInsulin,
  formatInjections,
} from '../../lib/insulin';
import { formatJP, parseDate, todayISO } from '../../lib/dateUtils';
import {
  DetailBox,
  ErrorBox,
  Field,
  CountStepper,
  GameButton,
  HeroResult,
  NoteBox,
  Panel,
  QuickDays,
  ResultGrid,
  ResultItem,
} from '../ui';
import { NextRequestSection } from '../NextRequestSection';

interface FormState {
  penPreset: '300' | '400' | 'other';
  penOther: string;
  unusedPens: string;
  currentPenUnits: string;
  mode: InsulinMode;
  fixedDose: string;
  injectionsPerDay: string;
  morning: string;
  noon: string;
  evening: string;
  bedtime: string;
  includeAirshot: boolean;
  airshotUnits: string;
  startISO: string;
  visitISO: string;
  needleRemaining: string;
  considerExpiry: boolean;
  expiryPreset: '28' | '56' | 'other';
  expiryOther: string;
}

const DEFAULT_FORM: FormState = {
  penPreset: '300',
  penOther: '',
  unusedPens: '1',
  currentPenUnits: '10',
  mode: 'fixed',
  fixedDose: '12',
  injectionsPerDay: '1',
  morning: '10',
  noon: '8',
  evening: '12',
  bedtime: '0',
  includeAirshot: true,
  airshotUnits: '2',
  startISO: todayISO(),
  visitISO: '2026-07-14',
  needleRemaining: '0',
  considerExpiry: true,
  expiryPreset: '28',
  expiryOther: '28',
};

export default function InsulinTab() {
  const [f, setF] = useState<FormState>(DEFAULT_FORM);
  const [mode, setMode] = useState<'check' | 'request'>('check');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcInsulin> | null>(null);

  // 用法から1日使用量(U)・パッケージ量(Pk)・訪問時残数(単位)を求める（次回処方依頼モード用）
  function computeUsage(): { dailyUse: number; packageSize: number; remainingUnits: number } {
    const unitsPerPen = f.penPreset === 'other' ? Number(f.penOther) : Number(f.penPreset);
    if (!Number.isFinite(unitsPerPen) || unitsPerPen <= 0)
      throw new Error('1本あたり単位数を正しく入力してください');
    const air = f.includeAirshot ? Number(f.airshotUnits) : 0;
    let dailyUse: number;
    if (f.mode === 'fixed') {
      const dose = Number(f.fixedDose);
      if (!Number.isFinite(dose) || dose <= 0) throw new Error('1回量を正しく入力してください');
      dailyUse = Number(f.injectionsPerDay) * (dose + air);
    } else {
      const slots = [f.morning, f.noon, f.evening, f.bedtime].map(Number);
      dailyUse = slots.filter((u) => u > 0).reduce((sum, u) => sum + (u + air), 0);
      if (dailyUse <= 0) throw new Error('朝・昼・夕・寝る前のいずれかに投与量を入力してください');
    }
    // 訪問時の残数 = 未使用本数 × 1本単位数 ＋ 使用中ペンの残単位
    const unused = Math.max(0, Math.floor(Number(f.unusedPens) || 0));
    const curr = Math.max(0, Math.floor(Number(f.currentPenUnits) || 0));
    const remainingUnits = unused * unitsPerPen + curr;
    return { dailyUse, packageSize: unitsPerPen, remainingUnits };
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function buildInput(): InsulinInput {
    const unitsPerPen = f.penPreset === 'other' ? Number(f.penOther) : Number(f.penPreset);
    if (!Number.isFinite(unitsPerPen) || unitsPerPen <= 0)
      throw new Error('1本あたり単位数を正しく入力してください');
    const num = (s: string, name: string, allowZero = true) => {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0 || (!allowZero && n <= 0))
        throw new Error(`${name}を正しく入力してください`);
      return n;
    };
    if (!f.startISO || !f.visitISO) throw new Error('開始日・持たせたい日を入力してください');
    return {
      unitsPerPen,
      unusedPens: Math.floor(num(f.unusedPens, '未使用本数')),
      currentPenUnits: Math.floor(num(f.currentPenUnits, '使用中ペンの残単位数')),
      mode: f.mode,
      fixedDose: num(f.fixedDose, '1回量', false),
      injectionsPerDay: Number(f.injectionsPerDay),
      perTimeDoses: {
        morning: num(f.morning, '朝'),
        noon: num(f.noon, '昼'),
        evening: num(f.evening, '夕'),
        bedtime: num(f.bedtime, '寝る前'),
      },
      includeAirshot: f.includeAirshot,
      airshotUnits: num(f.airshotUnits, '空打ち単位'),
      startDate: parseDate(f.startISO),
      nextVisitDate: parseDate(f.visitISO),
      visitInclusion: 'includeVisitDay',
      needleRemaining: Math.floor(num(f.needleRemaining, '注入針の残本数')),
      includeSpareNeedle: false,
      spareNeedleUnits: 0,
      considerExpiry: f.considerExpiry,
      expiryDays:
        f.expiryPreset === 'other'
          ? Math.floor(num(f.expiryOther, '使用開始後使用可能日数', false))
          : Number(f.expiryPreset),
    };
  }

  function run() {
    setError('');
    try {
      const input = buildInput();
      if (input.startDate > input.nextVisitDate) {
        throw new Error('持たせたい日は開始日以降にしてください');
      }
      setResult(calcInsulin(input));
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  const modeLabel = f.mode === 'fixed' ? '固定単位モード' : '各回単位入力モード';
  const visitLabel = '持たせたい日の当日分まで必要';

  return (
    <Panel title="インスリン残数" icon="◆">
      <p className="lead">
        在宅患者のインスリン残量から、あと何日分使えるか、持たせたい日まで必要な追加本数、注入針の必要本数を計算します。
        1回分として使えるかは、投与量ではなく<strong>空打ち込みの実消費単位</strong>で判定します。
      </p>

      <div className="mode-toggle">
        <button className={`mode-btn${mode === 'check' ? ' is-active' : ''}`} onClick={() => setMode('check')}>
          残数チェック
        </button>
        <button className={`mode-btn${mode === 'request' ? ' is-active' : ''}`} onClick={() => setMode('request')}>
          次回処方依頼
        </button>
      </div>

      {/* インスリン本体 */}
      <h3 className="section-head">① インスリン</h3>
      <div className="form-row">
        <Field label="1本あたり単位数">
          <select value={f.penPreset} onChange={(e) => set('penPreset', e.target.value as FormState['penPreset'])}>
            <option value="300">300単位</option>
            <option value="400">400単位</option>
            <option value="other">その他</option>
          </select>
        </Field>
        {f.penPreset === 'other' && (
          <Field label="1本あたり単位数（手入力）">
            <input type="number" min={1} value={f.penOther} onChange={(e) => set('penOther', e.target.value)} />
          </Field>
        )}
        <Field label="現在の未使用本数">
          <CountStepper value={f.unusedPens} onChange={(v) => set('unusedPens', v)} unit="本" />
        </Field>
        <Field label="使用中ペンの残単位数（0可）">
          <input type="number" min={0} value={f.currentPenUnits} onChange={(e) => set('currentPenUnits', e.target.value)} />
        </Field>
      </div>

      {/* 投与量 */}
      <h3 className="section-head">② 投与量</h3>
      <div className="mode-toggle">
        <button className={`mode-btn${f.mode === 'fixed' ? ' is-active' : ''}`} onClick={() => set('mode', 'fixed')}>
          固定単位モード
        </button>
        <button className={`mode-btn${f.mode === 'perTime' ? ' is-active' : ''}`} onClick={() => set('mode', 'perTime')}>
          各回単位入力モード
        </button>
      </div>

      {f.mode === 'fixed' ? (
        <div className="form-row">
          <Field label="1回量（単位）">
            <input type="number" min={1} value={f.fixedDose} onChange={(e) => set('fixedDose', e.target.value)} />
          </Field>
          <Field label="1日の注射回数">
            <select value={f.injectionsPerDay} onChange={(e) => set('injectionsPerDay', e.target.value)}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}回</option>
              ))}
            </select>
          </Field>
        </div>
      ) : (
        <div className="form-row">
          <Field label="朝（単位・0で打たない）">
            <input type="number" min={0} value={f.morning} onChange={(e) => set('morning', e.target.value)} />
          </Field>
          <Field label="昼（単位）">
            <input type="number" min={0} value={f.noon} onChange={(e) => set('noon', e.target.value)} />
          </Field>
          <Field label="夕（単位）">
            <input type="number" min={0} value={f.evening} onChange={(e) => set('evening', e.target.value)} />
          </Field>
          <Field label="寝る前（単位）">
            <input type="number" min={0} value={f.bedtime} onChange={(e) => set('bedtime', e.target.value)} />
          </Field>
        </div>
      )}

      <div className="form-row">
        <Field label="空打ちを計算に含める">
          <label className="check-line">
            <input type="checkbox" checked={f.includeAirshot} onChange={(e) => set('includeAirshot', e.target.checked)} />
            含める
          </label>
        </Field>
        {f.includeAirshot && (
          <Field label="空打ち単位">
            <input type="number" min={0} value={f.airshotUnits} onChange={(e) => set('airshotUnits', e.target.value)} />
          </Field>
        )}
      </div>

      {mode === 'check' && (
        <>
      {/* 期間 */}
      <h3 className="section-head">③ 期間</h3>
      <div className="form-row">
        <Field label="開始日">
          <input type="date" value={f.startISO} onChange={(e) => set('startISO', e.target.value)} />
        </Field>
        <Field label="持たせたい日" hint="この日まで残数を持たせたい">
          <input type="date" value={f.visitISO} onChange={(e) => set('visitISO', e.target.value)} />
        </Field>
        <Field label="クイック設定（開始日＋）">
          <QuickDays baseISO={f.startISO} onPick={(v) => set('visitISO', v)} />
        </Field>
      </div>

      {/* 注入針 */}
      <h3 className="section-head">④ 注入針</h3>
      <div className="form-row">
        <Field label="注入針の残本数">
          <input type="number" min={0} value={f.needleRemaining} onChange={(e) => set('needleRemaining', e.target.value)} />
        </Field>
      </div>

      {/* 使用開始後期限 */}
      <h3 className="section-head">⑤ 使用開始後期限（廃棄判定）</h3>
      <div className="form-row">
        <Field label="使用開始後期限を考慮する">
          <label className="check-line">
            <input
              type="checkbox"
              checked={f.considerExpiry}
              onChange={(e) => set('considerExpiry', e.target.checked)}
            />
            考慮する
          </label>
        </Field>
        {f.considerExpiry && (
          <Field label="使用開始後使用可能日数">
            <select value={f.expiryPreset} onChange={(e) => set('expiryPreset', e.target.value as FormState['expiryPreset'])}>
              <option value="28">28日（4週間）</option>
              <option value="56">56日（8週間）</option>
              <option value="other">その他</option>
            </select>
          </Field>
        )}
        {f.considerExpiry && f.expiryPreset === 'other' && (
          <Field label="日数（手入力）">
            <input type="number" min={1} value={f.expiryOther} onChange={(e) => set('expiryOther', e.target.value)} />
          </Field>
        )}
      </div>

      <GameButton onClick={run}>けいさん</GameButton>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <HeroResult
            items={[
              { label: '追加インスリン', value: `${result.addPens}本` },
              {
                label: '追加注入針',
                value: result.shortageNeedles > 0 ? `${result.shortageNeedles}本` : '不要',
              },
              {
                label: '現在の残量で',
                value: `${result.possibleDays}日分＋${result.possibleRemainderInjections}回分`,
              },
            ]}
          />
          <NoteBox text={buildInsulinNote(result)} />
          {result.considerExpiry && <NoteBox text={buildInsulinExpiryNote(result)} />}

          <DetailBox>
            <ResultGrid>
              <ResultItem label="1本あたり単位数" value={`${result.unitsPerPen}単位`} />
              <ResultItem label="未使用本数" value={`${result.unusedPens}本`} />
              <ResultItem label="使用中ペンの残単位" value={`${result.currentPenUnits}単位`} />
              <ResultItem label="投与量モード" value={modeLabel} />
              {result.mode === 'fixed' ? (
                <ResultItem label="1回量・回数" value={`${result.fixedDose}単位 × 1日${result.perDay}回`} />
              ) : (
                <ResultItem
                  label="朝・昼・夕・寝る前"
                  value={`${result.perTimeDoses.morning}/${result.perTimeDoses.noon}/${result.perTimeDoses.evening}/${result.perTimeDoses.bedtime}単位`}
                />
              )}
              <ResultItem label="空打ち" value={result.includeAirshot ? `含める（${result.airshotUnits}単位）` : '含めない'} />
              <ResultItem label="各回の実消費単位" value={formatInjections(result)} />
              <ResultItem label="開始日" value={formatJP(result.startDate)} />
              <ResultItem label="持たせたい日" value={formatJP(result.nextVisitDate)} />
              <ResultItem label="対象範囲" value={visitLabel} />
              <ResultItem label="必要日数" value={`${result.needDays}日分`} />
              <ResultItem label="必要注射回数" value={`${result.neededInjections}回`} />
              <ResultItem label="残量で打てる回数" value={`${result.possibleInjections}回`} />
              <ResultItem
                label="残量で使える日数＋余り"
                value={`${result.possibleDays}日分＋${result.possibleRemainderInjections}回分`}
              />
              <ResultItem label="使用不可端数" value={`${result.unusableUnits}単位`} />
              <ResultItem label="不足注射回数" value={`${result.shortageInjections}回`} accent />
              <ResultItem label="追加インスリン本数" value={`${result.addPens}本`} accent />
              <ResultItem label="余る見込み注射回数" value={`${result.leftoverInjections}回`} />
              <ResultItem label="余る見込み単位数" value={`${result.leftoverUnits}単位`} />
              <ResultItem label="必要注入針本数" value={`${result.neededNeedles}本`} />
              <ResultItem label="注入針の残本数" value={`${result.needleRemaining}本`} />
              <ResultItem
                label="追加で必要な注入針"
                value={result.shortageNeedles > 0 ? `${result.shortageNeedles}本` : '不要'}
                accent
              />
              {/* 使用開始後期限（廃棄判定） */}
              <ResultItem label="使用開始後期限を考慮" value={result.considerExpiry ? 'する' : 'しない'} />
              {result.considerExpiry && (
                <>
                  <ResultItem label="使用開始後使用可能日数" value={`${result.expiryDays}日`} />
                  <ResultItem label="1日消費単位" value={`${result.dailyConsumption}単位`} />
                  <ResultItem label="期限内に1本から使える単位数" value={`${result.perBottleUsableUnits}単位`} />
                  <ResultItem label="1本あたり廃棄見込み単位数" value={`${result.perBottleDiscardUnits}単位`} />
                  <ResultItem label="1本あたり廃棄見込み回数" value={`${result.perBottleDiscardDoses}回`} />
                  <ResultItem label="期限考慮後の追加必要本数" value={`${result.addPens}本`} accent />
                </>
              )}
            </ResultGrid>
          </DetailBox>

          <div className="sub-notice">
            ※ この計算結果は確認用です。実際の投与量、空打ち、単位設定、デバイスの残量表示、施設での管理方法を確認し、最終判断は医師・薬剤師が行ってください。
          </div>
          <div className="sub-notice">
            ※ スライディングスケールや血糖値に応じた可変単位の指示には、今回の自動計算は対応していません。
          </div>
          <div className="sub-notice">
            ※ この計算は、1本ごとの使用開始日を管理するものではありません。1本を使い切るまでに使用開始後期限を超える場合、超過分を廃棄見込みとして扱う簡易計算です。
          </div>
          <div className="sub-notice">
            ※ 使用開始後の使用可能期間は製剤ごとに異なります。対象製剤の添付文書・薬剤情報・施設での管理方法を必ず確認してください。
          </div>
        </>
      )}
        </>
      )}

      {mode === 'request' && (
        <NextRequestSection baseUnit="単位" pkg="本" compute={computeUsage} />
      )}
    </Panel>
  );
}
