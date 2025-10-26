import { BufferReader } from "./reader.js";

import { BufferWriter } from "./writer.js";

export type Buffers = ArrayBufferLike | ArrayBufferView | BufferWriter | BufferReader;
export type BufferView = Uint8Array | Int8Array | Uint8ClampedArray | Int16Array | Uint16Array | Float16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

const enum Endianness {
	BIG,
	LITTLE,
}

export function createBuffer(allocation?: number): Uint8Array;
export function createBuffer(allocation?: Buffers | ArrayLike<number>, clone?: boolean, offset?: number, clearMemory?: boolean): Uint8Array;
export function createBuffer(allocation?: number | Buffers | ArrayLike<number>, clone?: boolean, offset?: number, clearMemory?: boolean): Uint8Array;
export function createBuffer(allocation: number | Buffers | ArrayLike<number> = 0, clone: boolean = false, offset: number = 0, clearMemory: boolean = true): Uint8Array {
	if (typeof allocation === "number") {
		if (!clearMemory && typeof Buffer !== "undefined") {
			return Buffer.allocUnsafe(allocation); // Faster in node.js
		} else if (!clearMemory && typeof Bun !== "undefined") {
			return Bun.allocUnsafe(allocation); // Faster in Bun.js
		} else {
			return new Uint8Array(allocation);
		}
	}

	let output: Uint8Array;

	if (allocation instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && allocation instanceof SharedArrayBuffer)) {
		output = new Uint8Array(allocation, offset);
	} else if (allocation instanceof BufferReader || allocation instanceof BufferWriter) {
		output = allocation.buffer;
	} else if (ArrayBuffer.isView(allocation)) {
		output = new Uint8Array(allocation.buffer, allocation.byteOffset + offset, allocation.byteLength);
	} else if (Array.isArray(allocation)) {
		output = new Uint8Array(allocation);
	} else {
		throw new TypeError("Invalid buffer type");
	}

	return clone ? output.slice() : output;
}

export const endianness = Boolean(Endianness.LITTLE);
export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder();
