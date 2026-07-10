import { useMemo, useState } from 'react';
import {
  BolusMode,
  CalcMode,
  MorphineInfusionInput,
  calculateMorphineInfusion,
  fmtDays,
  fmtMgPerDay,
  fmtMgPerHour,
  fmtMgPerMl,
  fmtMl,
  fmtShortenHours,
} from '../../lib/morphineInfusion';
import { formatJPDateTime, nowDateTimeLocal, parseDateTimeLocal } from '../../lib/dateUtils';
import {
  DetailBox,
  ErrorBox,
  Field,
  GameButton,
  HeroResult,
  Panel,
  ResultGrid,
  ResultItem,
} from '../ui';

interface FormState {
  totalVolumeMl: string;
  morphineTotalMg: string;
  rateMlPerHour: string;
  mode: CalcMode;
  startISO: string; // 新規: 投与開始日時 "YYYY-MM-DDTHH:mm"
  remainingVolumeMl: string; // 残液再計算: 現在の残液量
  checkISO: string; // 残液再計算: 確認日時
  bolusEnabled: boolean;
  bolusMode: BolusMode;
  bolusHours: string;
  bolusManualMl: string;
  bolusPerDay: string; // ボーラス 1日の使用回数
  safetyMarginHours: string;
}

const DEFAULT_FORM: FormState = {
  totalVolumeMl: '10',
  morphineTotalMg: '100',
  rateMlPerHour: '0.1',
  mode: 'new',
  startISO: nowDateTimeLocal(),
  remainingVolumeMl: '',
  checkISO: nowDateTimeLocal(),
  bolusEnabled: false,
  bolusMode: 'hours',
  bolusHours: '1',
  bolusManualMl: '',
  bolusPerDay: '3',
  safetyMarginHours: '0',
};

/** 投与速度の刻み（mL/時） */
const RATE_STEP = 0.05;
/** 時間分モードのプリセット */
const BOLUS_HOUR_PRESETS = ['0.5', '1', '2'];

