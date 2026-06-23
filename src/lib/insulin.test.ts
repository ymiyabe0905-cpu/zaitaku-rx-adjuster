import { describe, it, expect } from 'vitest';
import {
  InsulinInput,
  calcInsulin,
  simulate,
  buildInjections,
} from './insulin';

/** テスト用の入力ベース（個々のテストで上書き） */
function baseInput(over: Partial<InsulinInput>): InsulinInput {
  return {
    unitsPerPen: 300,
    unusedPens: 1,
    currentPenUnits: 10,
    mode: 'fixed',
    fixedDose: 12,
    injectionsPerDay: 1,
    perTimeDoses: { morning: 0, noon: 0, evening: 0, bedtime: 0 },
    includeAirshot: true,
    airshotUnits: 2,
    startDate: new Date(2026, 5, 17),
    nextVisitDate: new Date(2026, 6, 14),
    visitInclusion: 'includeVisitDay',
    needleRemaining: 0,
    includeSpareNeedle: false,
    spareNeedleUnits: 2,
    ...over,
  };
}

describe('実消費単位（空打ち込み）での1回分判定', () => {
  it('残13単位は実消費14単位に満たず0回（空打ち込みで判定）', () => {
    expect(simulate([13], [14], null).injectionsDone).toBe(0);
  });
  it('残14単位なら1回打てる', () => {
    expect(simulate([14], [14], null).injectionsDone).toBe(1);
  });
});

describe('サンプル1: 300/未使用1/使用中10, 固定12×1回, 空打ち2', () => {
  const r = calcInsulin(baseInput({}));
  it('使用中ペン10単位は実消費14単位に満たず使用不可', () => {
    expect(r.currentPenUnusable).toBe(true);
    expect(r.unusableUnits).toBe(10);
  });
  it('現在の残量で打てるのは21回', () => {
    expect(r.possibleInjections).toBe(21);
  });
  it('必要日数28日・必要注射28回', () => {
    expect(r.needDays).toBe(28);
    expect(r.neededInjections).toBe(28);
  });
  it('追加インスリンは1本', () => {
    expect(r.addPens).toBe(1);
  });
});

describe('サンプル2: 300/未使用2/使用中120, 固定12×3回, 空打ち2', () => {
  const r = calcInsulin(
    baseInput({ unusedPens: 2, currentPenUnits: 120, injectionsPerDay: 3 }),
  );
  it('現在の残量で打てるのは50回（16日分＋2回分）', () => {
    expect(r.possibleInjections).toBe(50);
    expect(r.possibleDays).toBe(16);
    expect(r.possibleRemainderInjections).toBe(2);
  });
  it('必要注射84回・追加インスリン2本', () => {
    expect(r.neededInjections).toBe(84);
    expect(r.addPens).toBe(2);
  });
});

describe('サンプル3: 400/未使用1/使用中80, 固定20×4回, 空打ち2, 針残30', () => {
  const r = calcInsulin(
    baseInput({
      unitsPerPen: 400,
      unusedPens: 1,
      currentPenUnits: 80,
      fixedDose: 20,
      injectionsPerDay: 4,
      needleRemaining: 30,
    }),
  );
  it('注入針は必要数＝必要注射回数', () => {
    expect(r.neededNeedles).toBe(r.neededInjections);
  });
  it('追加インスリン本数は需要を満たす最小本数', () => {
    expect(minimalAddPens(r.addPens, baseInput({
      unitsPerPen: 400, unusedPens: 1, currentPenUnits: 80, fixedDose: 20,
      injectionsPerDay: 4, needleRemaining: 30,
    }))).toBe(true);
  });
});

describe('サンプル4: 300/未使用1/使用中100, 各回 朝10昼8夕12寝0, 空打ち2', () => {
  const input = baseInput({
    unusedPens: 1,
    currentPenUnits: 100,
    mode: 'perTime',
    perTimeDoses: { morning: 10, noon: 8, evening: 12, bedtime: 0 },
  });
  const r = calcInsulin(input);
  it('注射予定は朝12・昼10・夕14（実消費）の3回/日', () => {
    expect(r.perDay).toBe(3);
    expect(r.injections.map((j) => j.cost)).toEqual([12, 10, 14]);
  });
  it('寝る前0単位は注射予定に含めない', () => {
    expect(r.injections.find((j) => j.label === '寝る前')).toBeUndefined();
  });
  it('現在の残量で打てるのは32回・使用不可端数6単位', () => {
    expect(r.possibleInjections).toBe(32);
    expect(r.unusableUnits).toBe(6);
  });
  it('追加インスリン本数は需要を満たす最小本数', () => {
    expect(minimalAddPens(r.addPens, input)).toBe(true);
  });
});

describe('注入針（予備あり）と不足判定', () => {
  it('予備本数を加算し、残数を差し引く', () => {
    const r = calcInsulin(
      baseInput({ includeSpareNeedle: true, spareNeedleUnits: 2, needleRemaining: 5 }),
    );
    expect(r.neededNeedles).toBe(r.neededInjections + 2);
    expect(r.shortageNeedles).toBe(r.neededNeedles - 5);
  });
});

/** addPens が「需要を満たす最小本数」になっているかを検証する補助 */
function minimalAddPens(addPens: number, input: InsulinInput): boolean {
  const cycle = buildInjections(input).map((j) => j.cost);
  const pensWith = (extra: number) => {
    const pens = [input.currentPenUnits];
    for (let i = 0; i < input.unusedPens + extra; i++) pens.push(input.unitsPerPen);
    return pens;
  };
  const needed =
    (input.visitInclusion === 'includeVisitDay'
      ? daysInclusive(input.startDate, input.nextVisitDate)
      : daysInclusive(input.startDate, addDay(input.nextVisitDate, -1))) * cycle.length;
  const enough = simulate(pensWith(addPens), cycle, null).injectionsDone >= needed;
  const lessNotEnough =
    addPens === 0 || simulate(pensWith(addPens - 1), cycle, null).injectionsDone < needed;
  return enough && lessNotEnough;
}

function daysInclusive(a: Date, b: Date): number {
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() -
    new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const d = Math.round(ms / 86400000);
  return d < 0 ? 0 : d + 1;
}
function addDay(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
