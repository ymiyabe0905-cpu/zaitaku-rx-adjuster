/**
 * コンプライアンス（アドヒアランス）判定。インスリン・吸入で共通。
 *
 * 前回残薬と今回残薬の差を「実使用量」とし、用法から求めた「期待使用量」と比べて
 * 達成率を出す（補充なし前提）。残薬ベースの参考判定。
 *
 *   実使用量   = 前回残薬 ＋ 補充（前回処方分） − 今回残薬
 *   期待使用量 = 1日使用量 × 期間日数
 *   達成率(%)  = 実使用量 ÷ 期待使用量 × 100
 *   判定: <90% 過少 / 90〜110% 良好 / >110% 過多
 */

import { diffDays } from './dateUtils';

export type ComplianceStatus = 'low' | 'ok' | 'high' | 'invalid';

export interface ComplianceInput {
  prevDate: Date;
  currDate: Date;
  prevRemain: number; // 前回残薬（基本単位）
  added: number; // 補充＝前回処方分（基本単位）
  currRemain: number; // 今回残薬（基本単位）
  dailyUse: number; // 1日使用量（用法から・基本単位/日）
}

export interface ComplianceResult {
  periodDays: number;
  prevRemain: number;
  added: number;
  currRemain: number;
  usedActual: number; // 実使用量
  dailyUse: number;
  expectedUsed: number; // 期待使用量
  rate: number; // 達成率(%)（usedActual<0 や expected<=0 のときは判定不可で0）
  status: ComplianceStatus;
}

const OK_LOW = 90;
const OK_HIGH = 110;

export function calcCompliance(input: ComplianceInput): ComplianceResult {
  const periodDays = diffDays(input.prevDate, input.currDate);
  if (periodDays <= 0) throw new Error('今回確認日は前回確認日より後にしてください');
  if (input.dailyUse <= 0) throw new Error('1日使用量が0です。用法を入力してください。');

  const usedActual = input.prevRemain + input.added - input.currRemain;
  const expectedUsed = input.dailyUse * periodDays;

  let status: ComplianceStatus;
  let rate = 0;
  if (usedActual < 0) {
    status = 'invalid'; // 今回残＞前回残（補充の可能性）
  } else {
    rate = expectedUsed > 0 ? (usedActual / expectedUsed) * 100 : 0;
    status = rate < OK_LOW ? 'low' : rate > OK_HIGH ? 'high' : 'ok';
  }

  return {
    periodDays,
    prevRemain: input.prevRemain,
    added: input.added,
    currRemain: input.currRemain,
    usedActual,
    dailyUse: input.dailyUse,
    expectedUsed,
    rate,
    status,
  };
}

/** 達成率の表示（小数1桁・判定不可は「—」） */
export function rateLabel(r: ComplianceResult): string {
  if (r.status === 'invalid') return '—';
  return `${r.rate % 1 === 0 ? r.rate : r.rate.toFixed(1)}％`;
}

export function statusLabel(s: ComplianceStatus): string {
  switch (s) {
    case 'ok':
      return '良好（概ね指示どおり）';
    case 'low':
      return '過少の可能性';
    case 'high':
      return '過多の可能性';
    default:
      return '判定不可';
  }
}

export function buildComplianceNote(r: ComplianceResult, unit: string): string {
  const addedPhrase = r.added > 0 ? `＋補充${r.added}${unit}` : '';
  if (r.status === 'invalid') {
    return (
      `前回残薬${r.prevRemain}${unit}${addedPhrase}より今回残薬（${r.currRemain}${unit}）が多く、実使用量がマイナスのため判定できません。` +
      `補充量や残薬の確認をお願いします。`
    );
  }
  const head =
    `前回確認日から今回確認日まで${r.periodDays}日間で、前回残薬${r.prevRemain}${unit}${addedPhrase}・今回残薬${r.currRemain}${unit}から、実使用量は${r.usedActual}${unit}です。` +
    `用法から見た期待使用量は${r.expectedUsed}${unit}（1日${r.dailyUse}${unit}）で、達成率は約${rateLabel(r)}です。`;
  const tail =
    r.status === 'ok'
      ? '概ね指示どおりに使用できている見込みです。'
      : r.status === 'low'
        ? '期待より少なく、打ち忘れ・吸入忘れなど過少使用の可能性があります。'
        : '期待より多く、過量・紛失・空打ち過多などの可能性があります。';
  return head + tail + '（残薬ベースの参考判定です。実際の使用状況・手技を確認してください。）';
}
