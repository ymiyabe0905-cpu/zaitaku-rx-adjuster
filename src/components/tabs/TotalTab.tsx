import { useState } from 'react';
import { buildDailyAdjustNote, calcDailyAdjust } from '../../lib/calc';
import { isOnOrBefore, parseDate, formatJP, todayISO } from '../../lib/dateUtils';
import { SLOT_LABEL, Slot, formatSlots, sortSlots } from '../../lib/timing';
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
  SlotPicker,
  SlotSelect,
} from '../ui';

/**
 * 機能4 + 5: 追加薬を定期薬の飲み終わりに合わせる（毎日服用薬・タイミング考慮）
 * 定期薬の用法＋開始タイミング＋処方日数から「実際の飲み終わり日時」を回数ベースで算出し、
 * その時点に合わせて追加薬が何日分必要かを求める。
 */
export default function TotalTab() {
  // 追加薬
  const [addStartISO, setAddStartISO] = useState(todayISO());
  const [addSlots, setAddSlots] = useState<Slot[]>(['morning', 'noon', 'evening']);
  const [addStartSlot, setAddStartSlot] = useState<Slot>('morning');
  const [perDose, setPerDose] = useState('1');
  const [residual, setResidual] = useState('0');
  // 定期薬
  const [teikiStartISO, setTeikiStartISO] = useState(todayISO());
  const [teikiSlots, setTeikiSlots] = useState<Slot[]>(['morning', 'noon', 'evening']);
  const [teikiStartSlot, setTeikiStartSlot] = useState<Slot>('morning');
  const [teikiDays, setTeikiDays] = useState('14');

  const [error, setError] = useState('');
  const [result, setResult] = useState<ReturnType<typeof calcDailyAdjust> | null>(null);

  // 用法を変えたら、開始タイミングがその用法に含まれるよう補正
  function changeAddSlots(next: Slot[]) {
    setAddSlots(next);
    if (next.length && !next.includes(addStartSlot)) setAddStartSlot(sortSlots(next)[0]);
  }
  function changeTeikiSlots(next: Slot[]) {
    setTeikiSlots(next);
    if (next.length && !next.includes(teikiStartSlot)) setTeikiStartSlot(sortSlots(next)[0]);
  }

  function run() {
    setError('');
    try {
      if (!addStartISO || !teikiStartISO)
        throw new Error('追加薬の開始日と定期薬の開始日を入力してください');
      if (addSlots.length === 0) throw new Error('追加薬の用法を選んでください');
      if (teikiSlots.length === 0) throw new Error('定期薬の用法を選んでください');
      const td = Number(teikiDays);
      if (!Number.isFinite(td) || td < 1)
        throw new Error('定期薬の処方日数は1以上の整数で入力してください');
      const pd = Number(perDose);
      const res = Number(residual);
      if (!Number.isFinite(pd) || pd <= 0) throw new Error('1回量は0より大きい数を入力してください');
      if (!Number.isFinite(res) || res < 0) throw new Error('残薬数は0以上を入力してください');

      const r = calcDailyAdjust({
        addStart: parseDate(addStartISO),
        addSlots,
        addStartSlot,
        perDose: pd,
        residual: res,
        teikiStart: parseDate(teikiStartISO),
        teikiSlots,
        teikiStartSlot,
        teikiDays: Math.floor(td),
      });
      if (!isOnOrBefore(parseDate(addStartISO), r.endDate))
        throw new Error('追加薬の開始日は定期薬の飲み終わり日以前にしてください');
      setResult(r);
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  }

  return (
    <Panel title="追加薬あわせ（定期薬の飲み終わりに合わせる）" icon="★">
      <p className="lead">
        定期薬の用法・開始タイミング・処方日数から「実際の飲み終わり日時」を回数ベースで計算し、
        その時点に合わせて追加薬が何日分必要かを求めます。必要錠数と処方日数は別の値です
        （毎食を夕から開始すると初日は1回分など、端数も正確に反映します）。
      </p>

      {/* ===== 追加薬 ===== */}
      <h3 className="section-head">① 追加薬（合わせたい薬）</h3>
      <div className="form-row">
        <Field label="追加薬の開始日">
          <input type="date" value={addStartISO} onChange={(e) => setAddStartISO(e.target.value)} />
        </Field>
        <Field label="開始タイミング（初日）">
          <SlotSelect slots={addSlots} value={addStartSlot} onChange={setAddStartSlot} />
        </Field>
      </div>
      <Field label="追加薬の用法" hint={addSlots.length ? `現在: ${formatSlots(addSlots)}（1日${addSlots.length}回）` : ''}>
        <SlotPicker slots={addSlots} onChange={changeAddSlots} />
      </Field>
      <div className="form-row">
        <Field label="1回量（錠）">
          <input type="number" min={0} step="0.5" value={perDose} onChange={(e) => setPerDose(e.target.value)} />
        </Field>
        <Field label="残薬数（錠）">
          <input type="number" min={0} value={residual} onChange={(e) => setResidual(e.target.value)} />
        </Field>
      </div>

      {/* ===== 定期薬 ===== */}
      <h3 className="section-head">② 定期薬（合わせる基準）</h3>
      <div className="form-row">
        <Field label="定期薬の開始日">
          <input type="date" value={teikiStartISO} onChange={(e) => setTeikiStartISO(e.target.value)} />
        </Field>
        <Field label="開始タイミング（初日）">
          <SlotSelect slots={teikiSlots} value={teikiStartSlot} onChange={setTeikiStartSlot} />
        </Field>
        <Field label="処方日数（日分）" hint="開始日を1日目として数えます">
          <input type="number" min={1} value={teikiDays} onChange={(e) => setTeikiDays(e.target.value)} />
        </Field>
        <Field label="クイック設定（日数）">
          <div className="quick-row">
            {[14, 21, 28, 35].map((n) => (
              <button key={n} type="button" className="quick-btn" onClick={() => setTeikiDays(String(n))}>
                {n}日
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="定期薬の用法" hint={teikiSlots.length ? `現在: ${formatSlots(teikiSlots)}（1日${teikiSlots.length}回）` : ''}>
        <SlotPicker slots={teikiSlots} onChange={changeTeikiSlots} />
      </Field>

      <GameButton onClick={run}>けいさん</GameButton>

      {error && <ErrorBox message={error} />}
      {result && (
        <>
          <HeroResult
            items={[
              { label: '今回の処方日数', value: `${result.prescriptionDays}日分` },
              { label: '不足数', value: `${result.shortageTablets}錠` },
              {
                label: '定期薬の飲み終わり',
                value: `${formatJP(result.endDate)} ${SLOT_LABEL[result.endSlot]}`,
              },
            ]}
          />
          <NoteBox text={buildDailyAdjustNote(result)} />
          <DetailBox>
            <ResultGrid>
              <ResultItem
                label="追加薬の開始"
                value={`${formatJP(result.addStart)} ${SLOT_LABEL[result.addStartSlot]}`}
              />
              <ResultItem label="次回開始日" value={formatJP(result.nextStart)} />
              <ResultItem label="期間（暦日）" value={`${result.spanDays}日`} />
              <ResultItem label="定期薬の総服用回数" value={`${result.teikiTotalDoses}回`} />
              <ResultItem label="追加薬の必要服用回数" value={`${result.requiredDoses}回`} />
              <ResultItem label="追加薬の必要錠数" value={`${result.requiredTablets}錠`} />
              <ResultItem label="残薬" value={`${result.residual}錠`} />
              <ResultItem label="1日量" value={`${result.dailyTablets}錠/日`} />
              <ResultItem label="処方で出る錠数" value={`${result.dispensedTablets}錠`} />
              <ResultItem label="余る見込み" value={`${result.leftoverForecast}錠`} />
            </ResultGrid>
          </DetailBox>
        </>
      )}
    </Panel>
  );
}
