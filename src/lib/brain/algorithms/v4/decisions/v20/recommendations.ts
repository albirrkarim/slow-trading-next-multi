import {
  evaluateRecommendationsV20Sync,
  getRecommendationsV20Sync,
} from "./selection";

export { evaluateRecommendationsV20Sync, getRecommendationsV20Sync };

export function evaluateRecommendationsV20(
  params: Parameters<typeof evaluateRecommendationsV20Sync>[0],
) {
  return evaluateRecommendationsV20Sync(params);
}

export function getRecommendationsV20(
  params: Parameters<typeof getRecommendationsV20Sync>[0],
) {
  return getRecommendationsV20Sync(params);
}
