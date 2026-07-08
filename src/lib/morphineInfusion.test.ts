import { describe, it, expect } from 'vitest';
import {
  MorphineInfusionInput,
  calculateMorphineInfusion,
} from './morphineInfusion';

/** テスト用の入力ベース（個々のテストで上書き） */
function baseInput(over: Partial<MorphineInfusionInput>): MorphineInfusionInput {
  return {
    deviceKey: 'syringe_pump',
    totalVolumeMl: 50,
    morphineTotalMg: 50,
    rateMlPerHour: 1,
    startDateTime: new Date(2026, 6, 8, 9, 0), // 2026/07/08 09:00
    bolusEnabled: false,
    bolusMode: 'hours',
    bolusHours: 1,
    bolusManualMl: 0,
    bolusCount: 0,
    safetyMarginHours: 0,
    ...over,
  };
}

describe('基本計算: 50mL / 50mg / 1mL/時', () => {
  const r = calculateMorphineInfusion(baseInput({}));
  it('濃度は1mg/mL', () => expect(r.concentrationMgPerMl).toBe(1));
  it('1日投与量は24mg/日', () => expect(r.mgPerDay).toBe(24));
  it('使用可能時間は50時間', () => expect(r.usableHoursBeforeBolus).toBe(50));
  it('使用可能日数は約2.08日', () => {
    expect(r.usableDaysAfterBolus).toBeCloseTo(2.0833, 3);
  });
  it('ボーラスなしなら反映前後の使用可能時間は同じ', () => {
    expect(r.usableHoursAfterBolus).toBe(r.usableHoursBeforeBolus);
  });
});

describe('ボーラスあり: 50mL / 50mg / 1mL/時, 1時間分×5回', () => {
  const r = calculateMorphineInfusion(
    baseInput({ bolusEnabled: true, bolusMode: 'hours', bolusHours: 1, bolusCount: 5 }),
  );
  it('ボーラス1回量は1mL', () => expect(r.bolusOnceMl).toBe(1));
  it('ボーラス総使用量は5mL', () => expect(r.bolusTotalMl).toBe(5));
  it('短縮時間は5時間', () => expect(r.shortenHours).toBe(5));
  it('使用可能時間は45時間', () => expect(r.usableHoursAfterBolus).toBe(45));
  it('使用可能日数は約1.88日', () => {
    expect(r.usableDaysAfterBolus).toBeCloseTo(1.875, 3);
  });
  it('ボーラス1回あたりモルヒネ量は1mg', () => expect(r.bolusOnceMg).toBe(1));
  it('ボーラス総モルヒネ量は5mg', () => expect(r.bolusTotalMg).toBe(5));
});

describe('高濃度・低速: 100mL / 200mg / 0.5mL/時', () => {
  const r = calculateMorphineInfusion(
    baseInput({ totalVolumeMl: 100, morphineTotalMg: 200, rateMlPerHour: 0.5 }),
  );
  it('濃度は2mg/mL', () => expect(r.concentrationMgPerMl).toBe(2));
  it('1時間投与量は1mg/時', () => expect(r.mgPerHour).toBe(1));
  it('1日投与量は24mg/日', () => expect(r.mgPerDay).toBe(24));
  it('使用可能時間は200時間', () => expect(r.usableHoursBeforeBolus).toBe(200));
  it('使用可能日数は約8.33日', () => {
    expect(r.usableDaysAfterBolus).toBeCloseTo(8.3333, 3);
  });
});

describe('ボーラス総使用量が薬液全量以上（計算不能・警告）', () => {
  const r = calculateMorphineInfusion(
    baseInput({ bolusEnabled: true, bolusMode: 'hours', bolusHours: 1, bolusCount: 50 }),
  );
  it('ボーラス超過フラグが立つ', () => expect(r.bolusExceedsVolume).toBe(true));
  it('警告が出る', () => expect(r.warnings.length).toBeGreaterThan(0));
  it('空になる予定日時・推奨交換目安は算出しない（null）', () => {
    expect(r.emptyDateTime).toBeNull();
    expect(r.recommendedExchangeDateTime).toBeNull();
  });
});

describe('直接mL入力モードのボーラス', () => {
  const r = calculateMorphineInfusion(
    baseInput({ bolusEnabled: true, bolusMode: 'ml', bolusManualMl: 0.5, bolusCount: 4 }),
  );
  it('ボーラス1回量は入力mL（0.5mL）', () => expect(r.bolusOnceMl).toBe(0.5));
  it('ボーラス総使用量は2mL', () => expect(r.bolusTotalMl).toBe(2));
  it('使用可能時間は48時間', () => expect(r.usableHoursAfterBolus).toBe(48));
});

describe('日時計算', () => {
  it('空になる予定日時は開始日時＋使用可能時間', () => {
    const start = new Date(2026, 6, 8, 9, 0);
    const r = calculateMorphineInfusion(baseInput({ startDateTime: start }));
    // 50時間後 = 2026/07/10 11:00
    expect(r.emptyDateTime?.getTime()).toBe(new Date(2026, 6, 10, 11, 0).getTime());
  });
  it('推奨交換目安は空予定から安全マージンぶん前倒し', () => {
    const start = new Date(2026, 6, 8, 9, 0);
    const r = calculateMorphineInfusion(baseInput({ startDateTime: start, safetyMarginHours: 6 }));
    // 50時間後の6時間前 = 2026/07/10 05:00
    expect(r.recommendedExchangeDateTime?.getTime()).toBe(new Date(2026, 6, 10, 5, 0).getTime());
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
