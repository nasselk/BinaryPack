import { describe, expect, test } from "bun:test";

import { BufferReader } from "../src/reader.js";

import { BufferWriter } from "../src/writer.js";

describe("realistic packets", () => {
	test("roundtrips a mixed packet", () => {
		const writer = new BufferWriter();

		writer.writeUint8(0x01);
		writer.writeString("player", true);
		writer.writeUint(1500);
		writer.writeInt(-250);
		writer.writeFloat32(3.25);
		writer.writeUint16(0xbeef);
		writer.writeBuffer(new Uint8Array([9, 8, 7]), true);

		const reader = new BufferReader(writer.bytes);

		expect(reader.readUint8()).toBe(0x01);
		expect(reader.readString(true)).toBe("player");
		expect(reader.readUint()).toBe(1500);
		expect(reader.readInt()).toBe(-250);
		expect(reader.readFloat32()).toBe(3.25);
		expect(reader.readUint16()).toBe(0xbeef);
		expect([...reader.readBuffer(true)]).toEqual([9, 8, 7]);
		expect(reader.remainingBytes).toBe(0);
	});

	test("roundtrips a bit-packed header followed by aligned fields", () => {
		const writer = new BufferWriter(16, false);

		writer.writeBits(1, 1);
		writer.writeBits(0, 1);
		writer.writeBits(3, 2);
		writer.writeBits(9, 4);
		writer.resetBits();
		writer.writeUint16(0xbeef);
		writer.writeFloat32(1.5);

		const reader = new BufferReader(writer.buffer);

		expect(reader.readBits(1)).toBe(1);
		expect(reader.readBits(1)).toBe(0);
		expect(reader.readBits(2)).toBe(3);
		expect(reader.readBits(4)).toBe(9);
		reader.resetBits();
		expect(reader.readUint16()).toBe(0xbeef);
		expect(reader.readFloat32()).toBe(1.5);
	});

	test("roundtrips a batch of entity updates", () => {
		const entities = [
			{ id: 1, x: 12.5, y: -8.25, health: 100, alive: true },
			{ id: 4096, x: 0, y: 0, health: 1, alive: false },
			{ id: 70000, x: -1024.75, y: 2048.5, health: 55, alive: true },
		];

		const writer = new BufferWriter();

		writer.writeUint(entities.length);

		for (const entity of entities) {
			writer.writeUint(entity.id);
			writer.writeFloat32(entity.x);
			writer.writeFloat32(entity.y);
			writer.writeUint8(entity.health);
			writer.writeBoolean(entity.alive, true);
		}

		const reader = new BufferReader(writer.bytes);
		const count = reader.readUint();
		const decoded = [];

		for (let index = 0; index < count; index++) {
			decoded.push({
				id: reader.readUint(),
				x: reader.readFloat32(),
				y: reader.readFloat32(),
				health: reader.readUint8(),
				alive: reader.readBoolean(true),
			});
		}

		expect(decoded).toEqual(entities);
		expect(reader.remainingBytes).toBe(0);
	});

	test("a reader can consume a buffer produced by a big-endian writer", () => {
		const writer = new BufferWriter(0, true, false);

		writer.writeUint32(0x01020304);
		writer.writeString("be", true);

		const reader = new BufferReader(writer.bytes, false, undefined, false);

		expect(reader.readUint32()).toBe(0x01020304);
		expect(reader.readString(true)).toBe("be");
	});
});
