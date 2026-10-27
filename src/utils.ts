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

export const utf8Write = (globalThis as any).Buffer?.prototype?.utf8Write as ((this: Uint8Array, text: string, offset: number) => number) | undefined;

export const utf8Slice = (globalThis as any).Buffer?.prototype?.utf8Slice as ((this: Uint8Array, start: number, end: number) => string) | undefined;

export const UNSIGNED_MAX = Array.from({ length: 33 }, (_, bits) => 2 ** bits - 1);
export const SIGNED_MIN = Array.from({ length: 33 }, (_, bits) => (bits ? -(2 ** (bits - 1)) : 0));
export const SIGNED_MAX = Array.from({ length: 33 }, (_, bits) => (bits ? 2 ** (bits - 1) - 1 : 0));
