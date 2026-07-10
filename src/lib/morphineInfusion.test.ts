import { describe, it, expect } from 'vitest';
import {
  MorphineInfusionInput,
  calculateMorphineInfusion,
} from './morphineInfusion';

/** テスト用の入力ベース（個々のテストで上書き） */
function baseInput(over: Partial<MorphineInfusionInput>): MorphineInfusionInput {
  return {
    totalVolumeMl: 50,
    morphineTotalMg: 50,
    rateMlPerHour: 1,
    mode: 'new',
    startDateTime: new Date(2026, 6, 8, 9, 0), // 2026/07/08 09:00
    remainingVolumeMl: 0,
    checkDateTime: new Date(2026, 6, 8, 9, 0),
    bolusEnabled: false,
    bolusMode: 'hours',
    bolusHours: 1,
    bolusManualMl: 0,
    bolusPerDay: 0,
    ...over,
  };
}

describe('基本計算: 50mL / 50mg / 1mL/時（ボーラスなし）', () => {
  const r = calculateMorphineInfusion(baseInput({}));
  it('濃度は1mg/mL', () => expect(r.concentrationMgPerMl).toBe(1));
  it('1日投与量（持続）は24mg/日', () => expect(r.mgPerDayContinuous).toBe(24));
  it('使用可能時間は50時間', () => expect(r.usableHoursAfterBolus).toBe(50));
  it('使用可能日数は約2.08日', () => {
    expect(r.usableDaysAfterBolus).toBeCloseTo(2.0833, 3);
  });
  it('ボーラスなしなら反映前後は同じ・短縮0', () => {
    expect(r.usableHoursAfterBolus).toBe(r.usableHoursBeforeBolus);
    expect(r.shortenHours).toBe(0);
  });
});

describe('ボーラス（1日回数ベース）: 50mL / 50mg / 1mL/時, 1時間分×5回/日', () => {
  const r = calculateMorphineInfusion(
    baseInput({ bolusEnabled: true, bolusMode: 'hours', bolusHours: 1, bolusPerDay: 5 }),
  );
  it('ボーラス1回量は1mL', () => expect(r.bolusOnceMl).toBe(1));
  it('ボーラス1日使用量は5mL/日', () => expect(r.bolusMlPerDay).toBe(5));
  it('1日モルヒネ量（持続）は24mg/日のまま（ボーラス分は合算しない）', () => {
    expect(r.mgPerDayContinuous).toBe(24);
  });
  it('ボーラス1日モルヒネ量は参考値として5mg/日', () => expect(r.bolusMgPerDay).toBe(5));
  it('実効消費速度は 1 + 5/24 mL/時', () => {
    expect(r.effectiveRateMlPerHour).toBeCloseTo(1 + 5 / 24, 6);
  });
  it('使用可能日数は 50/29 ≒ 1.72日', () => {
    expect(r.usableDaysAfterBolus).toBeCloseTo(50 / 29, 6);
  });
  it('使用可能時間は 1200/29 ≒ 41.4時間', () => {
    expect(r.usableHoursAfterBolus).toBeCloseTo(1200 / 29, 6);
  });
  it('短縮時間は 50 − 1200/29 時間', () => {
    expect(r.shortenHours).toBeCloseTo(50 - 1200 / 29, 6);
  });
});

describe('高濃度・低速: 100mL / 200mg / 0.5mL/時（ボーラスなし）', () => {
  const r = calculateMorphineInfusion(
    baseInput({ totalVolumeMl: 100, morphineTotalMg: 200, rateMlPerHour: 0.5 }),
  );
  it('濃度は2mg/mL', () => expect(r.concentrationMgPerMl).toBe(2));
  it('1時間投与量は1mg/時', () => expect(r.mgPerHour).toBe(1));
  it('1日投与量は24mg/日', () => expect(r.mgPerDayContinuous).toBe(24));
  it('使用可能時間は200時間', () => expect(r.usableHoursAfterBolus).toBe(200));
  it('使用可能日数は約8.33日', () => {
    expect(r.usableDaysAfterBolus).toBeCloseTo(8.3333, 3);
  });
});

