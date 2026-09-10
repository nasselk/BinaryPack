import type { ArrayBufferView } from "bun";
import { BufferReader } from "./reader.js";
import { BufferWriter } from "./writer.js";
export type Buffers = ArrayBufferLike | ArrayBufferView | BufferWriter | BufferReader;
export type BufferView = ArrayBufferView;
export type BufferSlice = {
    readonly start: number;
    readonly byteLength?: number;
};
export declare function createBuffer(allocation?: number | Buffers | ArrayLike<number>, clone?: boolean, slice?: BufferSlice, clearMemory?: boolean): Uint8Array;
export declare const endianness: boolean;
//# sourceMappingURL=buffer.d.ts.map