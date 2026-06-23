import { describe, it, expect } from 'vitest';
import { EyedropInput, calcEyedrop, dropsPerBottle } from './eyedrops';

function base(over: Partial<EyedropInput>): EyedropInput {
  return {
    preset: '5',
    volumeMl: 5,
    unusedBottles: 0,
    remainMode: 'drops',
    currentDrops: 100,
    ratioKey: 'full',
    target: 'both',
    dropsPerEyeDose: 1,
    timesPerDay: 2,
    startDate: new Date(2026, 5, 17),
    nextVisitDate: new Date(2026, 6, 14),
    ...over,
  };
}

describe('容量→1本あたり換算滴数', () => {
  it('5mL=100滴', () => expect(dropsPerBottle('5', 5)).toBe(100));
  it('2.5mL=50滴', () => expect(dropsPerBottle('2.5', 2.5)).toBe(50));
  it('その他3mL=60滴（mL×20の切り捨て）', () => expect(dropsPerBottle('other', 3)).toBe(60));
  it('その他2.2mL=44滴（切り捨て）', () => expect(dropsPerBottle('other', 2.2)).toBe(44));
});

describe('割合入力の換算（切り捨て）', () => {
  it('3/4満量 → 75滴', () => {
    const r = calcEyedrop(base({ remainMode: 'ratio', ratioKey: '3/4' }));
    expect(r.currentBottleDrops).toBe(75);
  });
  it('少量(0.1) → 10滴', () => {
    const r = calcEyedrop(base({ remainMode: 'ratio', ratioKey: 'low' }));
    expect(r.currentBottleDrops).toBe(10);
  });
  it('空 → 0滴', () => {
    const r = calcEyedrop(base({ remainMode: 'ratio', ratioKey: 'empty' }));
    expect(r.currentBottleDrops).toBe(0);
  });
});

describe('両眼の1回使用滴数・日数表示', () => {
  it('両眼1滴×1日2回 → 1日4滴。残10滴は2日分＋1回分', () => {
    const r = calcEyedrop(base({ remainMode: 'drops', currentDrops: 10, unusedBottles: 0 }));
    expect(r.eyes).toBe(2);
    expect(r.dosePerUse).toBe(2);
    expect(r.dailyDrops).toBe(4);
    expect(r.usableDays).toBe(2);
    expect(r.remainderUses).toBe(1);
    expect(r.partialDrops).toBe(0);
  });

  it('片眼は対象眼数1', () => {
    const r = calcEyedrop(base({ target: 'right' }));
    expect(r.eyes).toBe(1);
    expect(r.dosePerUse).toBe(1);
  });
});

describe('必要日数・不足・追加本数', () => {
  it('6/17〜7/14は両端含めて28日。両眼1滴×2回=1日4滴→必要112滴', () => {
    const r = calcEyedrop(base({ unusedBottles: 0, currentDrops: 100 }));
    expect(r.needDays).toBe(28);
    expect(r.neededDrops).toBe(112);
    expect(r.shortageDrops).toBe(12); // 112 - 100
    expect(r.addBottles).toBe(1); // ceil(12/100)
    expect(r.leftoverAfter).toBe(88); // 100+100-112
  });

  it('十分な残量なら追加0', () => {
    const r = calcEyedrop(base({ unusedBottles: 2, currentDrops: 100 }));
    expect(r.shortageDrops).toBeLessThanOrEqual(0);
    expect(r.addBottles).toBe(0);
  });
});

describe('1回量に満たない端数滴数', () => {
  it('両眼(1回2滴)で残3滴 → 1回分＋端数1滴', () => {
    const r = calcEyedrop(base({ currentDrops: 3, timesPerDay: 1 }));
    // 1日使用=2滴。残3滴 → usableDays=1, remainder=1 → uses=0, partial=1
    expect(r.dailyDrops).toBe(2);
    expect(r.usableDays).toBe(1);
    expect(r.remainderUses).toBe(0);
    expect(r.partialDrops).toBe(1);
  });
});
