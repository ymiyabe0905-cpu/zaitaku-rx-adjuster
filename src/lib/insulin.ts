/**
 * インスリン残数計算ロジック（UI から分離）
 *
 * 重要な考え方:
 *  - 1回分として使えるかは「投与量」ではなく「空打ち込みの実消費単位」で判定する。
 *      実消費単位 = 投与量 + （空打ちを含める場合のみ）空打ち単位
 *  - 残量は「使用中ペン → 未使用ペン」の順に消費する。
 *  - 1本（または使用中ペン）の残量が次の注射の実消費単位に満たない場合、
 *    その端数は使用不可とし、次のペンを開ける（＝使用不可端数）。
 *  - 注入針は注射1回につき1本（空打ちの有無や再使用は考慮しない）。
 *  - 各回単位入力モードは、朝→昼→夕→寝る前の順に 0 単位を除いた注射予定を並べ、
 *    残量から順番に消費して判定する（単純な1日量割りはしない）。
 */

import { addDays, formatJP, inclusiveDayCount } from './dateUtils';

export type InsulinMode = 'fixed' | 'perTime';
export type VisitInclusion = 'includeVisitDay' | 'untilDayBefore';

export interface PerTimeDoses {
  morning: number;
  noon: number;
  evening: number;
  bedtime: number;
}

export interface InsulinInput {
  unitsPerPen: number; // 1本あたり単位数
  unusedPens: number; // 未使用本数
  currentPenUnits: number; // 使用中ペンの残単位数（0可）
  mode: InsulinMode;
  // 固定単位モード
  fixedDose: number; // 1回量
  injectionsPerDay: number; // 1日の注射回数（1〜4）
  // 各回単位入力モード
  perTimeDoses: PerTimeDoses; // 朝・昼・夕・寝る前
  includeAirshot: boolean; // 空打ちを含めるか
  airshotUnits: number; // 空打ち単位
  startDate: Date;
  nextVisitDate: Date;
  visitInclusion: VisitInclusion;
  needleRemaining: number; // 注入針の残本数
  includeSpareNeedle: boolean; // 予備の注入針を含めるか
  spareNeedleUnits: number; // 予備注入針本数
}

export interface InjectionInfo {
  label: string; // 朝・昼・夕・寝る前 / 1回量
  dose: number; // 投与量
  cost: number; // 実消費単位（空打ち込み）
}

export interface InsulinResult {
  // 入力の確認用
  unitsPerPen: number;
  unusedPens: number;
  currentPenUnits: number;
  mode: InsulinMode;
  fixedDose: number;
  injectionsPerDay: number;
  perTimeDoses: PerTimeDoses;
  includeAirshot: boolean;
  airshotUnits: number;
  injections: InjectionInfo[]; // 各回の投与量と実消費単位（1日分の注射予定）
  perDay: number; // 1日の注射回数
  startDate: Date;
  nextVisitDate: Date;
  visitInclusion: VisitInclusion;
  endDate: Date; // 計算上の最終必要日
  // 計算結果
  needDays: number; // 必要日数
  neededInjections: number; // 必要注射回数
  possibleInjections: number; // 現在の残量で打てる注射回数
  possibleDays: number; // 現在の残量で使える日数
  possibleRemainderInjections: number; // 上記の余り回数
  unusableUnits: number; // 使用不可端数単位
  currentPenUnusable: boolean; // 使用中ペンが次回1回分に満たないか
  firstInjectionCost: number; // 次回（最初）の注射の実消費単位
  shortageInjections: number; // 不足注射回数
  addPens: number; // 追加で必要なインスリン本数
  leftoverInjections: number; // 追加後に余る見込み注射回数
  leftoverUnits: number; // 追加後に余る見込み単位数
  neededNeedles: number; // 必要注入針本数
  needleRemaining: number;
  shortageNeedles: number; // 追加で必要な注入針本数（0以下なら不要）
}

const SLOT_LABEL_JP = { morning: '朝', noon: '昼', evening: '夕', bedtime: '寝る前' } as const;

