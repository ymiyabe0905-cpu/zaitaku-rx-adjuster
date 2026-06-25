import { describe, it, expect } from 'vitest';
import { calcCompliance } from './compliance';

const prev = new Date(2026, 5, 1);
const curr = new Date(2026, 5, 15); // 14日間

describe('コンプライアンス判定', () => {
  it('期待どおり使用 → 良好（100%）', () => {
    // 1日10単位 ×14日=140期待。残140→0で実使用140 → 100%
    const r = calcCompliance({ prevDate: prev, currDate: curr, prevRemain: 140, added: 0, currRemain: 0, dailyUse: 10 });
    expect(r.periodDays).toBe(14);
    expect(r.usedActual).toBe(140);
    expect(r.expectedUsed).toBe(140);
    expect(r.rate).toBe(100);
    expect(r.status).toBe('ok');
  });

  it('補充を含めて実使用量を計算', () => {
    // 前回残40＋補充300−今回残200=140使用、期待140 → 100%
    const r = calcCompliance({ prevDate: prev, currDate: curr, prevRemain: 40, added: 300, currRemain: 200, dailyUse: 10 });
    expect(r.usedActual).toBe(140);
    expect(r.rate).toBe(100);
    expect(r.status).toBe('ok');
  });

  it('使用が少ない → 過少（<90%）', () => {
    // 期待140、実使用70 → 50%
    const r = calcCompliance({ prevDate: prev, currDate: curr, prevRemain: 140, added: 0, currRemain: 70, dailyUse: 10 });
    expect(r.rate).toBe(50);
    expect(r.status).toBe('low');
  });

  it('使用が多い → 過多（>110%）', () => {
    // 期待140、実使用168 → 120%
    const r = calcCompliance({ prevDate: prev, currDate: curr, prevRemain: 200, added: 0, currRemain: 32, dailyUse: 10 });
    expect(r.usedActual).toBe(168);
    expect(r.rate).toBeCloseTo(120, 5);
    expect(r.status).toBe('high');
  });

  it('実使用量がマイナス → 判定不可', () => {
    const r = calcCompliance({ prevDate: prev, currDate: curr, prevRemain: 50, added: 0, currRemain: 80, dailyUse: 10 });
    expect(r.status).toBe('invalid');
  });

  it('期間0以下はエラー', () => {
    expect(() => calcCompliance({ prevDate: curr, currDate: prev, prevRemain: 100, added: 0, currRemain: 0, dailyUse: 10 })).toThrow();
  });
});
