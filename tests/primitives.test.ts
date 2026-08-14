import { describe, expect, test } from "bun:test";

import { BufferReader } from "../src/reader.js";

import { BufferWriter } from "../src/writer.js";

describe.each([
	["little-endian", true],
	["big-endian", false],
])("primitives (%s)", (_name, littleEndian) => {
	test("roundtrips every fixed-width type", () => {
		const writer = new BufferWriter(0, true, littleEndian);

		writer.writeUint8(255);
		writer.writeInt8(-128);
		writer.writeUint16(65535);
		writer.writeInt16(-32768);
		writer.writeUint32(4294967295);
		writer.writeInt32(-2147483648);
		writer.writeUint64(18446744073709551615n);
		writer.writeInt64(-9223372036854775808n);
		writer.writeFloat32(1.5);
		writer.writeFloat64(-1234.5678);
		writer.writeFloat16(2.5);

		const reader = new BufferReader(writer.bytes, false, undefined, littleEndian);

		expect(reader.readUint8()).toBe(255);
		expect(reader.readInt8()).toBe(-128);
		expect(reader.readUint16()).toBe(65535);
		expect(reader.readInt16()).toBe(-32768);
		expect(reader.readUint32()).toBe(4294967295);
		expect(reader.readInt32()).toBe(-2147483648);
		expect(reader.readUint64()).toBe(18446744073709551615n);
		expect(reader.readInt64()).toBe(-9223372036854775808n);
		expect(reader.readFloat32()).toBe(1.5);
		expect(reader.readFloat64()).toBe(-1234.5678);
		expect(reader.readFloat16()).toBe(2.5);
		expect(reader.remainingBytes).toBe(0);
	});

	test("writes the expected number of bytes per type", () => {
		const sizes: [keyof BufferWriter, number][] = [
			["writeUint8", 1],
			["writeInt8", 1],
			["writeUint16", 2],
			["writeFloat16", 2],
			["writeUint32", 4],
			["writeFloat32", 4],
			["writeFloat64", 8],
		];

		for (const [method, size] of sizes) {
			const writer = new BufferWriter(0, true, littleEndian);

			(writer[method] as (value?: number) => BufferWriter)(0);

			expect(writer.offset).toBe(size);
		}
	});
});

describe("endianness", () => {
	test("byte order is reversed between the two modes", () => {
		const little = new BufferWriter(0, true, true);
		const big = new BufferWriter(0, true, false);

		little.writeUint32(0x01020304);
		big.writeUint32(0x01020304);

		expect([...little.bytes]).toEqual([4, 3, 2, 1]);
		expect([...big.bytes]).toEqual([1, 2, 3, 4]);
	});

	test("defaults to the system endianness on both ends", () => {
		const writer = new BufferWriter();

		writer.writeUint32(0xdeadbeef);

		expect(new BufferReader(writer.bytes).readUint32()).toBe(0xdeadbeef);
	});
});

describe("floats", () => {
	test("float16 keeps values representable in half precision", () => {
		for (const value of [0, 1, -1, 0.5, 2.5, -2.5, 1024]) {
			const writer = new BufferWriter();

			writer.writeFloat16(value);

			expect(new BufferReader(writer.bytes).readFloat16()).toBe(value);
		}
	});

	test("float32 is exact for representable values and approximate otherwise", () => {
		const writer = new BufferWriter();

		writer.writeFloat32(0.1);

		expect(new BufferReader(writer.bytes).readFloat32()).toBeCloseTo(0.1, 6);
	});

	test("float64 is exact", () => {
		const writer = new BufferWriter();

		writer.writeFloat64(0.1);

		expect(new BufferReader(writer.bytes).readFloat64()).toBe(0.1);
	});
});
