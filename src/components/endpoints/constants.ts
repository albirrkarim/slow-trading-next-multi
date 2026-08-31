/**
 * Optional production host prefix.
 *
 * Empty string means "use same-origin relative URLs".
 */
export const PRODUCTION_DOMAIN = "";

/**
 * Base API prefix for the main dashboard/server endpoints.
 */
export const DASHBOARD_UI_API = `${PRODUCTION_DOMAIN}/api`;

/**
 * Base API prefix for development-only UI helper routes.
 */
export const DEV_UI_API = "/api/dev";
