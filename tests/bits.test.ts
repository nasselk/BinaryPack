import { describe, expect, test } from "bun:test";

import { BufferReader } from "../src/reader.js";

import { BufferWriter } from "../src/writer.js";

describe("bit fields", () => {
	test("packs three non-aligned fields into two bytes", () => {
		const writer = new BufferWriter(2, false);

		writer.writeBits(0b10101, 5);
		writer.writeBits(0b110110, 6);
		writer.writeBits(0b01010, 5);

		const reader = new BufferReader(writer.buffer);

		expect(reader.readBits(5)).toBe(0b10101);
		expect(reader.readBits(6)).toBe(0b110110);
		expect(reader.readBits(5)).toBe(0b01010);
	});

	test("roundtrips 16 single bits across a byte boundary", () => {
		const writer = new BufferWriter(2, false);
		const pattern = [1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1];

		for (const bit of pattern) {
			writer.writeBits(bit, 1);
		}

		const reader = new BufferReader(writer.buffer);

		expect(pattern.map(() => reader.readBits(1))).toEqual(pattern);
	});

	test("roundtrips signed bit fields", () => {
		for (const value of [-5, 0, 5, -32, 31]) {
			const writer = new BufferWriter(2, false);

			writer.writeBits(value, 6, true);

			expect(new BufferReader(writer.buffer).readBits(6, true)).toBe(value);
		}
	});

	test("throws when a value does not fit in the given bit width", () => {
		expect(() => new BufferWriter(4, false).writeBits(300, 4)).toThrow(RangeError);
		expect(() => new BufferWriter(4, false).writeBits(-1, 4)).toThrow(RangeError);
	});

	test("resetBits realigns to the next byte boundary", () => {
		const writer = new BufferWriter(4, false);

		writer.writeBits(0b101, 3);
		writer.resetBits();
		writer.writeUint8(0xff);

		const reader = new BufferReader(writer.buffer);

		expect(reader.readBits(3)).toBe(0b101);
		reader.resetBits();
		expect(reader.readUint8()).toBe(0xff);
	});

	test("grows an auto-resizing writer to fit the bits", () => {
		const writer = new BufferWriter();

		writer.writeBits(0b10101, 5);

		expect([...writer.bytes]).toEqual([0b10101]);
	});
});

describe("bit range helpers", () => {
	test.each([
		[8, false, 0, 255],
		[8, true, -128, 127],
		[16, false, 0, 65535],
		[16, true, -32768, 32767],
		[1, false, 0, 1],
	])("rangeMin/rangeMax for %i bits (signed: %p)", (bits, signed, min, max) => {
		expect(BufferWriter.rangeMin(bits, signed)).toBe(min);
		expect(BufferWriter.rangeMax(bits, signed)).toBe(max);
	});

	test("rejects bit widths outside [1, 53]", () => {
		expect(() => BufferWriter.rangeMax(0)).toThrow(RangeError);
		expect(() => BufferWriter.rangeMax(54)).toThrow(RangeError);
		expect(() => BufferWriter.rangeMin(0)).toThrow(RangeError);
		expect(() => BufferWriter.rangeMin(54)).toThrow(RangeError);
	});

	test("requiredBits reports the width needed for a value", () => {
		expect(BufferWriter.requiredBits(100)).toBe(7);
		expect(BufferWriter.requiredBits(255)).toBe(8);
		expect(BufferWriter.requiredBits(-100, true)).toBe(7);
	});
});

describe("precision encoding", () => {
	test.each([
		[75.5, 100, 12],
		[0, 100, 8],
		[100, 100, 8],
		[33.3, 100, 16],
	])("encodes %f in [0, %i] using %i bits", (value, maximum, bits) => {
		const encoded = BufferWriter.toPrecision(value, maximum, bits);
		const writer = new BufferWriter(8, false);

		writer.writeBits(encoded, bits);

		const decoded = BufferReader.fromPrecision(new BufferReader(writer.buffer).readBits(bits), maximum, bits);

		expect(decoded).toBeCloseTo(value, 1);
	});

	test("supports signed ranges", () => {
		const encoded = BufferWriter.toPrecision(-25, 50, 12, true);
		const writer = new BufferWriter(8, false);

		writer.writeBits(encoded, 12);

		const decoded = BufferReader.fromPrecision(new BufferReader(writer.buffer).readBits(12), 50, 12, true);

		expect(decoded).toBeCloseTo(-25, 1);
	});

	test("clamps values outside the range", () => {
		expect(BufferReader.fromPrecision(BufferWriter.toPrecision(999, 100, 12), 100, 12)).toBeCloseTo(100, 1);
		expect(BufferReader.fromPrecision(BufferWriter.toPrecision(-999, 100, 12), 100, 12)).toBeCloseTo(0, 1);
	});
});

describe("booleans", () => {
	test("packs bit booleans into a single byte", () => {
		const writer = new BufferWriter(1, false);

		writer.writeBoolean(true);
		writer.writeBoolean(false);
		writer.writeBoolean(true);

		const reader = new BufferReader(writer.buffer);

		expect(reader.readBoolean()).toBe(true);
		expect(reader.readBoolean()).toBe(false);
		expect(reader.readBoolean()).toBe(true);
	});

	test("writes a full byte when requested", () => {
		const writer = new BufferWriter();

		writer.writeBoolean(true, true);

		expect(writer.bytes.length).toBe(1);
		expect(new BufferReader(writer.bytes).readBoolean(true)).toBe(true);
	});

	test("treats numbers as truthy or falsy", () => {
		const writer = new BufferWriter();

		writer.writeBoolean(1, true);
		writer.writeBoolean(0, true);

		const reader = new BufferReader(writer.bytes);

		expect(reader.readBoolean(true)).toBe(true);
		expect(reader.readBoolean(true)).toBe(false);
	});
});
