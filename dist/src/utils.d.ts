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
export declare function clamp(value: number, min: number, max: number): number;
export declare const utf8Write: ((this: Uint8Array, text: string, offset: number) => number) | undefined;
export declare const utf8Slice: ((this: Uint8Array, start: number, end: number) => string) | undefined;
export declare const UNSIGNED_MAX: number[];
export declare const SIGNED_MIN: number[];
export declare const SIGNED_MAX: number[];
//# sourceMappingURL=utils.d.ts.map