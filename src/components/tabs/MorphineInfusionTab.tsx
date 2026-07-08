import { useMemo, useState } from 'react';
import {
  BolusMode,
  MorphineInfusionInput,
  calculateMorphineInfusion,
  fmtDays,
  fmtMgPerDay,
  fmtMgPerHour,
  fmtMgPerMl,
  fmtMl,
  fmtShortenHours,
} from '../../lib/morphineInfusion';
import { MORPHINE_DEVICES, deviceLabel } from '../../lib/morphineDevices';
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
  deviceKey: string;
  totalVolumeMl: string;
  morphineTotalMg: string;
  rateMlPerHour: string;
  startISO: string; // datetime-local "YYYY-MM-DDTHH:mm"
  bolusEnabled: boolean;
  bolusMode: BolusMode;
  bolusHours: string;
  bolusManualMl: string;
  bolusCount: string;
  safetyMarginHours: string;
}

const DEFAULT_FORM: FormState = {
  deviceKey: 'syringe_pump',
  totalVolumeMl: '50',
  morphineTotalMg: '50',
  rateMlPerHour: '1',
  startISO: nowDateTimeLocal(),
  bolusEnabled: false,
  bolusMode: 'hours',
  bolusHours: '1',
  bolusManualMl: '',
  bolusCount: '0',
  safetyMarginHours: '0',
};

/** 時間分モードのプリセット */
const BOLUS_HOUR_PRESETS = ['0.5', '1', '2'];

