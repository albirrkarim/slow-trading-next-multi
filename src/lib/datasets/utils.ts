import moment from "moment-timezone";

/**
 * Converts a millisecond timestamp to a readable string in UTC
 *
 * @param {number} timeMs - Timestamp in milliseconds.
 * @returns {string} Readable time string formatted as 'DD_MMM_YYYY_HH_mm'.
 */
export function timeMsToReadable(
  timeMs?: number,
  format: string = "DD_MMM_YYYY_HH_mm"
): string {
  return moment(timeMs).format(format);
}
