import { describe, expect, test } from "bun:test";

import { BufferReader } from "../src/reader.js";

import { BufferWriter } from "../src/writer.js";

describe("writer capacity", () => {
	test("auto-resizes to fit everything written", () => {
		const writer = new BufferWriter();

		for (let index = 0; index < 100; index++) {
			writer.writeUint32(index);
		}

		expect(writer.bytes.length).toBe(400);

		const reader = new BufferReader(writer.bytes);

		for (let index = 0; index < 100; index++) {
			expect(reader.readUint32()).toBe(index);
		}
	});

	test("throws when a fixed buffer overflows", () => {
		const writer = new BufferWriter(4, false);

		writer.writeUint32(1);

		expect(writer.hasSpace(1)).toBe(false);
		expect(writer.remainingBytes).toBe(0);
		expect(() => writer.writeUint8(1)).toThrow(RangeError);
	});

	test("expand grows a fixed buffer and keeps the contents", () => {
		const writer = new BufferWriter(2, false);

		writer.writeUint16(0x1234);
		writer.expand(6);

		expect(writer.byteLength).toBe(8);
		expect(new BufferReader(writer.buffer).readUint16()).toBe(0x1234);
	});

	test("shrink trims to the write cursor", () => {
		const writer = new BufferWriter(10, false);

		writer.writeUint16(9);
		writer.shrink();

		expect(writer.byteLength).toBe(2);
		expect(new BufferReader(writer.buffer).readUint16()).toBe(9);
	});

	test("bytes returns only what was written", () => {
		const writer = new BufferWriter();

		writer.writeUint8(1);
		writer.writeUint8(2);

		expect([...writer.bytes]).toEqual([1, 2]);
	});
});

describe("writer navigation", () => {
	test("tracks the offset as data is written", () => {
		const writer = new BufferWriter(8, false);

		writer.writeUint8(1);
		writer.writeUint8(2);

		expect(writer.offset).toBe(2);
	});

	test("reset rewinds so writes overwrite", () => {
		const writer = new BufferWriter(8, false);

		writer.writeUint8(1);
		writer.reset();
		writer.writeUint8(9);

		expect(writer.offset).toBe(1);
		expect(writer.buffer[0]).toBe(9);
	});

	test("move and advanceBytes reposition the cursor", () => {
		const writer = new BufferWriter(8, false);

		writer.move(5);
		expect(writer.offset).toBe(5);

		writer.advanceBytes(2);
		expect(writer.offset).toBe(7);
	});

	test("writing at an explicit offset does not move the cursor", () => {
		const writer = new BufferWriter(8, false);

		writer.writeUint8(1);
		writer.writeUint8(0xff, 5);

		expect(writer.offset).toBe(1);
		expect(writer.buffer[5]).toBe(0xff);
	});

	test("clone copies the contents, and clone(true) rewinds", () => {
		const writer = new BufferWriter(4, false);

		writer.writeUint16(0x1234);

		expect([...writer.clone().buffer]).toEqual([...writer.buffer]);
		expect(writer.clone().offset).toBe(writer.offset);
		expect(writer.clone(true).offset).toBe(0);
	});
});

describe("reader navigation", () => {
	test("tracks offset and remaining bytes", () => {
		const reader = new BufferReader(new Uint8Array([1, 2, 3, 4]));

		reader.readUint8();

		expect(reader.offset).toBe(1);
		expect(reader.remainingBytes).toBe(3);
		expect(reader.hasSpace(3)).toBe(true);
		expect(reader.hasSpace(4)).toBe(false);
	});

	test("reset rewinds to the start", () => {
		const reader = new BufferReader(new Uint8Array([1, 2, 3, 4]));

		reader.readUint32();
		reader.reset();

		expect(reader.offset).toBe(0);
		expect(reader.readUint8()).toBe(1);
	});

	test("peeks without advancing when advance is false", () => {
		const reader = new BufferReader(new Uint8Array([1, 2, 3, 4]));

		expect(reader.readUint8(false, 2)).toBe(3);
		expect(reader.offset).toBe(0);
	});

	test("clone keeps the position unless reset", () => {
		const reader = new BufferReader(new Uint8Array([1, 2, 3]));

		reader.readUint8();

		expect(reader.clone().offset).toBe(1);
		expect(reader.clone(true).offset).toBe(0);
	});

	test("toString renders without throwing", () => {
		expect(typeof new BufferReader(new Uint8Array(4)).toString()).toBe("string");
		expect(typeof new BufferWriter(4, false).toString()).toBe("string");
	});
});