export default function MorphineInfusionTab() {
  const [f, setF] = useState<FormState>(DEFAULT_FORM);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  // 入力変更に応じて即時に再計算（空欄・0でも落ちない設計）
  const result = useMemo(() => {
    const input: MorphineInfusionInput = {
      deviceKey: f.deviceKey,
      totalVolumeMl: Number(f.totalVolumeMl),
      morphineTotalMg: Number(f.morphineTotalMg),
      rateMlPerHour: Number(f.rateMlPerHour),
      startDateTime: parseDateTimeLocal(f.startISO) ?? new Date(),
      bolusEnabled: f.bolusEnabled,
      bolusMode: f.bolusMode,
      bolusHours: Number(f.bolusHours),
      bolusManualMl: Number(f.bolusManualMl),
      bolusCount: Number(f.bolusCount),
      safetyMarginHours: Number(f.safetyMarginHours),
    };
    return calculateMorphineInfusion(input);
  }, [f]);

  return (
    <Panel title="モルヒネ持続投与計算" icon="◆">
      <p className="lead">
        シリンジポンプ・レガシー・クデクエイミーなどの持続投与デバイスについて、薬液全量・モルヒネ総量・投与速度から、
        <strong>1日モルヒネ量・使用可能日数・次回交換目安</strong>を確認します。追加投与（ボーラス）ぶんの短縮も反映します。
      </p>

      {/* ① デバイス */}
      <h3 className="section-head">① デバイス</h3>
      <div className="form-row">
        <Field label="デバイス種別">
          <select value={f.deviceKey} onChange={(e) => set('deviceKey', e.target.value)}>
            {MORPHINE_DEVICES.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* ② 薬液・薬剤 */}
      <h3 className="section-head">② 薬液・モルヒネ量・速度</h3>
      <div className="form-row">
        <Field label="薬液全量（mL）" hint="例: 50 / 100 / 250">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={f.totalVolumeMl}
            onChange={(e) => set('totalVolumeMl', e.target.value)}
          />
        </Field>
        <Field label="モルヒネ総量（mg）" hint="例: 50 / 100 / 200">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={f.morphineTotalMg}
            onChange={(e) => set('morphineTotalMg', e.target.value)}
          />
        </Field>
        <Field label="投与速度（mL/時）" hint="例: 0.5 / 1.0 / 2.0">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={f.rateMlPerHour}
            onChange={(e) => set('rateMlPerHour', e.target.value)}
          />
        </Field>
      </div>

      {/* ③ 開始日時 */}
      <h3 className="section-head">③ 開始日時</h3>
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

      {/* ④ ボーラス（追加投与） */}
      <h3 className="section-head">④ ボーラス（追加投与）</h3>
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
              <Field label="ボーラス1回＝投与速度の何時間分" hint="初期値は1時間分（速度1mL/時なら1mL）">
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
            <Field label="ボーラス使用回数（0以上の整数）">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={f.bolusCount}
                onChange={(e) => set('bolusCount', e.target.value)}
              />
            </Field>
          </div>
        </>
      )}

      {/* ⑤ 安全マージン */}
      <h3 className="section-head">⑤ 予備・安全マージン（任意）</h3>
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
              { label: '1日モルヒネ量', value: `${fmtMgPerDay(result.mgPerDay)} mg/日` },
              {
                label: 'ボーラス反映後の使用可能日数',
                value: result.bolusExceedsVolume ? '計算不能' : `${fmtDays(result.usableDaysAfterBolus)} 日`,
              },
              {
                label: '次回交換目安',
                value: result.recommendedExchangeDateTime
                  ? formatJPDateTime(result.recommendedExchangeDateTime)
                  : '—',
              },
            ]}
          />

          {/* 全結果 */}
          <ResultGrid>
            <ResultItem label="デバイス種別" value={deviceLabel(result.deviceKey)} />
            <ResultItem label="モルヒネ濃度" value={`${fmtMgPerMl(result.concentrationMgPerMl)} mg/mL`} />
            <ResultItem label="投与速度" value={`${fmtMl(result.rateMlPerHour)} mL/時`} />
            <ResultItem label="モルヒネ投与量" value={`${fmtMgPerHour(result.mgPerHour)} mg/時`} />
            <ResultItem label="モルヒネ投与量" value={`${fmtMgPerDay(result.mgPerDay)} mg/日`} accent />
            <ResultItem label="ボーラス1回量" value={`${fmtMl(result.bolusOnceMl)} mL`} />
            <ResultItem label="ボーラス1回あたりモルヒネ量" value={`${fmtMgPerHour(result.bolusOnceMg)} mg`} />
            <ResultItem label="ボーラス使用回数" value={`${result.bolusCount} 回`} />
            <ResultItem label="ボーラス総使用量" value={`${fmtMl(result.bolusTotalMl)} mL`} />
            <ResultItem label="ボーラス総モルヒネ量" value={`${fmtMgPerHour(result.bolusTotalMg)} mg`} />
            <ResultItem label="ボーラスによる短縮時間" value={`${fmtShortenHours(result.shortenHours)} 時間`} />
            <ResultItem
              label="ボーラス反映前の使用可能日数"
              value={`${fmtDays(result.usableDaysBeforeBolus)} 日`}
            />
            <ResultItem
              label="ボーラス反映後の使用可能日数"
              value={result.bolusExceedsVolume ? '計算不能' : `${fmtDays(result.usableDaysAfterBolus)} 日`}
              accent
            />
            <ResultItem
              label="空になる予定日時"
              value={result.emptyDateTime ? formatJPDateTime(result.emptyDateTime) : '—'}
            />
            <ResultItem
              label="推奨交換目安日時"
              value={
                result.recommendedExchangeDateTime
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
              <ResultItem label="デバイス種別" value={deviceLabel(result.deviceKey)} />
              <ResultItem label="薬液全量" value={`${result.totalVolumeMl} mL`} />
              <ResultItem label="モルヒネ総量" value={`${result.morphineTotalMg} mg`} />
              <ResultItem label="投与速度" value={`${result.rateMlPerHour} mL/時`} />
              <ResultItem label="開始日時" value={formatJPDateTime(result.startDateTime)} />
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
              <ResultItem label="ボーラス使用回数" value={`${result.bolusCount} 回`} />
              <ResultItem label="安全マージン" value={`${result.safetyMarginHours} 時間`} />
            </ResultGrid>

            <h4 className="section-head">計算式</h4>
            <ul className="detail-formula">
              <li>モルヒネ濃度 = モルヒネ総量 ÷ 薬液全量 = {result.morphineTotalMg} ÷ {result.totalVolumeMl} = {fmtMgPerMl(result.concentrationMgPerMl)} mg/mL</li>
              <li>mg/時 = 濃度 × 投与速度 = {fmtMgPerMl(result.concentrationMgPerMl)} × {result.rateMlPerHour} = {fmtMgPerHour(result.mgPerHour)} mg/時</li>
              <li>mg/日 = mg/時 × 24 = {fmtMgPerDay(result.mgPerDay)} mg/日</li>
              <li>ボーラス1回量 = {result.bolusMode === 'hours' ? `投与速度 × 時間分 = ${result.rateMlPerHour} × ${result.bolusHours}` : '直接入力'} = {fmtMl(result.bolusOnceMl)} mL</li>
              <li>ボーラス総使用量 = 1回量 × 回数 = {fmtMl(result.bolusOnceMl)} × {result.bolusCount} = {fmtMl(result.bolusTotalMl)} mL</li>
              <li>短縮時間 = ボーラス総使用量 ÷ 投与速度 = {fmtMl(result.bolusTotalMl)} ÷ {result.rateMlPerHour} = {fmtShortenHours(result.shortenHours)} 時間</li>
              <li>使用可能時間（反映前）= 薬液全量 ÷ 投与速度 = {result.totalVolumeMl} ÷ {result.rateMlPerHour} = {fmt1(result.usableHoursBeforeBolus)} 時間</li>
              <li>使用可能時間（反映後）= （薬液全量 − ボーラス総使用量）÷ 投与速度 = {fmt1(result.usableHoursAfterBolus)} 時間</li>
              <li>使用可能日数 = 使用可能時間 ÷ 24 = {fmtDays(result.usableDaysAfterBolus)} 日</li>
              <li>空になる予定日時 = 開始日時 ＋ 使用可能時間（反映後）</li>
              <li>推奨交換目安 = 空になる予定日時 − 安全マージン（{result.safetyMarginHours}時間）</li>
            </ul>
            <p className="detail-note">
              ※ 表示は各項目の目安桁に丸めていますが、内部計算は丸めずに行っています。
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
