import { endianness, createBuffer, textDecoder, type Buffers } from "./buffer.js";

import { BufferWriter } from "./writer.js";

/**
 * A binary buffer reader for efficient sequential reading of various data types.
 * Supports both byte-aligned and bit-level reading operations with automatic offset tracking.
 *
 * @remarks
 * This class provides a comprehensive API for reading binary data including:
 * - Primitive types (int8/16/32/64, uint8/16/32/64, float16/32/64)
 * - Bit-level operations for space-efficient data encoding
 * - Variable-length integers
 * - Text strings with optional size prefixes
 * - Raw buffer slices
 *
 * @see {@link BufferWriter} for the companion writer class
 *
 * @example
 * const buffer = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
 * const reader = new BufferReader(buffer);
 *
 * const byte1 = reader.readUint8(); // 1
 * const byte2 = reader.readUint8(); // 2
 * console.log(reader.offset); // 2
 */
class BufferReader {
	/** The underlying Uint8Array buffer being read from. */
	public readonly buffer: Uint8Array;

	/** The endianness of the buffer (true for little-endian, false for big-endian). */
	private readonly endianness: boolean;

	/** The total length of the buffer in bytes. */
	public readonly byteLength: number;

	/** DataView for efficient typed array access. */
	private readonly view: DataView;

	/** The byte offset where bit operations are currently positioned. */
	private bitOffset: number;

	/** The bit index within the current byte (0-7). */
	private bitIndex: number;

	/** The current read position in bytes. */
	public offset: number;

	/**
	 * Creates a new BufferReader instance.
	 *
	 * @param buffer - The buffer to read from. Can be ArrayBuffer, TypedArray, BufferWriter, or BufferReader.
	 * @param clone - If true, creates a copy of the buffer. If false, uses the buffer directly. Defaults to false.
	 * @param offset - Starting byte offset within the buffer. Defaults to 0.
	 * @param littleEndian - Whether to use little-endian byte order. Defaults to system endianness.
	 *
	 * @example
	 * // Create from Uint8Array
	 * const reader = new BufferReader(new Uint8Array([1, 2, 3]));
	 *
	 * // Create with cloning to avoid mutations
	 * const safeReader = new BufferReader(buffer, true);
	 *
	 * // Create starting at offset 10
	 * const offsetReader = new BufferReader(buffer, false, 10);
	 */
	public constructor(buffer: Buffers, clone: boolean = false, offset: number = 0, littleEndian: boolean = endianness) {
		this.buffer = createBuffer(buffer, clone, offset);

		this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
		this.byteLength = this.view.byteLength;
		this.endianness = littleEndian;
		this.bitOffset = 0;
		this.bitIndex = 0;
		this.offset = 0;
	}

	/**
	 * Converts a precision-encoded value back to its original range.
	 * This is the inverse operation of BufferWriter.toPrecision().
	 *
	 * @param value - The encoded integer value read from the buffer.
	 * @param maximum - The maximum value of the original range.
	 * @param bits - The number of bits used for encoding.
	 * @param signed - Whether the value is signed.
	 * @param minimum - The minimum value of the original range.
	 * @returns The decoded floating-point value in the original range.
	 *
	 * @example
	 * // Decode a value that was encoded in 12 bits, range [0, 100]
	 * const encoded = reader.readBits(12);
	 * const value = BufferReader.fromPrecision(encoded, 100, 12);
	 *
	 * // Decode signed value in range [-50, 50]
	 * const signedEncoded = reader.readBits(10, true);
	 * const signedValue = BufferReader.fromPrecision(signedEncoded, 50, 10, true);
	 */
	public static fromPrecision(value: number, maximum: number, bits: number, signed: boolean = false, minimum: number = signed ? -maximum : 0): number {
		if (maximum === minimum) return minimum;

		const bound = BufferWriter.rangeMax(bits, signed);

		return (value / bound) * (maximum - minimum) + minimum;
	}

