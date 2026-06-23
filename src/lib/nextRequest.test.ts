import { describe, it, expect } from 'vitest';
import { calcNextRequest } from './nextRequest';

describe('次回処方依頼数の計算', () => {
  it('点眼 例: 1日4滴・5mL=100滴・28日・残0滴・今回1本 → 次回2本', () => {
    // 合計=100滴、消費=112滴 → 予測残0、次回必要112 → 依頼112滴=ceil(112/100)=2本
    const r = calcNextRequest({
      dailyUse: 4,
      packageSize: 100,
      remainingUnits: 0,
      prescribedPackages: 1,
      cycleDays: 28,
    });
    expect(r.totalUnits).toBe(100);
    expect(r.predictedRemainUnits).toBe(0);
    expect(r.requestUnits).toBe(112);
    expect(r.requestPackages).toBe(2);
  });

  it('残数が多く次回不要になるケース', () => {
    // 1日4滴・28日=112滴/サイクル。残200滴+今回1本(100滴)=300滴、消費112 → 予測残188 > 112 → 依頼0
    const r = calcNextRequest({
      dailyUse: 4,
      packageSize: 100,
      remainingUnits: 200,
      prescribedPackages: 1,
      cycleDays: 28,
    });
    expect(r.predictedRemainUnits).toBe(188);
    expect(r.requestUnits).toBe(0);
    expect(r.requestPackages).toBe(0);
  });

  it('インスリン 例: 1日6単位・300単位/本・28日・残0単位・今回1本', () => {
    // 合計300、消費168 → 予測残132、次回必要168 → 依頼36単位=ceil(36/300)=1本
    const r = calcNextRequest({
      dailyUse: 6,
      packageSize: 300,
      remainingUnits: 0,
      prescribedPackages: 1,
      cycleDays: 28,
    });
    expect(r.predictedRemainUnits).toBe(132);
    expect(r.requestUnits).toBe(36);
    expect(r.requestPackages).toBe(1);
  });

  it('使用中ペンの残単位も残数に含めて計算', () => {
    // 残=未使用1本(300)+使用中50=350単位、今回0本。1日10単位・28日=280消費
    // 予測残=350-280=70、次回必要280 → 依頼210単位=ceil(210/300)=1本
    const r = calcNextRequest({
      dailyUse: 10,
      packageSize: 300,
      remainingUnits: 350,
      prescribedPackages: 0,
      cycleDays: 28,
    });
    expect(r.totalUnits).toBe(350);
    expect(r.predictedRemainUnits).toBe(70);
    expect(r.requestPackages).toBe(1);
  });

  it('不正入力はエラー', () => {
    expect(() => calcNextRequest({ dailyUse: 0, packageSize: 100, remainingUnits: 0, prescribedPackages: 1, cycleDays: 28 })).toThrow();
    expect(() => calcNextRequest({ dailyUse: 4, packageSize: 100, remainingUnits: 0, prescribedPackages: 1, cycleDays: 0 })).toThrow();
  });
});
