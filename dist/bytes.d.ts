/** True when the machine stores numbers in little-endian order (practically all hardware). */
export declare const NATIVE_LE: boolean;
export declare function getFloat16(buffer: Uint8Array, offset: number, littleEndian: boolean): number;
export declare function setFloat16(buffer: Uint8Array, offset: number, value: number, littleEndian: boolean): void;
export declare function getFloat32(buffer: Uint8Array, offset: number, littleEndian: boolean): number;
export declare function setFloat32(buffer: Uint8Array, offset: number, value: number, littleEndian: boolean): void;
export declare function getFloat64(buffer: Uint8Array, offset: number, littleEndian: boolean): number;
export declare function setFloat64(buffer: Uint8Array, offset: number, value: number, littleEndian: boolean): void;
//# sourceMappingURL=bytes.d.ts.map