	/**
	 * Decodes a text string from an ArrayBuffer.
	 *
	 * @param buffer - The ArrayBuffer containing UTF-8 encoded text.
	 * @returns The decoded string.
	 *
	 * @example
	 * const textBuffer = new Uint8Array([72, 101, 108, 108, 111]).buffer;
	 * const text = BufferReader.readTextBuffer(textBuffer); // "Hello"
	 */
	public static readTextBuffer(buffer: ArrayBuffer): string {
		return textDecoder.decode(buffer);
	}

	/**
	 * Reads a specified number of bits as an integer.
	 * Supports non-byte-aligned reads for space-efficient data encoding.
	 *
	 * @param bits - Number of bits to read (1-32).
	 * @param signed - Whether to interpret the value as signed.
	 * @param advance - Whether to advance the read position.
	 * @param bitOffset - The byte offset to read from.
	 * @returns The integer value read from the buffer.
	 *
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @remarks
	 * This method automatically optimizes byte-aligned reads of 8, 16, or 32 bits
	 * by delegating to the appropriate typed read method for better performance.
	 *
	 * @example
	 * // Read a 3-bit value (0-7)
	 * const value = reader.readBits(3); // 0-7
	 *
	 * // Read a 12-bit signed value
	 * const signedValue = reader.readBits(12, true); // -2048 to 2047
	 *
	 * // Peek at next 5 bits without advancing
	 * const peek = reader.readBits(5, false, false);
	 */
	public readBits(bits: number = 1, signed: boolean = false, advance: boolean = true, offset: number = this.bitOffset): number {
		let value = 0;
		let bitsRead = 0;
		let byteOffset = this.offset;
		let bitOffset = offset;
		let bitIndex = this.bitIndex;

		if (offset !== this.bitOffset) {
			if (advance) {
				this.bitIndex = 0;
			}

			bitIndex = 0;
		}

		if (bitIndex === 0 && bitOffset === this.offset) {
			switch (bits) {
				case 8:
					return signed ? this.readInt8(advance, bitOffset) : this.readUint8(advance, bitOffset);
				case 16:
					return signed ? this.readInt16(advance, bitOffset) : this.readUint16(advance, bitOffset);
				case 32:
					return signed ? this.readInt32(advance, bitOffset) : this.readUint32(advance, bitOffset);
			}
		}

		while (bitsRead < bits) {
			if (bitIndex === 0) {
				bitOffset = byteOffset;
				byteOffset++;
			}

			// Calculate how many bits we can read from current byte
			const bitsInCurrentByte = 8 - bitIndex;
			const bitsToRead = Math.min(bits - bitsRead, bitsInCurrentByte);

			// Read the current byte once
			const currentByte = this.buffer[bitOffset];

			// Extract the bits we want
			const mask = (1 << bitsToRead) - 1;
			const extractedBits = (currentByte >> bitIndex) & mask;

			// Add to our result
			value |= extractedBits << bitsRead;

			// Update counters
			bitsRead += bitsToRead;
			bitIndex = (bitIndex + bitsToRead) % 8;
		}

		if (signed) {
			const min = BufferWriter.rangeMin(bits, signed);
			value += min;
		} else {
			value = value >>> 0;
		}

		if (advance) {
			this.offset = byteOffset;
			this.bitOffset = bitOffset;
			this.bitIndex = bitIndex;
		}

		return value;
	}

	/**
	 * Reads a boolean value, optionally from a full byte.
	 *
	 * @param byte - If true, reads a full byte instead of a single bit.
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The boolean value.
	 *
	 * @throws {RangeError} If attempting to read beyond the buffer bounds when reading as byte.
	 *
	 * @example
	 * // Read as full byte (0 = false, non-zero = true)
	 * const byteFlag = reader.readBoolean(true);
	 *
	 * // Peek at byte 10 without advancing
	 * const peek = reader.readBoolean(true, 10, false);
	 */
	public readBoolean(byte: boolean = false, advance?: boolean, offset: number = this.offset): boolean {
		let result: number;

		if (byte) {
			result = this.readUint8(advance, offset);
		} else {
			result = this.readBits();
		}

		return Boolean(result);
	}

