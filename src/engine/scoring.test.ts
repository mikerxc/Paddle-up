import { describe, expect, it } from "vitest";
import { finalScoreIssue, isFinalScore, scoreStatus } from "./scoring.ts";

const to = 11;
const by = 2;

describe("exact winning score, win by 2, no cap", () => {
  it("accepts a winner who stopped on max(11, other score + 2)", () => {
    for (const [a, b] of [
      [11, 0],
      [11, 9],
      [12, 10],
      [13, 11],
      [15, 13],
      [16, 14],
      [0, 11],
      [11, 5],
    ] as const) {
      expect(isFinalScore(a, b, to, by), `${a}-${b}`).toBe(true);
      expect(finalScoreIssue(a, b, to, by)).toBeNull();
      expect(scoreStatus(a, b, to, by)).toBe("final");
    }
  });

  it("rejects a one-point margin and games that never reached the target", () => {
    expect(finalScoreIssue(11, 10, to, by)).toMatch(/Win by 2/);
    expect(finalScoreIssue(14, 13, to, by)).toMatch(/Win by 2/);
    expect(finalScoreIssue(12, 11, to, by)).toMatch(/Win by 2/);
    expect(isFinalScore(10, 8, to, by)).toBe(false);
    expect(finalScoreIssue(10, 8, to, by)).toMatch(/First to 11/);
    expect(scoreStatus(11, 10, to, by)).toBe("need-margin");
    expect(scoreStatus(6, 4, to, by)).toBe("playing");
    expect(scoreStatus(0, 0, to, by)).toBe("empty");
  });

  it("rejects scores that ran past the ending total", () => {
    expect(isFinalScore(15, 5, to, by)).toBe(false);
    expect(finalScoreIssue(15, 5, to, by)).toMatch(/ends at 11–5/);
    expect(scoreStatus(15, 5, to, by)).toBe("overshot");
    expect(finalScoreIssue(12, 5, to, by)).toMatch(/ends at 11–5/);
    expect(finalScoreIssue(5, 15, to, by)).toMatch(/ends at 11–5/);
    expect(finalScoreIssue(14, 10, to, by)).toMatch(/ends at 12–10/);
    expect(isFinalScore(12, 10, to, by)).toBe(true);
  });

  it("rejects junk scores", () => {
    expect(finalScoreIssue(-1, 11, to, by)).toMatch(/whole numbers/);
    expect(finalScoreIssue(11.5, 9, to, by)).toMatch(/whole numbers/);
  });
});
