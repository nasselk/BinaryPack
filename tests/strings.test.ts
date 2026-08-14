import { describe, expect, test } from "bun:test";

import { BufferReader } from "../src/reader.js";

import { BufferWriter } from "../src/writer.js";

const SAMPLES = ["", "hello", "héllo wörld", "日本語テキスト", "emoji 🎉🚀", "a".repeat(1000)];

describe("strings", () => {
	test.each(SAMPLES)("roundtrips %p with a size prefix on a resizable writer", (text) => {
		const writer = new BufferWriter();

		writer.writeString(text, true);

		expect(new BufferReader(writer.bytes).readString(true)).toBe(text);
	});

	test.each(SAMPLES)("roundtrips %p with a size prefix on a fixed writer", (text) => {
		const writer = new BufferWriter(BufferWriter.stringByteLength(text) + 2, false);

		writer.writeString(text, true);

		expect(new BufferReader(writer.buffer).readString(true)).toBe(text);
	});

	test("roundtrips without a size prefix when the length is known", () => {
		const writer = new BufferWriter();

		writer.writeString("abc", false);

		expect(new BufferReader(writer.bytes).readString(3)).toBe("abc");
	});

	test("stringByteLength counts UTF-8 bytes, not characters", () => {
		expect(BufferWriter.stringByteLength("abc")).toBe(3);
		expect(BufferWriter.stringByteLength("é")).toBe(2);
		expect(BufferWriter.stringByteLength("日")).toBe(3);
		expect(BufferWriter.stringByteLength("🚀")).toBe(4);
	});

	test("size prefix holds the byte length", () => {
		const writer = new BufferWriter();

		writer.writeString("é", true);

		expect(new BufferReader(writer.bytes).readUint16()).toBe(2);
	});

	test("writeTextBuffer and readTextBuffer are inverses", () => {
		const encoded = BufferWriter.writeTextBuffer("hey");

		expect(BufferReader.readTextBuffer(encoded.buffer as ArrayBuffer)).toBe("hey");
	});

	test("throws when the text does not fit a fixed buffer", () => {
		expect(() => new BufferWriter(2, false).writeString("far too long", true)).toThrow(RangeError);
	});

	test("writes several strings back to back", () => {
		const writer = new BufferWriter();

		writer.writeString("one", true);
		writer.writeString("two", true);
		writer.writeString("three", true);

		const reader = new BufferReader(writer.bytes);

		expect([reader.readString(true), reader.readString(true), reader.readString(true)]).toEqual(["one", "two", "three"]);
		expect(reader.remainingBytes).toBe(0);
	});
});