	/**
	 * Reads an unsigned 8-bit integer (0 to 255).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The unsigned 8-bit integer value.
	 *
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const byte = reader.readUint8(); // 0-255
	 * const peek = reader.readUint8(false); // Peek without advancing
	 * const specific = reader.readUint8(true, 10); // Read from offset 10
	 */
	public readUint8(advance: boolean = true, offset: number = this.offset): number {
		const value = this.view.getUint8(offset);

		this.advance(1, offset, advance);

		return value;
	}

	/**
	 * Reads a signed 8-bit integer (-128 to 127).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The signed 8-bit integer value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const byte = reader.readInt8(); // -128 to 127
	 */
	public readInt8(advance: boolean = true, offset: number = this.offset): number {
		const value = this.view.getInt8(offset);

		this.advance(1, offset, advance);

		return value;
	}

	/**
	 * Reads an unsigned 16-bit integer (0 to 65535).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The unsigned 16-bit integer value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const short = reader.readUint16(); // 0-65535
	 */
	public readUint16(advance: boolean = true, offset: number = this.offset): number {
		const value = this.view.getUint16(offset, this.endianness);

		this.advance(2, offset, advance);

		return value;
	}

	/**
	 * Reads a signed 16-bit integer (-32768 to 32767).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The signed 16-bit integer value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const value = reader.readInt16(); // -32768 to 32767
	 */
	public readInt16(advance: boolean = true, offset: number = this.offset): number {
		const value = this.view.getInt16(offset, this.endianness);

		this.advance(2, offset, advance);

		return value;
	}

	/**
	 * Reads a 16-bit floating-point number (half-precision float).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The 16-bit floating-point value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const half = reader.readFloat16(); // 16-bit float
	 */
	public readFloat16(advance: boolean = true, offset: number = this.offset): number {
		const value = this.view.getFloat16(offset, this.endianness);

		this.advance(2, offset, advance);

		return value;
	}

	/**
	 * Reads an unsigned 32-bit integer (0 to 4294967295).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The unsigned 32-bit integer value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const integer = reader.readUint32(); // 0-4294967295
	 */
	public readUint32(advance: boolean = true, offset: number = this.offset): number {
		const value = this.view.getUint32(offset, this.endianness);

		this.advance(4, offset, advance);

		return value;
	}

	/**
	 * Reads a signed 32-bit integer (-2147483648 to 2147483647).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The signed 32-bit integer value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const int = reader.readInt32(); // ±2.1 billion
	 */
	public readInt32(advance: boolean = true, offset: number = this.offset): number {
		const value = this.view.getInt32(offset, this.endianness);

		this.advance(4, offset, advance);

		return value;
	}

	/**
	 * Reads a 32-bit floating-point number (single-precision float).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The 32-bit floating-point value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const float = reader.readFloat32(); // IEEE 754 single precision
	 */
	public readFloat32(advance: boolean = true, offset: number = this.offset): number {
		const value = this.view.getFloat32(offset, this.endianness);

		this.advance(4, offset, advance);

		return value;
	}

	/**
	 * Reads an unsigned 64-bit integer as a BigInt (0 to 2^64-1).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The unsigned 64-bit BigInt value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const bigInt = reader.readUint64(); // Returns BigInt
	 */
	public readUint64(advance: boolean = true, offset: number = this.offset): bigint {
		const value = this.view.getBigUint64(offset, this.endianness);

		this.advance(8, offset, advance);

		return value;
	}

	/**
	 * Reads a signed 64-bit integer as a BigInt (-2^63 to 2^63-1).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The signed 64-bit BigInt value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const bigInt = reader.readInt64(); // Returns BigInt
	 */
	public readInt64(advance: boolean = true, offset: number = this.offset): bigint {
		const value = this.view.getBigInt64(offset, this.endianness);

		this.advance(8, offset, advance);

		return value;
	}

