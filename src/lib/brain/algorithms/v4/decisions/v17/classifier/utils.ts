/**
 * Client-safe utility functions for classifiers
 * Created: 07 Dec 2025
 *
 * This file contains only pure functions with no server-side dependencies
 * Safe to use in client components
 */

/**
 * Maps a value from an input scale to an output scale
 */
export function mapScaleValue(
  inputMin: number,
  inputMax: number,
  value: number,
  outputMin: number,
  outputMax: number
): number {
  // Ensure value is within input range
  const clampedValue = Math.max(inputMin, Math.min(inputMax, value));

  // Calculate the proportion of the value within the input range
  const inputRange = inputMax - inputMin;
  const proportion = (clampedValue - inputMin) / inputRange;

  // Map to output range
  const outputRange = outputMax - outputMin;
  return outputMin + proportion * outputRange;
}