/** 1日分の注射予定（投与量と実消費単位）を作る */
export function buildInjections(input: InsulinInput): InjectionInfo[] {
  const air = input.includeAirshot ? input.airshotUnits : 0;
  if (input.mode === 'fixed') {
    const list: InjectionInfo[] = [];
    for (let i = 0; i < input.injectionsPerDay; i++) {
      list.push({ label: `${i + 1}回目`, dose: input.fixedDose, cost: input.fixedDose + air });
    }
    return list;
  }
  // 各回単位入力モード: 0単位は注射しない
  const order: (keyof PerTimeDoses)[] = ['morning', 'noon', 'evening', 'bedtime'];
  return order
    .filter((k) => input.perTimeDoses[k] > 0)
    .map((k) => ({
      label: SLOT_LABEL_JP[k],
      dose: input.perTimeDoses[k],
      cost: input.perTimeDoses[k] + air,
    }));
}

export interface SimResult {
  injectionsDone: number;
  consumed: number; // 消費した実単位の合計
  unusable: number; // 途中でペンを切り替えた際の使用不可端数の合計
  remaining: number; // 残っている使用可能単位（現在ペンの残り＋未使用ペン）
}

/**
 * ペン列（先頭から消費）と1日の注射予定（cost のサイクル）で注射をシミュレートする。
 * maxInjections=null なら在庫が尽きるまで。
 */
export function simulate(
  pens: number[],
  costCycle: number[],
  maxInjections: number | null,
): SimResult {
  if (costCycle.length === 0) {
    return { injectionsDone: 0, consumed: 0, unusable: 0, remaining: pens.reduce((a, b) => a + b, 0) };
  }
  let penIdx = 0;
  let rem = pens.length ? pens[0] : 0;
  let done = 0;
  let consumed = 0;
  let unusable = 0;
  let ci = 0;
  while (maxInjections === null || done < maxInjections) {
    const cost = costCycle[ci % costCycle.length];
    // 現在のペンで足りなければ、足りるペンまで切り替える（端数は使用不可）
    while (rem < cost && penIdx < pens.length - 1) {
      unusable += rem;
      penIdx++;
      rem = pens[penIdx];
    }
    if (rem >= cost) {
      rem -= cost;
      consumed += cost;
      done++;
      ci++;
    } else {
      break; // 在庫が尽きた
    }
  }
  let remaining = rem;
  for (let i = penIdx + 1; i < pens.length; i++) remaining += pens[i];
  return { injectionsDone: done, consumed, unusable, remaining };
}

function stockPens(input: InsulinInput, extraPens: number): number[] {
  const pens: number[] = [input.currentPenUnits];
  const fulls = input.unusedPens + extraPens;
  for (let i = 0; i < fulls; i++) pens.push(input.unitsPerPen);
  return pens;
}

/** インスリン残数の計算本体 */
export function calcInsulin(input: InsulinInput): InsulinResult {
  const injections = buildInjections(input);
  const perDay = injections.length;
  if (perDay === 0) {
    throw new Error('注射する回（1単位以上）が1つもありません。投与量を入力してください。');
  }
  const costCycle = injections.map((j) => j.cost);
  const firstInjectionCost = costCycle[0];

  // 必要期間
  const endDate =
    input.visitInclusion === 'includeVisitDay' ? input.nextVisitDate : addDays(input.nextVisitDate, -1);
  const needDays = inclusiveDayCount(input.startDate, endDate); // end<start なら0
  const neededInjections = needDays * perDay;

  // 現在の残量で打てる回数
  const cap = simulate(stockPens(input, 0), costCycle, null);
  const possibleInjections = cap.injectionsDone;
  const unusableUnits = cap.unusable;
  const possibleDays = Math.floor(possibleInjections / perDay);
  const possibleRemainderInjections = possibleInjections % perDay;

  // 不足分と追加インスリン本数（端数の影響を考慮して順番に満たせる本数を求める）
  const shortageInjections = Math.max(0, neededInjections - possibleInjections);
  let addPens = 0;
  if (neededInjections > possibleInjections) {
    while (addPens < 100000) {
      addPens++;
      if (simulate(stockPens(input, addPens), costCycle, null).injectionsDone >= neededInjections) break;
    }
  }

  // 追加後に余る見込み
  const totalPens = stockPens(input, addPens);
  const totalPossible = simulate(totalPens, costCycle, null).injectionsDone;
  const afterNeeded = simulate(totalPens, costCycle, neededInjections);
  const leftoverInjections = Math.max(0, totalPossible - neededInjections);
  const leftoverUnits = afterNeeded.remaining;

  // 使用中ペンが次回1回分に満たないか
  const currentPenUnusable = input.currentPenUnits > 0 && input.currentPenUnits < firstInjectionCost;

  // 注入針
  const neededNeedles = neededInjections + (input.includeSpareNeedle ? input.spareNeedleUnits : 0);
  const shortageNeedles = neededNeedles - input.needleRemaining;

  return {
    unitsPerPen: input.unitsPerPen,
    unusedPens: input.unusedPens,
    currentPenUnits: input.currentPenUnits,
    mode: input.mode,
    fixedDose: input.fixedDose,
    injectionsPerDay: input.injectionsPerDay,
    perTimeDoses: input.perTimeDoses,
    includeAirshot: input.includeAirshot,
    airshotUnits: input.includeAirshot ? input.airshotUnits : 0,
    injections,
    perDay,
    startDate: input.startDate,
    nextVisitDate: input.nextVisitDate,
    visitInclusion: input.visitInclusion,
    endDate,
    needDays,
    neededInjections,
    possibleInjections,
    possibleDays,
    possibleRemainderInjections,
    unusableUnits,
    currentPenUnusable,
    firstInjectionCost,
    shortageInjections,
    addPens,
    leftoverInjections,
    leftoverUnits,
    neededNeedles,
    needleRemaining: input.needleRemaining,
    shortageNeedles,
  };
}

