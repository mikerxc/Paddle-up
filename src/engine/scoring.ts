export type ScoreStatus = "empty" | "playing" | "need-margin" | "overshot" | "final";

/** The winner's score when the game stops: target, or the other score plus the margin. */
export function winningTotal(loser: number, pointsToWin: number, winBy: number): number {
  return Math.max(pointsToWin, loser + winBy);
}

export function scoreStatus(
  scoreA: number,
  scoreB: number,
  pointsToWin: number,
  winBy: number,
): ScoreStatus {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return "playing";
  }
  if (scoreA === 0 && scoreB === 0) return "empty";
  const hi = Math.max(scoreA, scoreB);
  const lo = Math.min(scoreA, scoreB);
  const needed = winningTotal(lo, pointsToWin, winBy);
  if (hi < pointsToWin) return "playing";
  if (hi < needed) return "need-margin";
  if (hi > needed) return "overshot";
  return "final";
}

/**
 * Null when the winner has exactly max(target, loser + win-by).
 * 11–9 and 13–11 are finished games. 15–5 and 12–5 ran past the ending score.
 */
export function finalScoreIssue(
  scoreA: number,
  scoreB: number,
  pointsToWin: number,
  winBy: number,
): string | null {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    return "Scores have to be whole numbers.";
  }
  if (scoreA === 0 && scoreB === 0) return "Enter the score before finishing.";
  const hi = Math.max(scoreA, scoreB);
  const lo = Math.min(scoreA, scoreB);
  const needed = winningTotal(lo, pointsToWin, winBy);
  if (hi < pointsToWin) return `First to ${pointsToWin}. This one isn't finished.`;
  if (hi < needed) return `Win by ${winBy}. Keep playing.`;
  if (hi > needed) return `That score is too high. This game ends at ${needed}–${lo}.`;
  return null;
}

export function isFinalScore(
  scoreA: number,
  scoreB: number,
  pointsToWin: number,
  winBy: number,
): boolean {
  return finalScoreIssue(scoreA, scoreB, pointsToWin, winBy) === null;
}