/** 浮動小数の誤差を避けるため小数2桁に丸める */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function MorphineInfusionTab() {
  const [f, setF] = useState<FormState>(DEFAULT_FORM);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  /** 投与速度を刻みぶん増減（0未満にはしない） */
  function stepRate(delta: number) {
    const cur = Number(f.rateMlPerHour);
    const base = Number.isFinite(cur) ? cur : 0;
    set('rateMlPerHour', String(Math.max(0, round2(base + delta))));
  }

  // 入力変更に応じて即時に再計算（空欄・0でも落ちない設計）
  const result = useMemo(() => {
    const input: MorphineInfusionInput = {
      totalVolumeMl: Number(f.totalVolumeMl),
      morphineTotalMg: Number(f.morphineTotalMg),
      rateMlPerHour: Number(f.rateMlPerHour),
      mode: f.mode,
      startDateTime: parseDateTimeLocal(f.startISO) ?? new Date(),
      remainingVolumeMl: Number(f.remainingVolumeMl),
      checkDateTime: parseDateTimeLocal(f.checkISO) ?? new Date(),
      bolusEnabled: f.bolusEnabled,
      bolusMode: f.bolusMode,
      bolusHours: Number(f.bolusHours),
      bolusManualMl: Number(f.bolusManualMl),
      bolusPerDay: Number(f.bolusPerDay),
      safetyMarginHours: Number(f.safetyMarginHours),
    };
    return calculateMorphineInfusion(input);
  }, [f]);

  return (
    <Panel title="モルヒネ持続投与計算" icon="◆">
      <p className="lead">
        持続投与デバイスの薬液全量・モルヒネ総量・投与速度から、
        <strong>1日モルヒネ量・使用可能日数・次回交換目安</strong>を確認します。
        ボーラス（追加投与）は1日の使用回数で反映し、途中の残液量からの再計算もできます。
      </p>

      {/* モード切替 */}
      <div className="mode-toggle">
        <button className={`mode-btn${f.mode === 'new' ? ' is-active' : ''}`} onClick={() => set('mode', 'new')}>
          新規計算
        </button>
        <button
          className={`mode-btn${f.mode === 'remaining' ? ' is-active' : ''}`}
          onClick={() => set('mode', 'remaining')}
        >
          残液から再計算
        </button>
      </div>

      {/* ① 薬液・薬剤・速度 */}
      <h3 className="section-head">① 薬液・モルヒネ量・速度</h3>
      <div className="form-row">
        <Field label="薬液全量（mL）" hint="濃度計算の基準">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={f.totalVolumeMl}
            onChange={(e) => set('totalVolumeMl', e.target.value)}
          />
        </Field>
        <Field label="モルヒネ総量（mg）">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={f.morphineTotalMg}
            onChange={(e) => set('morphineTotalMg', e.target.value)}
          />
        </Field>
        <Field label="投与速度（mL/時）" hint="0.05刻み">
          <div className="rate-stepper">
            <button type="button" className="step-btn" onClick={() => stepRate(-RATE_STEP)} aria-label="減らす">
              −
            </button>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={RATE_STEP}
              value={f.rateMlPerHour}
              onChange={(e) => set('rateMlPerHour', e.target.value)}
            />
            <button type="button" className="step-btn" onClick={() => stepRate(RATE_STEP)} aria-label="増やす">
              ＋
            </button>
          </div>
        </Field>
      </div>

      {/* ② 日時・残液 */}
      {f.mode === 'new' ? (
        <>
          <h3 className="section-head">② 開始日時</h3>
          <div className="form-row">
            <Field label="投与開始日時" hint="未入力なら現在日時">
              <input type="datetime-local" value={f.startISO} onChange={(e) => set('startISO', e.target.value)} />
            </Field>
            <Field label="　">
              <GameButton variant="sub" onClick={() => set('startISO', nowDateTimeLocal())}>
                現在日時にする
              </GameButton>
            </Field>
          </div>
        </>
      ) : (
        <>
          <h3 className="section-head">② 残液量・確認日時</h3>
          <div className="form-row">
            <Field label="現在の残液量（mL）" hint="ポンプ／目盛りで確認した残量">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={f.remainingVolumeMl}
                onChange={(e) => set('remainingVolumeMl', e.target.value)}
              />
            </Field>
            <Field label="残量を確認した日時" hint="未入力なら現在日時">
              <input type="datetime-local" value={f.checkISO} onChange={(e) => set('checkISO', e.target.value)} />
            </Field>
            <Field label="　">
              <GameButton variant="sub" onClick={() => set('checkISO', nowDateTimeLocal())}>
                現在日時にする
              </GameButton>
            </Field>
          </div>
        </>
      )}

      {/* ③ ボーラス（追加投与） */}
      <h3 className="section-head">③ ボーラス（追加投与）</h3>
      <div className="form-row">
        <Field label="ボーラス">
          <label className="check-line">
            <input
              type="checkbox"
              checked={f.bolusEnabled}
              onChange={(e) => set('bolusEnabled', e.target.checked)}
            />
            あり（使用する）
          </label>
        </Field>
      </div>

      {f.bolusEnabled && (
        <>
          <div className="mode-toggle">
            <button
              className={`mode-btn${f.bolusMode === 'hours' ? ' is-active' : ''}`}
              onClick={() => set('bolusMode', 'hours')}
            >
              時間分で指定
            </button>
            <button
              className={`mode-btn${f.bolusMode === 'ml' ? ' is-active' : ''}`}
              onClick={() => set('bolusMode', 'ml')}
            >
              mLで直接入力
            </button>
          </div>

          {f.bolusMode === 'hours' ? (
            <div className="form-row">
              <Field label="ボーラス1回＝投与速度の何時間分" hint="初期値は1時間分">
                <select value={f.bolusHours} onChange={(e) => set('bolusHours', e.target.value)}>
                  {BOLUS_HOUR_PRESETS.map((h) => (
                    <option key={h} value={h}>
                      {h}時間分
                    </option>
                  ))}
                  {!BOLUS_HOUR_PRESETS.includes(f.bolusHours) && (
                    <option value={f.bolusHours}>{f.bolusHours}時間分</option>
                  )}
                </select>
              </Field>
              <Field label="時間分（手入力）">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={f.bolusHours}
                  onChange={(e) => set('bolusHours', e.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="form-row">
              <Field label="ボーラス1回量（mL）">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={f.bolusManualMl}
                  onChange={(e) => set('bolusManualMl', e.target.value)}
                />
              </Field>
            </div>
          )}

          <div className="form-row">
            <Field label="ボーラス 1日の使用回数（0以上の整数）" hint="1日あたり何回使うか">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={f.bolusPerDay}
                onChange={(e) => set('bolusPerDay', e.target.value)}
              />
            </Field>
          </div>
        </>
      )}

      {/* ④ 安全マージン */}
      <h3 className="section-head">④ 予備・安全マージン（任意）</h3>
      <div className="form-row">
        <Field label="交換を何時間前倒しで表示するか" hint="初期値0時間。例: 6にすると空予定の6時間前を目安表示">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={f.safetyMarginHours}
            onChange={(e) => set('safetyMarginHours', e.target.value)}
          />
        </Field>
      </div>

      {/* --- 結果 --- */}
      {result.errors.map((msg, i) => (
        <ErrorBox key={i} message={msg} />
      ))}

      {result.ok && (
        <>
          {/* 赤字警告 */}
          {result.warnings.map((msg, i) => (
            <ErrorBox key={i} message={msg} />
          ))}

          {/* 重要指標（大きく表示） */}
          <HeroResult
            items={[
              {
                label: result.bolusEnabled ? '1日モルヒネ量（ボーラス込み）' : '1日モルヒネ量',
                value: `${fmtMgPerDay(result.mgPerDayTotal)} mg/日`,
              },
              {
                label: result.mode === 'remaining' ? '残りの使用可能日数' : 'ボーラス反映後の使用可能日数',
                value: result.exhausted ? '交換必要' : `${fmtDays(result.usableDaysAfterBolus)} 日`,
              },
              {
                label: '次回交換目安',
                value:
                  result.recommendedExchangeDateTime && !result.exhausted
                    ? formatJPDateTime(result.recommendedExchangeDateTime)
                    : result.exhausted
                      ? '交換必要'
                      : '—',
              },
            ]}
          />

          {/* 全結果 */}
          <ResultGrid>
            <ResultItem label="モルヒネ濃度" value={`${fmtMgPerMl(result.concentrationMgPerMl)} mg/mL`} />
            <ResultItem label="投与速度" value={`${fmtMl(result.rateMlPerHour)} mL/時`} />
            <ResultItem label="モルヒネ投与量" value={`${fmtMgPerHour(result.mgPerHour)} mg/時`} />
            <ResultItem label="モルヒネ投与量（持続）" value={`${fmtMgPerDay(result.mgPerDayContinuous)} mg/日`} />
            {result.bolusEnabled && (
              <ResultItem label="モルヒネ投与量（持続＋ボーラス）" value={`${fmtMgPerDay(result.mgPerDayTotal)} mg/日`} accent />
            )}
            <ResultItem label="ボーラス1回量" value={`${fmtMl(result.bolusOnceMl)} mL`} />
            <ResultItem label="ボーラス1回あたりモルヒネ量" value={`${fmtMgPerHour(result.bolusOnceMg)} mg`} />
            <ResultItem label="ボーラス1日回数" value={`${result.bolusPerDayCount} 回/日`} />
            <ResultItem label="ボーラス1日使用量" value={`${fmtMl(result.bolusMlPerDay)} mL/日`} />
            <ResultItem label="ボーラス1日モルヒネ量" value={`${fmtMgPerHour(result.bolusMgPerDay)} mg/日`} />
            <ResultItem label="ボーラスによる短縮時間" value={`${fmtShortenHours(result.shortenHours)} 時間`} />
            {result.mode === 'remaining' && (
              <ResultItem label="現在の残液量" value={`${fmtMl(result.remainingVolumeMl)} mL`} />
            )}
            <ResultItem
              label={result.mode === 'remaining' ? '残り使用可能日数（持続のみ）' : 'ボーラス反映前の使用可能日数'}
              value={`${fmtDays(result.usableDaysBeforeBolus)} 日`}
            />
            <ResultItem
              label={result.mode === 'remaining' ? '残り使用可能日数（ボーラス込み）' : 'ボーラス反映後の使用可能日数'}
              value={result.exhausted ? '交換必要' : `${fmtDays(result.usableDaysAfterBolus)} 日`}
              accent
            />
            <ResultItem
              label="空になる予定日時"
              value={result.emptyDateTime && !result.exhausted ? formatJPDateTime(result.emptyDateTime) : '—'}
            />
            <ResultItem
              label="推奨交換目安日時"
              value={
                result.recommendedExchangeDateTime && !result.exhausted
                  ? formatJPDateTime(result.recommendedExchangeDateTime)
                  : '—'
              }
              accent
            />
          </ResultGrid>

          {/* 計算根拠（折りたたみ） */}
          <DetailBox>
            <h4 className="section-head">入力値</h4>
            <ResultGrid>
              <ResultItem label="計算モード" value={result.mode === 'remaining' ? '残液から再計算' : '新規計算'} />
              <ResultItem label="薬液全量" value={`${result.totalVolumeMl} mL`} />
              <ResultItem label="モルヒネ総量" value={`${result.morphineTotalMg} mg`} />
              <ResultItem label="投与速度" value={`${result.rateMlPerHour} mL/時`} />
              {result.mode === 'new' ? (
                <ResultItem label="開始日時" value={formatJPDateTime(result.startDateTime)} />
              ) : (
                <>
                  <ResultItem label="残液量" value={`${result.remainingVolumeMl} mL`} />
                  <ResultItem label="確認日時" value={formatJPDateTime(result.checkDateTime)} />
                </>
              )}
              <ResultItem
                label="ボーラス設定"
                value={
                  result.bolusEnabled
                    ? result.bolusMode === 'hours'
                      ? `あり（${result.bolusHours}時間分）`
                      : 'あり（mL直接入力）'
                    : 'なし'
                }
              />
              <ResultItem label="ボーラス1日回数" value={`${result.bolusPerDayCount} 回/日`} />
              <ResultItem label="安全マージン" value={`${result.safetyMarginHours} 時間`} />
            </ResultGrid>

            <h4 className="section-head">計算式</h4>
            <ul className="detail-formula">
              <li>モルヒネ濃度 = モルヒネ総量 ÷ 薬液全量 = {result.morphineTotalMg} ÷ {result.totalVolumeMl} = {fmtMgPerMl(result.concentrationMgPerMl)} mg/mL</li>
              <li>mg/時 = 濃度 × 投与速度 = {fmtMgPerMl(result.concentrationMgPerMl)} × {result.rateMlPerHour} = {fmtMgPerHour(result.mgPerHour)} mg/時</li>
              <li>mg/日（持続）= mg/時 × 24 = {fmtMgPerDay(result.mgPerDayContinuous)} mg/日</li>
              <li>ボーラス1回量 = {result.bolusMode === 'hours' ? `投与速度 × 時間分 = ${result.rateMlPerHour} × ${result.bolusHours}` : '直接入力'} = {fmtMl(result.bolusOnceMl)} mL</li>
              <li>ボーラス1日使用量 = 1回量 × 1日回数 = {fmtMl(result.bolusOnceMl)} × {result.bolusPerDayCount} = {fmtMl(result.bolusMlPerDay)} mL/日</li>
              <li>mg/日（ボーラス込み）= 持続 ＋ ボーラス = {fmtMgPerDay(result.mgPerDayContinuous)} ＋ {fmtMgPerHour(result.bolusMgPerDay)} = {fmtMgPerDay(result.mgPerDayTotal)} mg/日</li>
              <li>実効消費速度 = 投与速度 ＋ ボーラス1日使用量 ÷ 24 = {fmtMl(result.effectiveRateMlPerHour)} mL/時</li>
              <li>
                {result.mode === 'remaining' ? '残り時間' : '使用可能時間'}（反映後）= {result.mode === 'remaining' ? '残液量' : '薬液全量'} ÷ 実効消費速度 = {result.volumeForDurationMl} ÷ {fmtMl(result.effectiveRateMlPerHour)} = {fmt1(result.usableHoursAfterBolus)} 時間
              </li>
              <li>使用可能日数 = 使用可能時間 ÷ 24 = {fmtDays(result.usableDaysAfterBolus)} 日</li>
              <li>短縮時間 = 反映前使用可能時間 − 反映後 = {fmt1(result.usableHoursBeforeBolus)} − {fmt1(result.usableHoursAfterBolus)} = {fmtShortenHours(result.shortenHours)} 時間</li>
              <li>空になる予定日時 = {result.mode === 'remaining' ? '確認日時' : '開始日時'} ＋ 使用可能時間（反映後）</li>
              <li>推奨交換目安 = 空になる予定日時 − 安全マージン（{result.safetyMarginHours}時間）</li>
            </ul>
            <p className="detail-note">
              ※ ボーラスは「1日の使用回数」で持続投与に上乗せして計算しています。表示は各項目の目安桁に丸めていますが、内部計算は丸めずに行っています。
            </p>
          </DetailBox>
        </>
      )}

      {/* 安全上の注意（常時） */}
      <div className="sub-notice">
        この計算結果は確認補助です。実際の投与設定、交換時期、追加投与量は、処方内容・デバイス設定・残液量・患者状態を確認したうえで判断してください。
      </div>
      <div className="sub-notice">
        ※ 最終確認は薬剤師・医師が行ってください。この画面の数値を絶対的な投与指示として扱わないでください。
      </div>
    </Panel>
  );
}

/** 時間の表示（小数第1位）。DetailBox 内の途中式用 */
function fmt1(v: number | null): string {
  return v == null || !Number.isFinite(v) ? '—' : v.toFixed(1);
}