	/**
	 * Reads a 64-bit floating-point number (double-precision float).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The 64-bit floating-point value.
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * const double = reader.readFloat64(); // IEEE 754 double precision
	 */
	public readFloat64(advance: boolean = true, offset: number = this.offset): number {
		const value = this.view.getFloat64(offset, this.endianness);

		this.advance(8, offset, advance);

		return value;
	}

	/**
	 * Reads an unsigned variable-length integer encoded using LEB128 (Little Endian Base 128).
	 * More space-efficient for small positive numbers as it uses 1 byte per 7 bits.
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The decoded unsigned integer value.
	 *
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @remarks
	 * Each byte stores 7 bits of data and 1 continuation bit.
	 * Small values use fewer bytes (e.g., values < 128 use only 1 byte).
	 *
	 * @example
	 * const varInt = reader.readUint(); // Variable length encoding
	 * // Value 100 uses 1 byte, value 10000 uses 2 bytes
	 */
	public readUint(advance: boolean = true, offset: number = this.offset): number {
		let result = 0;
		let shift = 0;
		let byte: number;

		do {
			byte = this.readUint8(false, offset);
			result |= (byte & 0x7f) << shift;
			shift += 7;
			offset++;
		} while (byte & 0x80);

		if (advance) {
			this.offset = offset;
		}

		return result;
	}

	/**
	 * Reads a signed variable-length integer encoded using zigzag + LEB128 encoding.
	 * More space-efficient for small numbers (both positive and negative).
	 *
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The decoded signed integer value.
	 *
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @remarks
	 * Uses zigzag decoding to convert unsigned values back to signed:
	 * - 0 → 0, 1 → -1, 2 → 1, 3 → -2, 4 → 2, etc.
	 * Small negative numbers use few bytes (e.g., -1 uses only 1 byte).
	 *
	 * @example
	 * const signedInt = reader.readInt(); // Variable length encoding
	 * // Value -1 uses 1 byte, value -100 uses 2 bytes
	 */
	public readInt(advance: boolean = true, offset: number = this.offset): number {
		const zigzag = this.readUint(advance, offset);
		
		// Zigzag decode: (n >>> 1) ^ -(n & 1)
		// Converts unsigned back to signed: 0→0, 1→-1, 2→1, 3→-2, 4→2, etc.
		return (zigzag >>> 1) ^ -(zigzag & 1);
	}

	/**
	 * Reads a buffer with size prefix.
	 *
	 * @param readSize - If true, reads a uint16 size prefix first.
	 * @param clone - If true, returns a copy; if false, returns a view.
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns A Uint8Array containing the read data.
	 *
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * // Read buffer with 2-byte size prefix
	 * const buffer = reader.readBuffer(true);
	 */
	public readBuffer(readSize?: boolean, clone?: boolean, advance?: boolean, offset?: number): Uint8Array;

	/**
	 * Reads a fixed number of bytes as a buffer.
	 *
	 * @param bytes - Number of bytes to read. If undefined, reads all remaining bytes.
	 * @param clone - If true, returns a copy; if false, returns a view into the original buffer.
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns A Uint8Array containing the read data.
	 *
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * // Read 10 bytes
	 * const buffer = reader.readBuffer(10);
	 *
	 * // Read remaining bytes
	 * const rest = reader.readBuffer();
	 *
	 * // Read and clone to avoid shared references
	 * const copy = reader.readBuffer(5, true);
	 */
	public readBuffer(bytes?: number, clone?: boolean, advance?: boolean, offset?: number): Uint8Array;

	public readBuffer(size?: number | boolean, clone: boolean = false, advance: boolean = true, offset: number = this.offset): Uint8Array {
		let length: number;

		if (size === true) {
			// Read size prefix
			length = this.readUint16(advance, offset);

			offset += 2;
		} else if (size === false || size === undefined) {
			// Read all remaining
			length = this.buffer.byteLength - offset;
		} else {
			// Read fixed length
			length = size;
		}

		this.advance(length, offset, advance);

		if (clone) {
			return this.buffer.slice(offset, offset + length);
		} else {
			return this.buffer.subarray(offset, offset + length);
		}
	}