/** 各回の実消費単位の表示文字列 */
export function formatInjections(r: InsulinResult): string {
  if (r.mode === 'fixed') {
    const air = r.includeAirshot ? `＋${r.airshotUnits}` : '';
    return `1回 ${r.fixedDose}${air}＝${r.injections[0].cost}単位 × 1日${r.perDay}回`;
  }
  return r.injections
    .map((j) => `${j.label} ${j.dose}${r.includeAirshot ? `＋${r.airshotUnits}` : ''}＝${j.cost}単位`)
    .join(' / ');
}

/** 実務で使える説明文を自動生成 */
export function buildInsulinNote(r: InsulinResult): string {
  const visitJP = formatJP(r.nextVisitDate);
  const needleTail =
    r.shortageNeedles > 0
      ? `インスリン注入針は合計${r.neededNeedles}本必要で、残数を差し引くと追加で${r.shortageNeedles}本必要です。`
      : `インスリン注入針は合計${r.neededNeedles}本必要で、残数（${r.needleRemaining}本）で足ります（追加不要）。`;

  let main: string;
  if (r.mode === 'fixed') {
    const air = r.includeAirshot
      ? `空打ち${r.airshotUnits}単位を含めて1回あたり${r.injections[0].cost}単位消費する場合`
      : `空打ちは含めず1回あたり${r.injections[0].cost}単位消費する場合`;
    main =
      `現在、使用中ペンの残量が${r.currentPenUnits}単位、未使用ペンが${r.unusedPens}本あります。` +
      `1回${r.fixedDose}単位を1日${r.perDay}回使用し、${air}、` +
      `現在の残量で${r.possibleDays}日分と${r.possibleRemainderInjections}回分使用可能です。` +
      `${visitJP}まで持たせるには合計${r.neededInjections}回分が必要であり、` +
      `追加でインスリン${r.addPens}本の処方が必要です。${needleTail}`;
  } else {
    const d = r.perTimeDoses;
    const air = r.includeAirshot
      ? `空打ち${r.airshotUnits}単位を含めて各回の実消費単位を計算しています。`
      : `空打ちは含めずに各回の実消費単位を計算しています。`;
    main =
      `現在、朝${d.morning}単位、昼${d.noon}単位、夕${d.evening}単位、寝る前${d.bedtime}単位で使用します。` +
      `${air}` +
      `現在の残量で${r.possibleDays}日分と${r.possibleRemainderInjections}回分使用可能です。` +
      `${visitJP}まで持たせるには合計${r.neededInjections}回分が必要であり、` +
      `追加でインスリン${r.addPens}本の処方が必要です。${needleTail}`;
  }

  if (r.currentPenUnusable) {
    main +=
      `\n使用中ペンの残量${r.currentPenUnits}単位は、次回注射に必要な実消費単位${r.firstInjectionCost}単位に満たないため、` +
      `1回分としては使用不可として計算しています。`;
  }
  return main;
}
