/**
 * 次回処方依頼数の計算（インスリン・吸入・点眼で共通）
 *
 * 考え方:
 *  - 訪問時の残数 R（パッケージ数）と今回処方数 P（パッケージ数）から、
 *    次回訪問時の予測残数を出し、次サイクル分（D2＝今サイクルD1と同じ）に
 *    足りるよう、次回処方で依頼すべきパッケージ数を求める。
 *  - 1日使用量 U とパッケージ量 Pk は薬剤ごとに与える（共通ロジック）。
 *
 *  合計量            = (R + P) × Pk
 *  今サイクル消費     = D × U
 *  次回訪問時予測残数 = max(0, 合計量 − 今サイクル消費)
 *  次回必要量        = D × U
 *  次回処方依頼量    = max(0, 次回必要量 − 次回訪問時予測残数)
 *  依頼パッケージ数  = ceil(次回処方依頼量 ÷ Pk)
 */

export interface NextRequestInput {
  dailyUse: number; // 1日使用量（基本単位/日）
  packageSize: number; // 1パッケージあたりの基本単位（本/キットの中身）
  remainingPackages: number; // 訪問時の残数（パッケージ数・小数可）
  prescribedPackages: number; // 今回処方数（パッケージ数）
  cycleDays: number; // 今サイクル日数 D（＝次サイクル日数）
}

export interface NextRequestResult {
  dailyUse: number;
  packageSize: number;
  cycleDays: number;
  totalUnits: number; // 合計量（残数＋今回処方）
  consumeThisCycle: number; // 今サイクル消費量
  predictedRemainUnits: number; // 次回訪問時の予測残数
  nextNeedUnits: number; // 次回必要量
  requestUnits: number; // 次回処方依頼量（基本単位）
  requestPackages: number; // 依頼パッケージ数（切り上げ）
}

export function calcNextRequest(input: NextRequestInput): NextRequestResult {
  if (input.dailyUse <= 0) throw new Error('1日使用量が0です。用法を入力してください。');
  if (input.packageSize <= 0) throw new Error('1パッケージあたりの量が0です。');
  if (input.cycleDays <= 0) throw new Error('今回訪問日〜次回訪問日の日数が0以下です。');

  const totalUnits = (input.remainingPackages + input.prescribedPackages) * input.packageSize;
  const consumeThisCycle = input.cycleDays * input.dailyUse;
  const predictedRemainUnits = Math.max(0, totalUnits - consumeThisCycle);
  const nextNeedUnits = input.cycleDays * input.dailyUse;
  const requestUnits = Math.max(0, nextNeedUnits - predictedRemainUnits);
  const requestPackages = requestUnits > 0 ? Math.ceil(requestUnits / input.packageSize) : 0;

  return {
    dailyUse: input.dailyUse,
    packageSize: input.packageSize,
    cycleDays: input.cycleDays,
    totalUnits,
    consumeThisCycle,
    predictedRemainUnits,
    nextNeedUnits,
    requestUnits,
    requestPackages,
  };
}

/** 説明文。base=基本単位名（単位/吸入/滴）、pkg=パッケージ名（本/キット） */
export function buildNextRequestNote(
  r: NextRequestResult,
  base: string,
  pkg: string,
): string {
  const head =
    `今サイクルは${r.cycleDays}日間で、1日${r.dailyUse}${base}使用します。` +
    `訪問時の残数と今回処方を合わせると合計${r.totalUnits}${base}で、` +
    `次回訪問時には約${r.predictedRemainUnits}${base}残る見込みです。`;
  if (r.requestPackages > 0) {
    return (
      head +
      `次サイクルも同じ${r.cycleDays}日分（${r.nextNeedUnits}${base}）を見込むと、` +
      `次回処方では${r.requestUnits}${base}＝${r.requestPackages}${pkg}の依頼が必要です。`
    );
  }
  return (
    head +
    `次回訪問時の予測残数で次サイクル（${r.nextNeedUnits}${base}）をまかなえる見込みのため、次回処方の追加依頼は不要です。`
  );
}
