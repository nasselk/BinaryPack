import { describe, expect, test } from "bun:test";

import { BufferReader } from "../src/reader.js";

import { BufferWriter } from "../src/writer.js";

const DATA = () => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

describe("writeBuffer", () => {
	test("writes the whole buffer by default", () => {
		const writer = new BufferWriter();

		writer.writeBuffer(DATA());

		expect([...writer.bytes]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	test.each([
		["start only", { start: 4 }, [4, 5, 6, 7]],
		["start and byteLength", { start: 2, byteLength: 3 }, [2, 3, 4]],
		["empty slice", { start: 0, byteLength: 0 }, []],
		["full slice", { start: 0, byteLength: 8 }, [0, 1, 2, 3, 4, 5, 6, 7]],
		["tail", { start: 7 }, [7]],
	])("writes a partial buffer: %s", (_name, slice, expected) => {
		const writer = new BufferWriter();

		writer.writeBuffer(DATA(), false, slice);

		expect([...writer.bytes]).toEqual(expected);
	});

	test("accepts every supported source type", () => {
		const data = DATA();

		const fromArrayBuffer = new BufferWriter();
		const fromView = new BufferWriter();
		const fromReader = new BufferWriter();
		const fromWriter = new BufferWriter();

		fromArrayBuffer.writeBuffer(data.buffer, false, { start: 6 });
		fromView.writeBuffer(data.subarray(2), false, { start: 1, byteLength: 2 });
		fromReader.writeBuffer(new BufferReader(data), false, { start: 6 });
		fromWriter.writeBuffer(new BufferWriter(data), false, { start: 6 });

		expect([...fromArrayBuffer.bytes]).toEqual([6, 7]);
		expect([...fromView.bytes]).toEqual([3, 4]);
		expect([...fromReader.bytes]).toEqual([6, 7]);
		expect([...fromWriter.bytes]).toEqual([6, 7]);
	});

	test("copies multi-byte typed arrays as raw bytes", () => {
		const writer = new BufferWriter(0, true, true);

		writer.writeBuffer(new Uint16Array([0x0201, 0x0403]));

		expect([...writer.bytes]).toEqual([1, 2, 3, 4]);
	});

	test("size prefix records the slice length, not the source length", () => {
		const writer = new BufferWriter();

		writer.writeBuffer(DATA(), true, { start: 5 });

		const reader = new BufferReader(writer.bytes);

		expect(reader.readUint16()).toBe(3);
		expect([...reader.readBuffer()]).toEqual([5, 6, 7]);
	});

	test("advances the write cursor by the slice length", () => {
		const writer = new BufferWriter();

		writer.writeUint8(9);
		writer.writeBuffer(DATA(), false, { start: 1, byteLength: 2 });
		writer.writeUint8(9);

		expect([...writer.bytes]).toEqual([9, 1, 2, 9]);
	});

	test.each([
		["slice longer than the source", { start: 6, byteLength: 5 }],
		["start past the end", { start: 99 }],
		["negative start", { start: -1 }],
		["negative byteLength", { start: 0, byteLength: -1 }],
	])("throws on %s", (_name, slice) => {
		expect(() => new BufferWriter().writeBuffer(DATA(), false, slice)).toThrow(RangeError);
	});

	test("throws on a negative start even when the view sits at an offset", () => {
		// The view's own bounds must be respected, not just those of the underlying ArrayBuffer
		expect(() => new BufferWriter().writeBuffer(DATA().subarray(4), false, { start: -2 })).toThrow(RangeError);
	});
});

describe("readBuffer", () => {
	test("reads a fixed number of bytes", () => {
		const reader = new BufferReader(DATA());

		expect([...reader.readBuffer(3)]).toEqual([0, 1, 2]);
		expect(reader.offset).toBe(3);
	});

	test("reads the rest of the buffer when no size is given", () => {
		const reader = new BufferReader(DATA());

		reader.readUint32();

		expect([...reader.readBuffer()]).toEqual([4, 5, 6, 7]);
	});

	test("reads a size-prefixed buffer", () => {
		const writer = new BufferWriter();

		writer.writeBuffer(new Uint8Array([9, 8, 7]), true);

		expect([...new BufferReader(writer.bytes).readBuffer(true)]).toEqual([9, 8, 7]);
	});

	test("shares memory unless cloned", () => {
		const source = DATA();
		const view = new BufferReader(source).readBuffer(2, false);

		view[0] = 99;

		expect(source[0]).toBe(99);
	});

	test("clone produces an independent copy", () => {
		const source = DATA();
		const copy = new BufferReader(source).readBuffer(2, true);

		copy[0] = 99;

		expect(source[0]).toBe(0);
	});
});
