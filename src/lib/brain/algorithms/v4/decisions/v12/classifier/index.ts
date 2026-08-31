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
  features: Features
): ClassifierReturn {
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
