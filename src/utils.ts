/**
 * Clamps a value between a minimum and maximum value.
 *
 * @param value - The value to clamp.
 * @param min - The minimum allowed value.
 * @param max - The maximum allowed value.
 * @returns The clamped value.
 * @throws {RangeError} If min is greater than max.
 *
 * @example
 * clamp(5, 0, 10) // 5
 * clamp(-5, 0, 10) // 0
 * clamp(15, 0, 10) // 10
 */
export function clamp(value: number, min: number, max: number): number {
	if (min > max) {
		throw new RangeError("Invalid range");
	}

	return Math.min(Math.max(value, min), max);
}