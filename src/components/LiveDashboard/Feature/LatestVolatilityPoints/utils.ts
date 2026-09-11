import { amber, green, grey } from "@mui/material/colors";
import type { VolatilityPoint } from "@/lib/dynamic";

export const VPOINT_LEVEL_COLOR_MAP: Record<number, string> = {
  0: grey[500],
  1: grey[500],
  2: amber[500],
  3: green[500],
  4: green[500],
  5: green[500],
  6: green[500],
  7: green[500],
};

export function simplifyId(id: string) {
  const arr = id.split("_");
  return arr[0] + "_" + arr[1];
}

/** Checks whether a latest vPoint has been consumed by one account. */
export function isVolatilityPointUsedByAccount(
  point: VolatilityPoint,
  accountSlug: string,
): boolean {
  const normalizedSlug = String(accountSlug || "").trim();
  if (!normalizedSlug) return false;

  return (
    (point as VolatilityPoint & Record<string, unknown>)[
      `usedBy${normalizedSlug}`
    ] === true
  );
}
