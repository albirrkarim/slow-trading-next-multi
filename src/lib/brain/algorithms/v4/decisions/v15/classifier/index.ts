import { type VolatilityPoint } from "@/lib/dynamic/utils/volatility";
import { type Features } from "../feature";
import { classifierHard } from "./bottom/classifierHard";
import { classifierSoft } from "./bottom/classifierSoft";
import { classifierTopHard } from "./top/classifierTopHard";
import { type ClassifierReturn } from "./type";
import { classifierTopSoft } from "./top/classifierTopSoft";

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
    const resultV1 = classifierTopHard(features);
    if (resultV1.entry) {
      return resultV1;
    } else {
      return classifierTopSoft(features);
    }
  } else {
    const resultV1 = classifierHard(features);
    if (resultV1.entry) {
      return resultV1;
    } else {
      return classifierSoft(features);
    }
  }
}
