import { describe, expect, test } from "bun:test";

import { BufferReader } from "../src/reader.js";

import { BufferWriter } from "../src/writer.js";

describe("writeUint / readUint (LEB128)", () => {
	test.each([0, 1, 127, 128, 300, 16383, 16384, 2097151, 2097152, 268435455])("roundtrips %i", (value) => {
		const writer = new BufferWriter();

		writer.writeUint(value);

		expect(new BufferReader(writer.bytes).readUint()).toBe(value);
	});

	test.each([
		[0, 1],
		[127, 1],
		[128, 2],
		[300, 2],
		[16383, 2],
		[16384, 3],
		[2097151, 3],
		[2097152, 4],
	])("encodes %i in %i byte(s)", (value, bytes) => {
		const writer = new BufferWriter();

		writer.writeUint(value);

		expect(writer.bytes.length).toBe(bytes);
	});

	test("packs a sequence back to back", () => {
		const values = [1, 300, 70000, 5, 16384];
		const writer = new BufferWriter();

		for (const value of values) {
			writer.writeUint(value);
		}

		const reader = new BufferReader(writer.bytes);

		expect(values.map(() => reader.readUint())).toEqual(values);
		expect(reader.remainingBytes).toBe(0);
	});
});

describe("writeInt / readInt (zigzag + LEB128)", () => {
	test.each([0, -1, 1, -42, 42, -300, 300, -66000, 66000, 1073741823, -1073741824])("roundtrips %i", (value) => {
		const writer = new BufferWriter();

		writer.writeInt(value);

		expect(new BufferReader(writer.bytes).readInt()).toBe(value);
	});

	test("uses fewer bytes for small magnitudes", () => {
		const small = new BufferWriter();
		const large = new BufferWriter();

		small.writeInt(-1);
		large.writeInt(-66000);

		expect(small.bytes.length).toBeLessThan(large.bytes.length);
	});

	test("roundtrips the full signed 32-bit range", () => {
		for (const value of [2147483647, -2147483648, 1073741824]) {
			const writer = new BufferWriter();

			writer.writeInt(value);

			expect(new BufferReader(writer.bytes).readInt()).toBe(value);
		}
	});
});
