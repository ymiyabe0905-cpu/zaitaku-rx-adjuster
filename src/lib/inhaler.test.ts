import { describe, it, expect } from 'vitest';
import { calcRegular, calcPrn, RegularInput, PrnInput } from './inhaler';

function regular(over: Partial<RegularInput>): RegularInput {
  return {
    totalPerKit: 60,
    unusedKits: 0,
    currentKitRemaining: 20,
    perDose: 1,
    timesPerDay: 2,
    startDate: new Date(2026, 5, 17),
    nextVisitDate: new Date(2026, 6, 14),
    visitInclusion: 'includeVisitDay',
    includeSpare: false,
    spareDays: 0,
    ...over,
  };
}

describe('定期吸入モード', () => {
  it('残20・1日2吸入・28日分必要 → 不足36・追加1キット・余り24', () => {
    const r = calcRegular(regular({}));
    expect(r.dailyPuffs).toBe(2);
    expect(r.totalAvailable).toBe(20);
    expect(r.needDays).toBe(28);
    expect(r.neededPuffs).toBe(56);
    expect(r.shortagePuffs).toBe(36);
    expect(r.addKits).toBe(1);
    expect(r.leftoverAfter).toBe(24);
  });

  it('120キット・未使用1・残30・1回2×2回 → 充足（追加0）', () => {
    const r = calcRegular(regular({ totalPerKit: 120, unusedKits: 1, currentKitRemaining: 30, perDose: 2 }));
    expect(r.totalAvailable).toBe(150);
    expect(r.dailyPuffs).toBe(4);
    expect(r.neededPuffs).toBe(112);
    expect(r.addKits).toBe(0);
    expect(r.shortagePuffs).toBeLessThanOrEqual(0);
  });

  it('残7・1回2×2回 → 1日分＋1回分＋端数1吸入', () => {
    const r = calcRegular(regular({ totalPerKit: 30, currentKitRemaining: 7, perDose: 2 }));
    expect(r.dailyPuffs).toBe(4);
    expect(r.usableDays).toBe(1);
    expect(r.remainderPuffs).toBe(3);
    expect(r.remainderDoses).toBe(1);
    expect(r.partialPuffs).toBe(1);
  });

  it('前日分まで必要 → 必要日数は当日分まで−1', () => {
    const incl = calcRegular(regular({ visitInclusion: 'includeVisitDay' }));
    const excl = calcRegular(regular({ visitInclusion: 'untilDayBefore' }));
    expect(excl.needDays).toBe(incl.needDays - 1);
  });

  it('予備日数を加算する', () => {
    const base = calcRegular(regular({}));
    const spare = calcRegular(regular({ includeSpare: true, spareDays: 3 }));
    expect(spare.neededPuffs).toBe(base.neededPuffs + 3 * base.dailyPuffs);
  });
});

function prn(over: Partial<PrnInput>): PrnInput {
  return {
    totalPerKit: 100,
    prevDate: new Date(2026, 5, 1),
    currDate: new Date(2026, 5, 15),
    prevRemaining: 80,
    currRemaining: 50,
    addedKits: 0,
    perDose: 2,
    currentUnusedKits: 0,
    nextVisitDate: new Date(2026, 5, 29),
    estimateMethod: 'average',
    manualDailyPuffs: 0,
    ...over,
  };
}

describe('頓用吸入モード（参考計算）', () => {
  it('使用30吸入・14日・平均≒2.14・残50で次回まで足りる', () => {
    const r = calcPrn(prn({}));
    expect(r.usedPuffs).toBe(30);
    expect(r.periodDays).toBe(14);
    expect(r.avgDaily).toBeCloseTo(30 / 14, 5);
    expect(r.totalAvailable).toBe(50);
    expect(r.daysToVisit).toBe(14);
    expect(r.shortagePuffs).toBeLessThanOrEqual(0);
    expect(r.addKits).toBe(0);
  });

  it('途中で1キット追加された場合の使用量を正しく計算（20+120−90=50）', () => {
    const r = calcPrn(prn({ totalPerKit: 120, prevRemaining: 20, currRemaining: 90, addedKits: 1 }));
    expect(r.usedPuffs).toBe(50);
  });

  it('手入力の1日見込みを使う', () => {
    const r = calcPrn(prn({ estimateMethod: 'manual', manualDailyPuffs: 6 }));
    expect(r.estDaily).toBe(6);
    expect(r.estNeeded).toBe(6 * r.daysToVisit);
  });

  it('前回確認日以前の今回確認日はエラー', () => {
    expect(() => calcPrn(prn({ currDate: new Date(2026, 5, 1) }))).toThrow();
  });
});