describe('残液から再計算: 総50mL/50mg（濃度1）, 1mL/時, 残20mL, ボーラスなし', () => {
  const check = new Date(2026, 6, 9, 12, 0);
  const r = calculateMorphineInfusion(
    baseInput({ mode: 'remaining', remainingVolumeMl: 20, checkDateTime: check }),
  );
  it('残り使用可能時間は20時間', () => expect(r.usableHoursAfterBolus).toBe(20));
  it('残り使用可能日数は約0.83日', () => expect(r.usableDaysAfterBolus).toBeCloseTo(0.8333, 3));
  it('空予定は確認日時＋20時間', () => {
    expect(r.emptyDateTime?.getTime()).toBe(new Date(2026, 6, 10, 8, 0).getTime());
  });
  it('濃度・mg/日はバッグ仕様から算出（残量に依らない）', () => {
    expect(r.concentrationMgPerMl).toBe(1);
    expect(r.mgPerDayContinuous).toBe(24);
  });
});

describe('残液から再計算＋ボーラス: 残20mL, 1mL/時, 1mL×5回/日', () => {
  const r = calculateMorphineInfusion(
    baseInput({
      mode: 'remaining',
      remainingVolumeMl: 20,
      bolusEnabled: true,
      bolusMode: 'hours',
      bolusHours: 1,
      bolusPerDay: 5,
    }),
  );
  it('残り使用可能時間は 20×24/29 ≒ 16.55時間', () => {
    expect(r.usableHoursAfterBolus).toBeCloseTo((20 * 24) / 29, 6);
  });
});

describe('残液0以下は交換必要（計算不能扱い）', () => {
  const r = calculateMorphineInfusion(baseInput({ mode: 'remaining', remainingVolumeMl: 0 }));
  it('exhausted フラグが立つ', () => expect(r.exhausted).toBe(true));
  it('警告が出る', () => expect(r.warnings.length).toBeGreaterThan(0));
  it('残り時間・日数は0', () => {
    expect(r.usableHoursAfterBolus).toBe(0);
    expect(r.usableDaysAfterBolus).toBe(0);
  });
});

describe('残液が薬液全量を超える場合は警告', () => {
  const r = calculateMorphineInfusion(baseInput({ mode: 'remaining', remainingVolumeMl: 60 }));
  it('警告が出る', () => {
    expect(r.warnings.some((w) => w.includes('残液量が薬液全量を超'))).toBe(true);
  });
});

describe('直接mL入力モードのボーラス（1日回数）', () => {
  const r = calculateMorphineInfusion(
    baseInput({ bolusEnabled: true, bolusMode: 'ml', bolusManualMl: 0.5, bolusPerDay: 4 }),
  );
  it('ボーラス1回量は入力mL（0.5mL）', () => expect(r.bolusOnceMl).toBe(0.5));
  it('ボーラス1日使用量は2mL/日', () => expect(r.bolusMlPerDay).toBe(2));
});

describe('日時計算', () => {
  it('空になる予定日時は開始日時＋使用可能時間', () => {
    const start = new Date(2026, 6, 8, 9, 0);
    const r = calculateMorphineInfusion(baseInput({ startDateTime: start }));
    // 50時間後 = 2026/07/10 11:00
    expect(r.emptyDateTime?.getTime()).toBe(new Date(2026, 6, 10, 11, 0).getTime());
  });
});

describe('バリデーション（致命的エラー）', () => {
  it('投与速度0は計算しない', () => {
    const r = calculateMorphineInfusion(baseInput({ rateMlPerHour: 0 }));
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.usableDaysAfterBolus).toBeNull();
  });
  it('薬液全量0は計算しない', () => {
    const r = calculateMorphineInfusion(baseInput({ totalVolumeMl: 0 }));
    expect(r.ok).toBe(false);
  });
  it('モルヒネ総量が負は計算しない', () => {
    const r = calculateMorphineInfusion(baseInput({ morphineTotalMg: -1 }));
    expect(r.ok).toBe(false);
  });
  it('NaN（空欄相当）でも落ちずにエラーを返す', () => {
    const r = calculateMorphineInfusion(baseInput({ rateMlPerHour: NaN }));
    expect(r.ok).toBe(false);
  });
});

describe('範囲外の警告（上限下限は定数で調整可能）', () => {
  it('異常に大きい1日量で警告が出る', () => {
    // 100mL / 5000mg / 10mL/時 → 濃度50mg/mL, mg/時500, mg/日12000
    const r = calculateMorphineInfusion(
      baseInput({ totalVolumeMl: 100, morphineTotalMg: 5000, rateMlPerHour: 10 }),
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('1日モルヒネ量'))).toBe(true);
  });
});
