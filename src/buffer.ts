import { BufferReader } from "./reader.js";

import { BufferWriter } from "./writer.js";

export type Buffers = ArrayBufferLike | ArrayBufferView | BufferWriter | BufferReader;
export type BufferView = Uint8Array | Int8Array | Uint8ClampedArray | Int16Array | Uint16Array | Float16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

const enum Endianness {
	BIG,
	LITTLE,
}

export type BufferSlice = { readonly start: number; readonly byteLength?: number };

export function createBuffer(allocation: number | Buffers | ArrayLike<number> = 0, clone: boolean = false, slice?: BufferSlice, clearMemory: boolean = true): Uint8Array {
	if (typeof allocation === "number") {
		if (!clearMemory) {
			if (typeof Bun !== "undefined") {
				return Bun.allocUnsafe(allocation); // Faster in Bun.js
			} else if (typeof Buffer !== "undefined") {
				return Buffer.allocUnsafe(allocation); // Faster in node.js
			}
		}

		return new Uint8Array(allocation);
	}

	if (Array.isArray(allocation)) {
		return new Uint8Array(allocation); // Already a copy
	}

	// Unwrap our own wrappers so the slice applies to them too
	const source = allocation instanceof BufferReader || allocation instanceof BufferWriter ? allocation.buffer : allocation;
	const offset = slice?.start ?? 0;

	let output: Uint8Array;

	if (source instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && source instanceof SharedArrayBuffer)) {
		output = new Uint8Array(source, offset, slice?.byteLength);
	} else if (ArrayBuffer.isView(source)) {
		const length = slice?.byteLength ?? source.byteLength - offset;

		// The view may sit inside a larger buffer, so the bounds are checked against the view rather than its ArrayBuffer
		if (offset < 0 || length < 0 || offset + length > source.byteLength) {
			throw new RangeError(`Slice [ ${offset}, ${offset + length} ) is out of range for ${source.byteLength} bytes`);
		}

		output = new Uint8Array(source.buffer, source.byteOffset + offset, length);
	} else {
		throw new TypeError("Invalid buffer type");
	}

	return clone ? output.slice() : output;
}

export const endianness = Boolean(Endianness.LITTLE);