	/**
	 * Reads a UTF-8 encoded text string with size prefix.
	 *
	 * @param readSize - If true, reads a uint16 size prefix first.
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The decoded text string.
	 *
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * // Read string with 2-byte length prefix
	 * const text = reader.readString(true);
	 */
	public readString(readSize?: boolean, advance?: boolean, offset?: number): string;

	/**
	 * Reads a UTF-8 encoded text string of specified byte length.
	 *
	 * @param bytes - Number of bytes to read. If undefined, reads all remaining bytes.
	 * @param advance - Whether to advance the read position.
	 * @param offset - The byte offset to read from.
	 * @returns The decoded text string.
	 *
	 * @throws {RangeError} If attempting to read beyond the buffer bounds.
	 *
	 * @example
	 * // Read 10 bytes as text
	 * const text = reader.readString(10);
	 *
	 * // Read remaining bytes as text
	 * const rest = reader.readString();
	 */
	public readString(bytes?: number, advance?: boolean, offset?: number): string;

	public readString(a?: number | boolean, advance: boolean = true, offset: number = this.offset): string {
		const buffer = this.readBuffer(a as any, false, advance, offset);

		return textDecoder.decode(buffer);
	}

	/**
	 * Internal method to advance the read position.
	 *
	 * @param bytes - Number of bytes to advance.
	 * @param offset - The reference offset.
	 * @param advance - Whether to actually advance.
	 * @returns This reader for method chaining.
	 */
	private advance(bytes: number = 1, offset: number = this.offset, advance: boolean = offset === this.offset): this {
		if (advance) {
			this.advanceBytes(offset + bytes - this.offset);
		}

		return this;
	}

	/**
	 * Advances the read position by the specified number of bits without writing data.
	 * Handles bit-level skipping and byte boundary transitions.
	 *
	 * @param bits - Number of bits to skip.
	 * @returns This reader for method chaining.
	 *
	 * @example
	 * writer.skipBits(3); // Skip 3 bits
	 * writer.skipBits(); // Skip 1 bit
	 */
	public advanceBits(bits: number = 1): this {
		if (this.bitIndex + bits >= 8) {
			const bytesToSkip: number = Math.ceil((this.bitIndex + bits) / 8);

			this.advanceBytes(bytesToSkip);

			this.bitOffset += bytesToSkip;
			this.bitIndex = (this.bitIndex + bits) % 8;
		} else {
			this.bitIndex += bits;
		}

		return this;
	}

	/**
	 * Advances the read position by the specified number of bytes without reading data.
	 *
	 * @param bytes - Number of bytes to skip.
	 * @returns This reader for method chaining.
	 *
	 * @example
	 * reader.skipBytes(4); // Skip 4 bytes
	 * reader.skipBytes(); // Skip 1 byte
	 */
	public advanceBytes(bytes: number = 1): number {
		this.offset += bytes;

		return this.offset - bytes;
	}

	/**
	 * Moves the read position to the specified byte offset and bit index.
	 *
	 * @param byteOffset - The byte offset to move to.
	 * @param bitIndex - The bit index within the byte (0-7).
	 * @returns This reader for method chaining.
	 *
	 * @throws {RangeError} If bitIndex is not in range [0, 7].
	 * @throws {RangeError} If byteOffset is negative.
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * reader.move(10); // Move to byte offset 10
	 * reader.move(5, 3); // Move to byte offset 5, bit index 3
	 */
	public move(byteOffset: number = this.offset, bitIndex: number = this.bitIndex): this {
		if (bitIndex < 0 || bitIndex > 7) {
			throw new RangeError(`Bit index ${bitIndex} is out of range [ 0, 7 ]`);
		} else if (byteOffset < 0) {
			throw new RangeError(`Byte offset ${byteOffset} cannot be negative`);
		}

		const deltaByte = byteOffset - this.offset;

		this.advance(deltaByte);

		this.bitOffset = byteOffset;
		this.bitIndex = bitIndex;

		return this;
	}

