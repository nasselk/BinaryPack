import { describe, expect, test } from "bun:test";

import { createBuffer } from "../src/buffer.js";

import { BufferReader } from "../src/reader.js";

import { clamp } from "../src/utils.js";

import { BufferWriter } from "../src/writer.js";

const DATA = () => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

describe("createBuffer", () => {
	test("allocates a zeroed buffer for a numeric size", () => {
		expect([...createBuffer(4)]).toEqual([0, 0, 0, 0]);
	});

	test("allocates the requested size when clearing is disabled", () => {
		expect(createBuffer(64, false, undefined, false).length).toBe(64);
	});

	test("copies plain arrays", () => {
		const source = [1, 2, 3];
		const buffer = createBuffer(source);

		buffer[0] = 99;

		expect([...buffer]).toEqual([99, 2, 3]);
		expect(source[0]).toBe(1);
	});

	test.each([
		["Uint8Array", () => DATA()],
		["ArrayBuffer", () => DATA().buffer],
		["BufferReader", () => new BufferReader(DATA())],
		["BufferWriter", () => new BufferWriter(DATA())],
	])("applies a slice to a %s", (_name, make) => {
		expect([...createBuffer(make() as never, false, { start: 4 })]).toEqual([4, 5, 6, 7]);
		expect([...createBuffer(make() as never, false, { start: 2, byteLength: 3 })]).toEqual([2, 3, 4]);
	});

	test("respects the byteOffset of an existing view", () => {
		expect([...createBuffer(DATA().subarray(4), false, { start: 1 })]).toEqual([5, 6, 7]);
	});

	test("shares memory unless cloned", () => {
		const source = DATA();
		const view = createBuffer(source);

		view[0] = 99;

		expect(source[0]).toBe(99);
	});

	test("clone produces an independent copy", () => {
		const source = DATA();
		const copy = createBuffer(source, true);

		copy[0] = 99;

		expect(source[0]).toBe(0);
	});

	test.each([
		["a slice past the end", { start: 6, byteLength: 5 }],
		["a start past the end", { start: 99 }],
		["a negative start", { start: -1 }],
		["a negative byteLength", { start: 0, byteLength: -1 }],
	])("throws on %s", (_name, slice) => {
		expect(() => createBuffer(DATA(), false, slice)).toThrow(RangeError);
	});

	test("throws on an unsupported source", () => {
		expect(() => createBuffer({ nope: 1 } as never)).toThrow(TypeError);
	});
});

describe("reader and writer construction", () => {
	test("reader accepts a slice", () => {
		expect([...new BufferReader(DATA(), false, { start: 4 }).buffer]).toEqual([4, 5, 6, 7]);
		expect([...new BufferReader(DATA(), false, { start: 2, byteLength: 3 }).buffer]).toEqual([2, 3, 4]);
	});

	test("writer accepts a slice", () => {
		expect(new BufferWriter(DATA(), false, undefined, false, { start: 4 }).byteLength).toBe(4);
	});

	test("reader clone leaves the source untouched", () => {
		const source = DATA();
		const reader = new BufferReader(source, true);

		reader.buffer[0] = 42;

		expect(source[0]).toBe(0);
	});

	test("a writer can wrap a reader and vice versa", () => {
		const reader = new BufferReader(DATA());
		const writer = new BufferWriter(reader);

		expect(writer.byteLength).toBe(8);
		expect(new BufferReader(writer).byteLength).toBe(8);
	});
});

describe("clamp", () => {
	test.each([
		[5, 0, 10, 5],
		[-5, 0, 10, 0],
		[15, 0, 10, 10],
		[0, 0, 0, 0],
	])("clamp(%i, %i, %i) is %i", (value, min, max, expected) => {
		expect(clamp(value, min, max)).toBe(expected);
	});

	test("throws when the range is inverted", () => {
		expect(() => clamp(1, 10, 0)).toThrow(RangeError);
	});
});
