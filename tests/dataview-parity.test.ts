import { describe, expect, test } from "bun:test";

import { BufferReader } from "../src/reader.js";

import { BufferWriter } from "../src/writer.js";

// The reader and writer convert numbers by hand instead of through a DataView.
// These tests check they produce exactly the bytes DataView would, so the wire format never changes.

type NumberType = "Uint8" | "Int8" | "Uint16" | "Int16" | "Uint32" | "Int32" | "Float32" | "Float64";

const SIZES: Record<NumberType, number> = { Uint8: 1, Int8: 1, Uint16: 2, Int16: 2, Uint32: 4, Int32: 4, Float32: 4, Float64: 8 };

const EDGE_VALUES = [
	0,
	-0,
	1,
	-1,
	127,
	128,
	-128,
	-129,
	255,
	256,
	1000,
	32767,
	32768,
	-32768,
	-32769,
	65535,
	65536,
	2147483647,
	2147483648,
	-2147483648,
	4294967295,
	4294967296,
	2 ** 40 + 5,
	-(2 ** 40) - 5,
	1.5,
	-1.5,
	1000.7,
	-1000.7,
	3.14159,
	Math.PI,
	1e-40,
	1e-310,
	3.4e38,
	1e39,
	Number.MAX_VALUE,
	Number.MIN_VALUE,
	Infinity,
	-Infinity,
	NaN,
];

// Deterministic pseudo-random values so failures can be reproduced
function randomValues(count: number): number[] {
	let seed = 12345;
	const next = () => {
		seed = (seed * 1103515245 + 12345) % 2147483648;
		return seed / 2147483648;
	};
	const values: number[] = [];

	for (let i = 0; i < count; i++) {
		const magnitude = 2 ** Math.floor(next() * 40);
		values.push((next() - 0.5) * 2 * magnitude);
		values.push(Math.floor((next() - 0.5) * 2 * magnitude));
	}

	return values;
}

const VALUES = [...EDGE_VALUES, ...randomValues(200)];

describe.each([
	["little-endian", true],
	["big-endian", false],
])("DataView parity (%s)", (_name, littleEndian) => {
	for (const type of Object.keys(SIZES) as NumberType[]) {
		const size = SIZES[type];

		test(`write${type} matches DataView.set${type}`, () => {
			for (const value of VALUES) {
				// Odd offset so unaligned access is covered
				const offset = 3;
				const expected = new Uint8Array(offset + size);
				const view = new DataView(expected.buffer);
				(view[`set${type}`] as (o: number, v: number, le: boolean) => void).call(view, offset, value, littleEndian);

				const writer = new BufferWriter(offset + size, false, littleEndian);
				writer[`write${type}`](value, offset, false);

				expect(Array.from(writer.buffer), `${type} ${value}`).toEqual(Array.from(expected));
			}
		});

		test(`read${type} matches DataView.get${type}`, () => {
			const bytes = new Uint8Array(3 + size);
			const view = new DataView(bytes.buffer);
			let seed = 99;

			for (let i = 0; i < 500; i++) {
				for (let j = 0; j < bytes.length; j++) {
					seed = (seed * 1103515245 + 12345) % 2147483648;
					bytes[j] = seed & 255;
				}

				const expected = (view[`get${type}`] as (o: number, le: boolean) => number).call(view, 3, littleEndian);
				const actual = new BufferReader(bytes, false, undefined, littleEndian)[`read${type}`](false, 3);

				expect(Object.is(actual, expected) || (Number.isNaN(actual) && Number.isNaN(expected)), `${type} [${bytes}]`).toBe(true);
			}
		});

		test(`read${type} throws when out of bounds`, () => {
			const reader = new BufferReader(new Uint8Array(size + 2), false, undefined, littleEndian);

			expect(() => reader[`read${type}`](false, 3)).toThrow(RangeError);
			expect(() => reader[`read${type}`](false, -1)).toThrow(RangeError);
			expect(() => reader[`read${type}`](false, 2)).not.toThrow();
		});
	}

	test("Float16 and 64-bit integers still work after the writer resizes", () => {
		const writer = new BufferWriter(0, true, littleEndian);

		writer.writeUint64(1n);
		writer.writeFloat16(2.5);
		writer.writeBuffer(new Uint8Array(100));
		writer.writeInt64(-5n);
		writer.writeFloat16(-0.5);

		const reader = new BufferReader(writer.bytes, false, undefined, littleEndian);

		expect(reader.readUint64()).toBe(1n);
		expect(reader.readFloat16()).toBe(2.5);
		reader.readBuffer(100);
		expect(reader.readInt64()).toBe(-5n);
		expect(reader.readFloat16()).toBe(-0.5);
	});

	test("hand-written values land at the right place inside a sliced buffer", () => {
		const backing = new Uint8Array(16);
		const writer = new BufferWriter(backing, false, littleEndian, false, { start: 4, byteLength: 8 });

		writer.writeUint32(0x01020304);
		writer.writeFloat32(1.5);

		const reader = new BufferReader(backing, false, { start: 4, byteLength: 8 }, littleEndian);

		expect(reader.readUint32()).toBe(0x01020304);
		expect(reader.readFloat32()).toBe(1.5);
		expect(Array.from(backing.subarray(0, 4))).toEqual([0, 0, 0, 0]);
	});
});
