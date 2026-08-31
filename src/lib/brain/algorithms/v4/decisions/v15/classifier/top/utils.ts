type DistStats = {
  min: number;
  avg: number;
  max: number;
};

const EPS = 1e-12;

function isDistStats(obj: any): obj is DistStats {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.min === "number" &&
    typeof obj.avg === "number" &&
    typeof obj.max === "number"
  );
}

function hasPL(obj: any): obj is { P: DistStats; L: DistStats } {
  return obj && isDistStats(obj.P) && isDistStats(obj.L);
}

function getValueFromI(I: any, path: string[]): number | null {
  let cur = I;
  for (const key of path) {
    if (cur == null || !(key in cur)) return null;
    cur = cur[key];
  }

  if (typeof cur === "number" && Number.isFinite(cur)) return cur;

  if (cur && typeof cur === "object" && typeof cur.current === "number") {
    return cur.current;
  }

  return null;
}

/**
 * Feature-voting classifier
 *
 * Each feature contributes a score in [0,1]:
 *   0   -> closer to L
 *   0.5 -> neutral
 *   1   -> closer to P
 *
 * Final result is the average vote.
 */
export function classifyObjectScore(I: any, R: any): number {
  const votes: number[] = [];

  function walk(node: any, path: string[] = []) {
    if (!node || typeof node !== "object") return;

    if (hasPL(node)) {
      const x = getValueFromI(I, path);
      if (x == null) return;

      const { P, L } = node;

      const rangeP = Math.max(P.max - P.min, EPS);
      const rangeL = Math.max(L.max - L.min, EPS);

      const distP = Math.abs(x - P.avg) / rangeP;
      const distL = Math.abs(x - L.avg) / rangeL;

      // evidence in [-1, 1]
      const evidence = Math.max(-1, Math.min(1, distL - distP));

      // vote in [0, 1]
      const vote = 0.5 + 0.5 * evidence;

      votes.push(vote);
      return;
    }

    for (const key of Object.keys(node)) {
      walk(node[key], [...path, key]);
    }
  }

  walk(R);

  if (votes.length === 0) return 0.5;

  const prob = amplify(votes.reduce((sum, v) => sum + v, 0) / votes.length)

  return Math.max(0, Math.min(1, prob));
}

function amplify(p: number, k = 6): number {
  return 1 / (1 + Math.exp(-k * (p - 0.5)));
}
