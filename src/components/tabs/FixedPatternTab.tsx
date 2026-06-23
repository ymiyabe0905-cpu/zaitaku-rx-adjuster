import { useState } from 'react';
import { buildScheduleNote, calcScheduleResult } from '../../lib/calc';
import { isOnOrBefore, parseDate, WEEKDAY_JP } from '../../lib/dateUtils';
import { intervalDates, monthlyByDayOfMonth, weekdayDates } from '../../lib/schedule';
import {
  DateChips,
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

type Mode = 'qod' | 'week4' | 'weekday' | 'dayOfMonth';

/**
 * 固定パターン（隔日 / 4週ごと / 曜日固定 / 毎月○日）を1タブに統合。
 * いずれも期間内の実際の服用日を列挙して回数・錠数を数える。
 */
export default function FixedPatternTab() {
  const [mode, setMode] = useState<Mode>('qod');
  const [startISO, setStartISO] = useState('2026-06-17');
  const [endISO, setEndISO] = useState('2026-07-31');
  const [weekdays, setWeekdays] = useState<number[]>([2, 4]); // 火木
  const [dayOfMonth, setDayOfMonth] = useState('17');
  const [perDose, setPerDose] = useState('1');
  const [residual, setResidual] = useState('0');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcScheduleResult> | null>(null);
  const [label, setLabel] = useState('');

  function toggleWeekday(w: number) {
    setWeekdays((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w].sort()));
  }

  function run() {
    setError('');
    try {
      if (!startISO || !endISO) throw new Error('開始日と終了日を入力してください');
      const s = parseDate(startISO);
      const e = parseDate(endISO);
      if (!isOnOrBefore(s, e)) throw new Error('終了日は開始日以降にしてください');
      const pd = Number(perDose);
      const res = Number(residual);
      if (!Number.isFinite(pd) || pd <= 0) throw new Error('1回量は0より大きい数を入力してください');
      if (!Number.isFinite(res) || res < 0) throw new Error('残薬数は0以上を入力してください');

      let dates: Date[];
      let lbl: string;
      if (mode === 'qod') {
        dates = intervalDates(s, e, 2);
        lbl = '隔日（2日ごと）';
      } else if (mode === 'week4') {
        dates = intervalDates(s, e, 28);
        lbl = '4週ごと（28日ごと）';
      } else if (mode === 'weekday') {
        if (weekdays.length === 0) throw new Error('曜日を1つ以上選んでください');
        dates = weekdayDates(s, e, weekdays);
        lbl = '毎週' + weekdays.map((w) => WEEKDAY_JP[w]).join('');
      } else {
        const d = Number(dayOfMonth);
        if (d < 1 || d > 31) throw new Error('日付は1〜31で入力してください');
        dates = monthlyByDayOfMonth(s, e, d);
        lbl = `毎月${d}日`;
      }
      setLabel(lbl);
      setResult(calcScheduleResult(dates, pd, res));
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  return (
    <Panel title="固定パターン（隔日／4週ごと／曜日固定／毎月○日）" icon="◆">
      <p className="lead">
        日数ではなく、期間内の実際の服用日を列挙して回数・必要錠数を数えます。「毎月○日」と「4週ごと（28日固定）」は別物です。
      </p>

      <div className="mode-toggle">
        <button className={`mode-btn${mode === 'qod' ? ' is-active' : ''}`} onClick={() => setMode('qod')}>
          隔日
        </button>
        <button className={`mode-btn${mode === 'week4' ? ' is-active' : ''}`} onClick={() => setMode('week4')}>
          4週ごと
        </button>
        <button className={`mode-btn${mode === 'weekday' ? ' is-active' : ''}`} onClick={() => setMode('weekday')}>
          曜日固定
        </button>
        <button
          className={`mode-btn${mode === 'dayOfMonth' ? ' is-active' : ''}`}
          onClick={() => setMode('dayOfMonth')}
        >
          毎月○日
        </button>
      </div>

      <div className="form-row">
        <Field label="開始日">
          <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
        </Field>
        <Field label="終了日（対象期間）">
          <input type="date" value={endISO} onChange={(e) => setEndISO(e.target.value)} />
        </Field>
      </div>

      {mode === 'weekday' && (
        <Field label="服用する曜日（複数選択可）">
          <div className="weekday-picker">
            {WEEKDAY_JP.map((w, i) => (
              <label key={i} className={`wd-chip${weekdays.includes(i) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={weekdays.includes(i)} onChange={() => toggleWeekday(i)} />
                {w}
              </label>
            ))}
          </div>
        </Field>
      )}
      {mode === 'dayOfMonth' && (
        <Field label="毎月何日" hint="その月に存在しない日（例: 31日）はスキップします">
          <input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </Field>
      )}

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
              { label: '必要錠数', value: `${result.requiredTablets}錠` },
              { label: '不足数', value: `${result.shortageTablets}錠` },
            ]}
          />
          <h3 className="list-title">服用予定日一覧（{result.doseCount}回）</h3>
          <DateChips dates={result.dates} />
          <NoteBox text={buildScheduleNote(result, label, parseDate(startISO), parseDate(endISO))} />
          <DetailBox>
            <ResultGrid>
              <ResultItem label="服用回数" value={`${result.doseCount}回`} />
              <ResultItem label="残薬" value={`${result.residual}錠`} />
            </ResultGrid>
          </DetailBox>
        </>
      )}
    </Panel>
  );
}
