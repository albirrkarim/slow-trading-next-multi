import { devEndpoints } from "./dev";
import { slowEndpoints } from "./slow";

/**
 * Grouped endpoint catalog.
 */
const endpoints = {
  slow: slowEndpoints,
  dev: devEndpoints,
};

export type Endpoints = typeof endpoints;

export { endpoints };
