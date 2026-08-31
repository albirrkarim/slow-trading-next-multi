import { type VolatilityPoint } from "@/lib/dynamic/utils/volatility";
import { type ClassifierReturn } from "./type";
import { type Features } from "../../v17/feature";

/**
 * Unified classifier function to decide entry based on point label and features
 * @param item
 * @param features
 */
export function classifier(
  item: VolatilityPoint,
  features: Features,
  resolvedMinActionableAbsoluteLevel: number,
): ClassifierReturn {
  // CUSTOM HARDCODED CLASSIFIER

  if (
    Math.abs(features.currentPoint.lvl) >= resolvedMinActionableAbsoluteLevel
  ) {
    return {
      entry: true,
      probability: 1,
      label: "CUSTOM: A. level abs 3 above is good",
      reasons: ["CUSTOM: A. level abs 3 above is good"],
    };
  } else {
    return {
      entry: false,
      probability: 0,
      label: "CUSTOM: A. level abs 3 above is good",
      reasons: ["CUSTOM: A. level abs 3 above is good"],
    };
  }
}
