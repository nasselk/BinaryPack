import { describe, expect, test } from "bun:test";

import { BufferReader } from "../src/reader.js";

import { BufferWriter } from "../src/writer.js";

const DATA = () => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

describe("writeBytes", () => {
	test("writes the whole array by default", () => {
		const writer = new BufferWriter();

		writer.writeBytes(DATA());

		expect([...writer.bytes]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	test.each([
		["start only", 4, undefined, [4, 5, 6, 7]],
		["start and end", 2, 5, [2, 3, 4]],
		["empty range", 0, 0, []],
		["full range", 0, 8, [0, 1, 2, 3, 4, 5, 6, 7]],
		["tail", 7, undefined, [7]],
	])("writes a partial array: %s", (_name, start, end, expected) => {
		const writer = new BufferWriter();

		writer.writeBytes(DATA(), start, end);

		expect([...writer.bytes]).toEqual(expected);
	});

	test("respects the bounds of a view at an offset", () => {
		const writer = new BufferWriter();

		writer.writeBytes(DATA().subarray(2), 1, 3);

		expect([...writer.bytes]).toEqual([3, 4]);
	});

	test("size prefix written with writeUint16 is readable by readBytes", () => {
		const writer = new BufferWriter();
		const data = DATA();

		writer.writeUint16(3).writeBytes(data, 5);

		const reader = new BufferReader(writer.bytes);

		expect([...reader.readBytes(true)]).toEqual([5, 6, 7]);
	});

	test("advances the write cursor by the range length", () => {
		const writer = new BufferWriter();

		writer.writeUint8(9);
		writer.writeBytes(DATA(), 1, 3);
		writer.writeUint8(9);

		expect([...writer.bytes]).toEqual([9, 1, 2, 9]);
	});

	test("grows a resizable buffer", () => {
		const writer = new BufferWriter(2, true);

		writer.writeBytes(DATA());

		expect([...writer.bytes]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	test("throws when a fixed buffer overflows", () => {
		expect(() => new BufferWriter(4, false).writeBytes(DATA())).toThrow(RangeError);
	});
});

describe("readBytes", () => {
	test("reads a fixed number of bytes", () => {
		const reader = new BufferReader(DATA());

		expect([...reader.readBytes(3)]).toEqual([0, 1, 2]);
		expect(reader.offset).toBe(3);
	});

	test("reads the rest of the buffer when no size is given", () => {
		const reader = new BufferReader(DATA());

		reader.readUint32();

		expect([...reader.readBytes()]).toEqual([4, 5, 6, 7]);
	});

	test("reads a size-prefixed buffer", () => {
		const writer = new BufferWriter();

		writer.writeUint16(3).writeBytes(new Uint8Array([9, 8, 7]));

		expect([...new BufferReader(writer.bytes).readBytes(true)]).toEqual([9, 8, 7]);
	});

	test("shares memory unless cloned", () => {
		const source = DATA();
		const view = new BufferReader(source).readBytes(2, false);

		view[0] = 99;

		expect(source[0]).toBe(99);
	});

	test("clone produces an independent copy", () => {
		const source = DATA();
		const copy = new BufferReader(source).readBytes(2, true);

		copy[0] = 99;

		expect(source[0]).toBe(0);
	});
});
