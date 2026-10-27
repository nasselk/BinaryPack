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
export function clamp(value, min, max) {
    if (min > max) {
        throw new RangeError("Invalid range");
    }
    return Math.min(Math.max(value, min), max);
}
export const utf8Write = globalThis.Buffer?.prototype?.utf8Write;
export const utf8Slice = globalThis.Buffer?.prototype?.utf8Slice;
export const UNSIGNED_MAX = Array.from({ length: 33 }, (_, bits) => 2 ** bits - 1);
export const SIGNED_MIN = Array.from({ length: 33 }, (_, bits) => (bits ? -(2 ** (bits - 1)) : 0));
export const SIGNED_MAX = Array.from({ length: 33 }, (_, bits) => (bits ? 2 ** (bits - 1) - 1 : 0));
//# sourceMappingURL=utils.js.map