	/**
	 * Creates a copy of this reader with its own independent state.
	 *
	 * @param reset - If true, the cloned reader starts at offset 0. If false, preserves current position.
	 * @returns A new BufferReader instance.
	 *
	 * @example
	 * // Clone at current position
	 * const reader2 = reader.clone();
	 *
	 * // Clone and reset to beginning
	 * const freshReader = reader.clone(true);
	 */
	public clone(reset: boolean = false): BufferReader {
		const reader = new BufferReader(this.buffer, true);

		if (!reset) {
			reader.bitOffset = this.bitOffset;
			reader.bitIndex = this.bitIndex;
			reader.offset = this.offset;
		}

		return reader;
	}

	/**
	 * Resets the read position and bit state.
	 *
	 * @param offset - The byte offset to reset to.
	 * @returns This reader for method chaining.
	 *
	 * @example
	 * reader.reset(); // Reset to beginning
	 * reader.reset(10); // Reset to offset 10
	 */
	public reset(offset: number = 0): this {
		this.offset = offset;
		this.bitIndex = 0;
		this.bitOffset = 0;

		return this;
	}

	/**
	 * Resets the bit reading state to byte alignment.
	 * Call this after bit operations to resume byte-aligned reading.
	 *
	 * @returns This reader for method chaining.
	 *
	 * @example
	 * reader.readBits(3);
	 * reader.readBits(5);
	 * reader.resetBits(); // Align to next byte boundary
	 * reader.readUint8(); // Now byte-aligned
	 */
	public resetBits(): this {
		this.bitIndex = 0;

		return this;
	}

	/**
	 * Checks if there are enough bytes remaining in the buffer.
	 *
	 * @param bytes - Number of bytes to check for.
	 * @returns True if at least the specified number of bytes remain.
	 *
	 * @example
	 * if (reader.hasSpace(4)) {
	 *     const value = reader.readUint32();
	 * }
	 */
	public hasSpace(bytes: number = 1): boolean {
		return this.remainingBytes >= bytes;
	}

	/**
	 * Returns a visual representation of the buffer with the current read position highlighted.
	 *
	 * @param start - Starting byte index to display.
	 * @param end - Ending byte index to display.
	 * @returns A formatted string showing buffer contents with color-coded position.
	 *
	 * @throws {RangeError} If start is negative or end exceeds buffer length.
	 *
	 * @remarks
	 * - Orange: bytes already read
	 * - Blue: current byte position
	 * - White: unread bytes
	 *
	 * @example
	 * console.log(reader.toString());
	 * // BufferReader {2/10} [0:10]: [01 02 03 04 05 06 07 08 09 0a]
	 */
	public toString(start: number = 0, end: number = this.byteLength): string {
		if (start < 0 || end > this.byteLength) {
			throw new RangeError("Invalid start or end");
		}

		let result = `BufferReader {${this.offset}/${this.byteLength}} [${start}:${end}]: [`;

		for (let i = start; i < end; i++) {
			if (i > start) {
				result += " ";
			}

			const byte = this.buffer[i];
			const hex = byte.toString(16).padStart(2, "0");

			if (i < this.offset) {
				result += `\x1b[33m${hex}\x1b[0m`; // Orange
			} else if (i === this.offset) {
				result += `\x1b[34m${hex}\x1b[0m`; // Blue
			} else {
				result += hex;
			}
		}

		result += "]";

		return result;
	}

	/**
	 * Gets the number of bytes remaining to be read from the current position.
	 *
	 * @returns The number of unread bytes.
	 *
	 * @example
	 * console.log(`${reader.remainingBytes} bytes left`);
	 */
	public get remainingBytes(): number {
		return this.byteLength - this.offset;
	}
}

export { BufferReader };
