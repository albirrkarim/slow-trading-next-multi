import { type VolatilityPoint } from "@/lib/dynamic/utils/volatility";
import { type Features } from "../feature";
import { classifierHard } from "./bottom/classifierHard";
import { classifierSoft } from "./bottom/classifierSoft";
import { classifierTopHard } from "./top/classifierTopHard";
import { type ClassifierReturn } from "./type";

/**
 * Unified classifier function to decide entry based on point label and features
 * @param item
 * @param features
 */
export function classifier(
  item: VolatilityPoint,
  features: Features,
): ClassifierReturn {
  // CUSTOM HARDCODED CLASSIFIER

  if (features.currentPoint.lvl <= -3) {
    return {
      entry: true,
      probability: 1,
      label: "CUSTOM: A. level -3 is good",
      reasons: ["CUSTOM: A. level -3 is good"],
    };
  }

  // MIXED BACK TESTED
  if (item.l == "T") {
    return classifierTopHard(features);
  } else {
    const resultV1 = classifierHard(features);
    if (resultV1.entry) {
      return resultV1;
    } else {
      return classifierSoft(features);
    }
  }
}
