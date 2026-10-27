import { endianness, createBuffer, type Buffers, type BufferSlice } from "./buffer.js";
import { setFloat16, setFloat32, setFloat64 } from "./bytes.js";
import { clamp, SIGNED_MAX, SIGNED_MIN, UNSIGNED_MAX, utf8Write } from "./utils.js";

/**
 * A binary buffer writer for efficient sequential writing of various data types.
 * Supports both byte-aligned and bit-level writing operations with automatic offset tracking and optional auto-resizing.
 *
 * @remarks
 * This class provides a comprehensive API for writing binary data including:
 * - Primitive types (int8/16/32/64, uint8/16/32/64, float16/32/64)
 * - Bit-level operations for space-efficient data encoding
 * - Variable-length integers (LEB128)
 * - Text strings with optional size prefixes
 * - Raw buffer writing
 * - Automatic buffer expansion (when resizable)
 *
 * @see {@link BufferReader} for the companion reader class
 *
 * @example
 * // Create auto-resizing writer
 * const writer = new BufferWriter();
 * writer.writeUint8(255);
 * writer.writeUint16(1000);
 *
 * // Create fixed-size writer
 * const fixedWriter = new BufferWriter(100, false);
 */
export class BufferWriter {
	/** The text encoder used for writing UTF-8 encoded strings. */
	public static readonly TEXT_ENCODER = new TextEncoder();

	/** Whether the buffer can automatically expand when capacity is exceeded. */
	public readonly resizable: boolean;

	/** The total length of the buffer in bytes. */
	public byteLength: number;

	/** The underlying Uint8Array buffer being written to. */
	public buffer: Uint8Array;

	/** The byte offset where bit operations are currently positioned. */
	public bitOffset: number;

	/** The bit index within the current byte (0-7). */
	public bitIndex: number;

	/** DataView used only for 64-bit integers, created on first use. */
	private lazyView?: DataView;

	/** The current write position in bytes. */
	public offset: number;

	/** The furthest byte written before the position last moved backwards. `length` combines it with `offset`. */
	private furthest: number;

	/** The endianness of the buffer (true for little-endian, false for big-endian). */
	private readonly endianness: boolean;

	/**
	 * Creates a new BufferWriter instance with specified byte length.
	 *
	 * @param byteLength - Initial buffer size in bytes. Defaults to 0 (auto-resizing).
	 * @param resizable - If true, buffer auto-expands when capacity is exceeded. Defaults to true when byteLength is 0 otherwise false.
	 * @param littleEndian - If true, uses little-endian byte order. If false, uses big-endian. Defaults to system endianness.
	 */
	public constructor(byteLength?: number, resizable?: boolean, littleEndian?: boolean);

	/**
	 * Creates a new BufferWriter instance from an existing buffer.
	 *
	 * @param buffer - The buffer to write to. Can be ArrayBuffer, TypedArray, BufferWriter, or BufferReader.
	 * @param resizable - If true, buffer auto-expands when capacity is exceeded. Defaults to false.
	 * @param littleEndian - If true, uses little-endian byte order. If false, uses big-endian. Defaults to system endianness.
	 * @param clone - If true, creates a copy of the buffer. If false, uses the buffer directly. Defaults to false.
	 * @param offset - Starting byte offset within the buffer. Defaults to 0.
	 */
	public constructor(buffer: Buffers, resizable?: boolean, littleEndian?: boolean, clone?: boolean, slice?: { readonly start: number; readonly byteLength?: number });

	/**
	 * Creates a new BufferWriter instance.
	 *
	 * @param allocation - Initial size in bytes or an existing buffer. Defaults to 0 (auto-resizing).
	 * @param resizable - If true, buffer auto-expands when capacity is exceeded. Defaults to true when allocation is 0.
	 * @param littleEndian - If true, uses little-endian byte order. If false, uses big-endian.
	 * @param clone - If true, creates a copy of the buffer. If false, uses the buffer directly.
	 * @param offset - Starting byte offset within the buffer.
	 *
	 * @example
	 * // Create auto-resizing writer (starts at 0 bytes)
	 * const writer = new BufferWriter();
	 *
	 * // Create fixed 100-byte buffer
	 * const fixed = new BufferWriter(100, false);
	 *
	 * // Create from existing buffer
	 * const fromBuffer = new BufferWriter(existingBuffer, true, true);
	 */
	public constructor(allocation?: number | Buffers, resizable?: boolean, littleEndian?: boolean, clone?: boolean, slice?: { readonly start: number; readonly byteLength?: number });

	public constructor(allocation: number | Buffers = 0, resizable: boolean = allocation === 0, littleEndian: boolean = endianness, clone: boolean = false, slice?: { readonly start: number; readonly byteLength?: number }) {
		this.buffer = createBuffer(allocation, clone, slice);

		this.byteLength = this.buffer.byteLength;
		this.endianness = littleEndian;
		this.resizable = resizable;
		this.bitOffset = 0;
		this.bitIndex = 0;
		this.offset = 0;
		this.furthest = 0;
	}

	/**
	 * Calculates the maximum value that can be represented with the given number of bits.
	 *
	 * @param bits - Number of bits (1-53).
	 * @param signed - Whether the value is signed.
	 * @returns The maximum value representable.
	 *
	 * @throws {RangeError} If bits is not in the range [1, 53].
	 *
	 * @example
	 * BufferWriter.rangeMax(8, false); // 255
	 * BufferWriter.rangeMax(8, true);  // 127
	 * BufferWriter.rangeMax(16, false); // 65535
	 */
	public static rangeMax(bits: number, signed: boolean = false): number {
		if (bits < 1 || bits > 53) {
			throw new RangeError(`Invalid bits ${bits} in [ 1, 53 ]`);
		}

		if (signed) {
			return 2 ** (bits - 1) - 1;
		} else {
			return 2 ** bits - 1;
		}
	}

	/**
	 * Calculates the minimum value that can be represented with the given number of bits.
	 *
	 * @param bits - Number of bits (1-53).
	 * @param signed - Whether the value is signed.
	 * @returns The minimum value representable.
	 *
	 * @throws {RangeError} If bits is not in the range [1, 53].
	 *
	 * @example
	 * BufferWriter.rangeMin(8, false); // 0
	 * BufferWriter.rangeMin(8, true);  // -128
	 * BufferWriter.rangeMin(16, true); // -32768
	 */
	public static rangeMin(bits: number, signed: boolean = false): number {
		if (bits < 1 || bits > 53) {
			throw new RangeError(`Invalid bits ${bits} in [ 1, 53 ]`);
		}

		if (signed) {
			return -(2 ** (bits - 1));
		} else {
			return 0;
		}
	}

	/**
	 * Calculates the number of bits required to represent a given integer value.
	 *
	 * @param value - The integer value to evaluate.
	 * @param signed - Whether the value is signed.
	 * @returns The number of bits required to represent the value.
	 *
	 * @example
	 * BufferWriter.requiredBits(100); // 7
	 * BufferWriter.requiredBits(-100, true); // 7
	 */
	public static requiredBits(value: number, signed: boolean = false): number {
		if (signed) {
			return Math.ceil(Math.log2(Math.abs(value) + 1));
		} else {
			return Math.ceil(Math.log2(value + 1));
		}
	}

	/**
	 * Encodes a floating-point value into a fixed number of bits with specified precision.
	 * This is the inverse operation of BufferReader.fromPrecision().
	 *
	 * @param value - The floating-point value to encode.
	 * @param maximum - The maximum value of the range.
	 * @param bits - The number of bits to use for encoding.
	 * @param signed - Whether the value is signed.
	 * @param minimum - The minimum value of the range.
	 * @returns The encoded integer value ready to be written.
	 *
	 * @remarks
	 * Values outside the [minimum, maximum] range are automatically clamped.
	 *
	 * @example
	 * // Encode a value in range [0, 100] using 12 bits
	 * const encoded = BufferWriter.toPrecision(75.5, 100, 12);
	 * writer.writeBits(encoded, 12);
	 *
	 * // Encode signed value in range [-50, 50] using 10 bits
	 * const signedEncoded = BufferWriter.toPrecision(-25, 50, 10, true);
	 */
	public static toPrecision(value: number, maximum: number, bits: number, signed: boolean = false, minimum: number = signed ? -maximum : 0): number {
		if (maximum === minimum) return 0;

		const bound = BufferWriter.rangeMax(bits, signed);

		if (value < minimum || value > maximum) {
			value = clamp(value, minimum, maximum);
		}

		return Math.round(((value - minimum) / (maximum - minimum)) * bound);
	}

	/**
	 * Calculates the byte length of a UTF-8 encoded string.
	 *
	 * @param text - The string to measure.
	 * @returns The number of bytes required to encode the string.
	 *
	 * @example
	 * BufferWriter.stringByteLength("Hello"); // 5
	 * BufferWriter.stringByteLength("Hello 🌍"); // 10 (emoji is 4 bytes)
	 */
	public static stringByteLength(text: string): number {
		let bytes = 0;

		for (let i = 0; i < text.length; i++) {
			const code = text.charCodeAt(i);

			if (code < 0x80) {
				bytes += 1;
			} else if (code < 0x800) {
				bytes += 2;
			} else if (code >= 0xd800 && code <= 0xdbff && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
				bytes += 4;
				i++;
			} else {
				bytes += 3;
			}
		}

		return bytes;
	}

	/**
	 * Encodes a string to a UTF-8 Uint8Array buffer.
	 *
	 * @param text - The string to encode.
	 * @returns A Uint8Array containing the UTF-8 encoded bytes.
	 *
	 * @example
	 * const buffer = BufferWriter.writeTextBuffer("Hello");
	 * // Uint8Array(5) [72, 101, 108, 108, 111]
	 */
	public static writeTextBuffer(text: string): Uint8Array {
		const buffer = BufferWriter.TEXT_ENCODER.encode(text);

		return buffer;
	}

	/**
	 * Writes a specified number of bits as an integer.
	 * Supports non-byte-aligned writes for space-efficient data encoding.
	 *
	 * @param value - The integer value to write.
	 * @param bits - Number of bits to write (1-32).
	 * @param signed - Whether to interpret the value as signed.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If bits is not in the range [1, 32].
	 * @throws {RangeError} If value is outside the valid range for the specified number of bits.
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * // Write a 3-bit value (0-7)
	 * writer.writeBits(5, 3);
	 *
	 * // Write a 12-bit signed value
	 * writer.writeBits(-500, 12, true);
	 *
	 * // Write without advancing (for peeking)
	 * writer.writeBits(7, 5, false, false);
	 */
	public writeBits(value: number = 0, bits: number = 1, signed: boolean = false, offset?: number, advance: boolean = true): this {
		offset = (offset ?? this.bitOffset) | 0;

		if (bits < 1 || bits > 32) {
			throw new RangeError("Bits must be in the range [1, 32]");
		}

		const min = signed ? SIGNED_MIN[bits] : 0;
		const max = signed ? SIGNED_MAX[bits] : UNSIGNED_MAX[bits];

		if (value < min || value > max) {
			throw new RangeError(`Value ${value} is out of range for ${bits} bits [ ${min}, ${max} ]`);
		}

		if (signed) {
			value -= min;
		}

		let byteOffset = this.offset;
		let bitOffset = offset;
		let bitIndex = this.bitIndex;

		if (offset !== this.bitOffset) {
			if (advance) {
				this.bitIndex = 0;
			}

			bitIndex = 0;
		}

		// Shortcut 1: the value fits in the bits left in the current byte (no new byte, no capacity check, no loop)
		if (bitIndex !== 0 && bitIndex + bits <= 8) {
			this.buffer[bitOffset] |= value << bitIndex;

			if (advance) {
				this.bitIndex = (bitIndex + bits) & 7;

				if (this.bitIndex === 0) {
					this.bitOffset = this.offset; // byte is full: the next bits start a new one
				}
			}

			return this;
		}

		// Shortcut 2: no partial byte, and the value fits in one new byte
		if (bitIndex === 0 && bits <= 8) {
			this.ensureCapacity(1, byteOffset);
			this.buffer[byteOffset] = value;

			if (advance) {
				this.offset = byteOffset + 1;
				this.bitIndex = bits & 7;
				this.bitOffset = this.bitIndex === 0 ? byteOffset + 1 : byteOffset;
			} else {
				this.furthest = Math.max(this.furthest, byteOffset + 1);
			}

			return this;
		}

		// General case: spans several bytes (unchanged)
		const spare = bitIndex === 0 ? 0 : 8 - bitIndex;

		this.ensureCapacity(Math.ceil(Math.max(0, bits - spare) / 8), byteOffset);

		while (bits > 0) {
			if (bitIndex === 0) {
				bitOffset = byteOffset;
				byteOffset++;
			}

			const bitsToWrite = Math.min(bits, 8 - bitIndex);
			const bitsValue = value & ((1 << bitsToWrite) - 1);

			if (bitIndex === 0 && bitsToWrite === 8) {
				this.buffer[bitOffset] = bitsValue;
			} else {
				this.buffer[bitOffset] = (bitIndex === 0 ? 0 : this.buffer[bitOffset]) | (bitsValue << bitIndex);
			}

			value >>>= bitsToWrite;
			bits -= bitsToWrite;
			bitIndex = (bitIndex + bitsToWrite) & 7;
		}

		if (advance) {
			this.offset = byteOffset;
			this.bitOffset = bitIndex === 0 ? byteOffset : bitOffset;
			this.bitIndex = bitIndex;
		} else {
			this.furthest = Math.max(this.furthest, byteOffset);
		}

		return this;
	}

	/**
	 * Writes a boolean value, optionally as a full byte.
	 *
	 * @param value - The boolean or numeric value to write (0 = false, non-zero = true).
	 * @returns This writer for method chaining.
	 *
	 * @example
	 * // Write as single bit
	 * writer.writeBoolean(true);
	 */
	public writeBoolean(value?: boolean | number): this;

	/**
	 * Writes a boolean value, optionally as a full byte.
	 *
	 * @param value - The boolean or numeric value to write (0 = false, non-zero = true).
	 * @param byte - If true, writes a full byte instead of a single bit.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * // Write as full byte
	 * writer.writeBoolean(true, true);
	 *
	 * // Write at specific offset
	 * writer.writeBoolean(false, true, 10);
	 */
	public writeBoolean(value?: boolean | number, byte?: true, offset?: number, advance?: boolean): this;

	public writeBoolean(value: boolean | number = false, byte: boolean = false, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		value = +value; // To number

		if (byte) {
			return this.writeUint8(value ? 1 : 0, offset, advance);
		} else {
			const bitIndex = this.bitIndex;
			const commit = advance ?? true;

			if (bitIndex === 0) {
				// Start a fresh byte at the write cursor (writeBits overwrites rather than ORs here)
				const target = this.offset;

				this.ensureCapacity(1);

				this.buffer[target] = value;

				if (commit) {
					this.bitOffset = target;
					this.offset = target + 1;
					this.bitIndex = 1;
				} else {
					this.furthest = Math.max(this.furthest, target + 1);
				}
			} else {
				this.buffer[this.bitOffset] |= value << bitIndex;

				if (commit) {
					this.bitIndex = (bitIndex + 1) & 7;
				}
			}

			return this;
		}
	}

	/**
	 * Writes an unsigned 8-bit integer (0 to 255).
	 *
	 * @param value - The unsigned 8-bit integer value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeUint8(255); // Write max uint8
	 * writer.writeUint8(100, 10); // Write at offset 10
	 */
	public writeUint8(value: number = 0, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(1, offset, advance);

		this.buffer[offset] = value;

		return this;
	}

	/**
	 * Writes a signed 8-bit integer (-128 to 127).
	 *
	 * @param value - The signed 8-bit integer value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeInt8(-128); // Write min int8
	 * writer.writeInt8(127); // Write max int8
	 */
	public writeInt8(value: number = 0, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(1, offset, advance);

		this.buffer[offset] = value;

		return this;
	}

	/**
	 * Writes an unsigned 16-bit integer (0 to 65535).
	 *
	 * @param value - The unsigned 16-bit integer value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeUint16(65535); // Write max uint16
	 */
	public writeUint16(value: number = 0, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(2, offset, advance);

		this.uint16(offset, value);

		return this;
	}

	/**
	 * Writes a signed 16-bit integer (-32768 to 32767).
	 *
	 * @param value - The signed 16-bit integer value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeInt16(-32768); // Write min int16
	 * writer.writeInt16(32767); // Write max int16
	 */
	public writeInt16(value: number = 0, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(2, offset, advance);

		this.uint16(offset, value);

		return this;
	}

	/**
	 * Writes a 16-bit floating-point number (half-precision float).
	 *
	 * @param value - The 16-bit floating-point value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeFloat16(3.14);
	 */
	public writeFloat16(value: number = 0, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(2, offset, advance);

		setFloat16(this.buffer, offset, value, this.endianness);

		return this;
	}

	/**
	 * Writes an unsigned 32-bit integer (0 to 4294967295).
	 *
	 * @param value - The unsigned 32-bit integer value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeUint32(4294967295); // Write max uint32
	 */
	public writeUint32(value: number = 0, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(4, offset, advance);

		this.uint32(offset, value);

		return this;
	}

	/**
	 * Writes a signed 32-bit integer (-2147483648 to 2147483647).
	 *
	 * @param value - The signed 32-bit integer value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeInt32(-2147483648); // Write min int32
	 */
	public writeInt32(value: number = 0, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(4, offset, advance);

		this.uint32(offset, value);

		return this;
	}

	/**
	 * Writes a 32-bit floating-point number (single-precision float).
	 *
	 * @param value - The 32-bit floating-point value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeFloat32(3.14159); // IEEE 754 single precision
	 */
	public writeFloat32(value: number = 0, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(4, offset, advance);

		setFloat32(this.buffer, offset, value, this.endianness);

		return this;
	}

	/**
	 * Writes an unsigned 64-bit integer as a BigInt (0 to 2^64-1).
	 *
	 * @param value - The unsigned 64-bit BigInt value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeUint64(9007199254740991n); // Write BigInt
	 */
	public writeUint64(value: bigint = 0n, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(8, offset, advance);

		this.view.setBigUint64(offset, value, this.endianness);

		return this;
	}

	/**
	 * Writes a signed 64-bit integer as a BigInt (-2^63 to 2^63-1).
	 *
	 * @param value - The signed 64-bit BigInt value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeInt64(-9007199254740991n); // Write signed BigInt
	 */
	public writeInt64(value: bigint = 0n, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(8, offset, advance);

		this.view.setBigInt64(offset, value, this.endianness);

		return this;
	}

	/**
	 * Writes a 64-bit floating-point number (double-precision float).
	 *
	 * @param value - The 64-bit floating-point value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.writeFloat64(Math.PI); // IEEE 754 double precision
	 */
	public writeFloat64(value: number = 0, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		this.advance(8, offset, advance);

		setFloat64(this.buffer, offset, value, this.endianness);

		return this;
	}

	/**
	 * Writes a variable-length unsigned integer using LEB128 encoding (Little Endian Base 128).
	 * More space-efficient for small numbers as it uses 1 byte per 7 bits.
	 *
	 * @param value - The integer value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @remarks
	 * Each byte stores 7 bits of data and 1 continuation bit.
	 * Small values use fewer bytes (e.g., values < 128 use only 1 byte).
	 *
	 * @example
	 * writer.writeUint(100); // Uses 1 byte
	 * writer.writeUint(10000); // Uses 2 bytes
	 */
	public writeUint(value: number = 0, offset?: number, advance: boolean = true): this {
		offset = (offset ?? this.offset) | 0;

		// Ensure enough space before writing to avoid multiple expansions
		if (this.resizable) {
			const bitsNeeded = value === 0 ? 1 : 32 - Math.clz32(value);
			const bytesNeeded = Math.ceil(bitsNeeded / 7);

			this.ensureCapacity(bytesNeeded, offset);
		}

		while (value >= 0x80) {
			this.writeUint8((value & 0x7f) | 0x80, offset, false);
			value >>>= 7;
			offset++;
		}

		this.writeUint8(value & 0x7f, offset, false);
		offset++;

		if (advance) {
			this.offset = offset;
		}

		return this;
	}

	/**
	 * Writes a variable-length integer using LEB128 encoding with zigzag transformation.
	 * More space-efficient for small numbers as it uses 1 byte per 7 bits.
	 *
	 * @param value - The integer value to write.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 * @remarks
	 * Uses zigzag encoding to map signed integers to unsigned:
	 * - 0 → 0, -1 → 1, 1 → 2, -2 → 3, 2 → 4, etc.
	 * Then encodes with LEB128.
	 *
	 * @example
	 * writer.writeInt(-1);    // Uses 1 byte
	 * writer.writeInt(-100);  // Uses 2 bytes
	 * writer.writeInt(10000); // Uses 2 bytes
	 */
	public writeInt(value: number = 0, offset?: number, advance: boolean = true): this {
		offset = (offset ?? this.offset) | 0;

		const zigzag = value >= 0 ? value * 2 : -value * 2 - 1;

		return this.writeUint(zigzag, offset, advance);
	}

	/**
	 * Writes a buffer of bytes to the current position.
	 *
	 * @param buffer - The buffer to write. Can be any buffer type.
	 * @param writeSize - If true, writes a uint16 size prefix before the buffer data.
	 * @param slice - Optional byte range of the source to write. Defaults to the whole buffer.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If the slice falls outside the source buffer, or if buffer overflow occurs and the buffer is not resizable.
	 *
	 * @example
	 * // Write buffer without size prefix
	 * writer.writeBuffer(new Uint8Array([1, 2, 3]));
	 *
	 * // Write buffer with 2-byte size prefix
	 * writer.writeBuffer(new Uint8Array([1, 2, 3]), true);
	 *
	 * // Write only 3 bytes, starting at byte 2 of the source
	 * writer.writeBuffer(data, false, { start: 2, byteLength: 3 });
	 *
	 * // Write everything from byte 4 onwards
	 * writer.writeBuffer(data, false, { start: 4 });
	 */
	public writeBuffer(buffer: Buffers, writeSize: boolean = false, slice?: BufferSlice, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;

		// Normalises to a byte view, so multi-byte element types are copied as raw bytes and the slice is applied
		const source = createBuffer(buffer, false, slice);
		const length = source.byteLength;

		if (writeSize) {
			this.writeUint16(length, offset, advance);

			offset += 2;
		}

		this.advance(length, offset, advance);

		this.buffer.set(source, offset);

		return this;
	}

	/**
	 * Writes a UTF-8 encoded text string to the buffer.
	 *
	 * @param text - The string to write.
	 * @param writeSize - If true, writes a uint16 size prefix before the text data. Defaults to true.
	 * @param offset - The byte offset to write to.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs (when buffer is not resizable or text doesn't fit).
	 *
	 * @example
	 * // Write string without size prefix
	 * writer.writeString("Hello");
	 *
	 * // Write string with 2-byte length prefix
	 * writer.writeString("Hello", true);
	 */
	public writeString(text: string = "", writeSize: boolean = true, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;
		advance ??= offset === this.offset;

		const start = writeSize ? offset + 2 : offset;

		// Worst case: 3 bytes per character. Grow once instead of encoding the string just to measure it.
		if (start + text.length * 3 > this.byteLength) {
			const exact = BufferWriter.stringByteLength(text);

			if (start + exact > this.byteLength) {
				if (!this.resizable) {
					throw new RangeError("Buffer overflow");
				}

				this.expand(Math.max(start + exact - this.byteLength, this.byteLength));
			}
		}

		const written = utf8Write ? utf8Write.call(this.buffer, text, start) : BufferWriter.TEXT_ENCODER.encodeInto(text, this.buffer.subarray(start)).written;

		if (writeSize) {
			if (written > 65535) {
				throw new RangeError(`String of ${written} bytes doesn't fit in a 2-byte size prefix`);
			}

			this.uint16(offset, written);
		}

		if (!advance || offset !== this.offset) {
			this.furthest = Math.max(this.furthest, start + written);
		}

		if (advance) {
			this.advanceBytes(start + written - this.offset);
		}

		return this;
	}

	/**
	 * Expands the buffer by the specified number of bytes.
	 * Copies existing data to the new larger buffer.
	 *
	 * @param bytes - Number of bytes to add to the buffer.
	 * @returns The new buffer length.
	 *
	 * @example
	 * const oldSize = writer.byteLength;
	 * writer.expand(100); // Add 100 bytes
	 * console.log(writer.byteLength); // oldSize + 100
	 */
	public expand(bytes: number = 1): number {
		const buffer = this.buffer;

		this.buffer = createBuffer(this.byteLength + bytes);
		this.lazyView = undefined;
		this.byteLength = this.buffer.byteLength;

		this.buffer.set(buffer);

		return this.byteLength;
	}

	/**
	 * Shrinks the buffer by the specified number of bytes.
	 * By default, removes unused bytes from the end.
	 *
	 * @param bytes - Number of bytes to remove. Defaults to all unused bytes (byteLength - offset).
	 * @returns The new buffer length.
	 *
	 * @example
	 * writer.shrink(50); // Remove 50 bytes from end
	 * writer.shrink(); // Remove all unused bytes after current offset
	 */
	public shrink(bytes: number = this.byteLength - this.offset): number {
		this.buffer = new Uint8Array(this.buffer.buffer, this.buffer.byteOffset, this.byteLength - bytes);
		this.lazyView = undefined;
		this.byteLength = this.buffer.byteLength;

		this.offset = Math.min(this.offset, this.byteLength);
		this.furthest = Math.min(this.furthest, this.byteLength);

		return this.byteLength;
	}

	/**
	 * Internal method to ensure the buffer has enough capacity.
	 * Automatically expands the buffer if resizable and capacity is exceeded.
	 *
	 * @param bytes - Number of bytes needed.
	 * @param offset - The reference offset.
	 * @param advance - Whether to advance the write position.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 */
	private ensureCapacity(bytes: number, offset?: number): this {
		offset = (offset ?? this.offset) | 0;

		if (offset + bytes > this.byteLength) {
			if (this.resizable) {
				const required = offset + bytes;
				const target = Math.max(required, this.byteLength * 2, 32);

				this.expand(target - this.byteLength);
			} else {
				throw new RangeError(`Buffer overflow ${offset + bytes} ${this.byteLength}`);
			}
		} else if (offset < 0) {
			throw new RangeError(`Cannot write at offset ${offset}, offset must be positive`);
		}

		return this;
	}

	/**
	 * Internal method to advance the read position.
	 *
	 * @param bytes - Number of bytes to advance.
	 * @param offset - The reference offset.
	 * @param advance - Whether to actually advance.
	 * @returns This writer for method chaining.
	 */
	/** The DataView over the buffer, created the first time a 64-bit integer is written. */
	private get view(): DataView {
		this.lazyView ??= new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);

		return this.lazyView;
	}

	/**
	 * Writes the low 16 bits of a number as 2 bytes in this writer's byte order.
	 * A Uint8Array keeps only the low 8 bits of each assigned value, which matches how DataView wraps.
	 */
	private uint16(offset: number, value: number): void {
		const b = this.buffer;

		if (this.endianness) {
			b[offset] = value;
			b[offset + 1] = value >>> 8;
		} else {
			b[offset] = value >>> 8;
			b[offset + 1] = value;
		}
	}

	/** Writes the low 32 bits of a number as 4 bytes in this writer's byte order. */
	private uint32(offset: number, value: number): void {
		const b = this.buffer;

		if (this.endianness) {
			b[offset] = value;
			b[offset + 1] = value >>> 8;
			b[offset + 2] = value >>> 16;
			b[offset + 3] = value >>> 24;
		} else {
			b[offset] = value >>> 24;
			b[offset + 1] = value >>> 16;
			b[offset + 2] = value >>> 8;
			b[offset + 3] = value;
		}
	}

	private advance(bytes: number = 1, offset?: number, advance?: boolean): this {
		offset = (offset ?? this.offset) | 0;
		advance ??= offset === this.offset;

		this.ensureCapacity(bytes, offset);

		if (offset !== this.offset) {
			this.furthest = Math.max(this.furthest, offset + bytes);
		}

		if (advance) {
			this.advanceBytes(bytes);
		}

		return this;
	}

	/**
	 * Advances the write position by the specified number of bits without writing data.
	 * Handles bit-level skipping and byte boundary transitions.
	 *
	 * @param bits - Number of bits to skip.
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
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
	 * Advances the write position by the specified number of bytes without writing data.
	 *
	 * @param bytes - Number of bytes to skip.
	 * @returns The offset before skipping.
	 *
	 * @example
	 * const oldOffset = writer.skipBytes(4); // Skip 4 bytes
	 * writer.skipBytes(); // Skip 1 byte
	 */
	public advanceBytes(bytes: number = 1): number {
		this.offset += bytes;

		if (this.bitIndex === 0) {
			this.bitOffset = this.offset;
		}

		return this.offset - bytes;
	}

	/**
	 * Moves the write position to the specified byte offset and bit index.
	 *
	 * @param byteOffset - The byte offset to move to.
	 * @param bitIndex - The bit index within the byte (0-7).
	 * @returns This writer for method chaining.
	 *
	 * @throws {RangeError} If bitIndex is not in range [0, 7].
	 * @throws {RangeError} If byteOffset is negative.
	 * @throws {RangeError} If buffer overflow occurs and buffer is not resizable.
	 *
	 * @example
	 * writer.move(10); // Move to byte offset 10
	 * writer.move(5, 3); // Move to byte offset 5, bit index 3
	 */
	public move(byteOffset: number = this.offset, bitIndex: number = this.bitIndex): this {
		if (bitIndex < 0 || bitIndex > 7) {
			throw new RangeError(`Bit index ${bitIndex} is out of range [ 0, 7 ]`);
		} else if (byteOffset < 0) {
			throw new RangeError(`Byte offset ${byteOffset} cannot be negative`);
		}

		this.furthest = Math.max(this.furthest, this.offset);

		const deltaByte = byteOffset - this.offset;

		this.advance(deltaByte);

		this.bitOffset = byteOffset;
		this.bitIndex = bitIndex;

		return this;
	}

	/**
	 * Creates a copy of this writer with its own independent state.
	 *
	 * @param reset - If true, the cloned writer starts at offset 0. If false, preserves current position.
	 * @returns A new BufferWriter instance.
	 *
	 * @example
	 * // Clone at current position
	 * const writer2 = writer.clone();
	 *
	 * // Clone and reset to beginning
	 * const freshWriter = writer.clone(true);
	 */
	public clone(reset: boolean = false): BufferWriter {
		const writer = new BufferWriter(this, this.resizable, this.endianness, true);

		if (!reset) {
			writer.bitOffset = this.bitOffset;
			writer.bitIndex = this.bitIndex;
			writer.offset = this.offset;
			writer.furthest = this.furthest;
		}

		return writer;
	}

	/**
	 * Resets the write position and bit state.
	 *
	 * @param offset - The byte offset to reset to.
	 * @returns This writer for method chaining.
	 *
	 * @example
	 * writer.reset(); // Reset to beginning
	 * writer.reset(10); // Reset to offset 10
	 */
	public reset(offset: number = 0): this {
		this.furthest = Math.max(this.furthest, this.offset); // remember how far we got before jumping back
		this.offset = offset;
		this.bitOffset = offset;
		this.bitIndex = 0;

		return this;
	}

	/**
	 * Resets the bit writing state to byte alignment.
	 * Call this after bit operations to resume byte-aligned writing.
	 *
	 * @returns This writer for method chaining.
	 *
	 * @example
	 * writer.writeBits(5, 3);
	 * writer.writeBits(7, 5);
	 * writer.resetBits(); // Align to next byte boundary
	 * writer.writeUint8(255); // Now byte-aligned
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
	 * if (writer.hasSpace(4)) {
	 *     writer.writeUint32(12345);
	 * }
	 */
	public hasSpace(bytes: number = 1): boolean {
		return this.remainingBytes >= bytes;
	}

	/**
	 * Sets the write offset to the end of the buffer.
	 * Useful for appending data to a partially filled buffer.
	 *
	 * @returns This writer for method chaining.
	 *
	 * @example
	 * writer.fillOffset(); // Move offset to end
	 * writer.writeUint8(255); // Append at the end
	 */
	public fillOffset(): this {
		this.offset = this.length;

		return this;
	}

	/**
	 * Returns a visual representation of the buffer with the current write position highlighted.
	 *
	 * @param start - Starting byte index to display.
	 * @param end - Ending byte index to display.
	 * @returns A formatted string showing buffer contents with color-coded position.
	 *
	 * @throws {RangeError} If start is negative or end exceeds buffer length.
	 *
	 * @remarks
	 * - Orange: bytes already written
	 * - Blue: current byte position
	 * - White: unwritten bytes
	 *
	 * @example
	 * console.log(writer.toString());
	 * // BufferWriter {2/10} [0:10]: [01 02 00 00 00 00 00 00 00 00]
	 */
	public toString(start: number = 0, end: number = this.byteLength): string {
		if (start < 0 || end > this.byteLength) {
			throw new RangeError("Invalid start or end");
		}

		let result = `BufferWriter {${this.offset}/${this.byteLength}} [${start}:${end}]: [`;

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

	public get length(): number {
		return Math.max(this.furthest, this.offset);
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

	/**
	 * Gets the filled portion of the buffer as a Uint8Array.
	 *
	 * @returns The underlying buffer.
	 *
	 * @remarks
	 * If the buffer is not filled, a warning is logged.
	 *
	 * @example
	 * const data = writer.bytes;
	 */
	public get bytes(): Uint8Array {
		if (this.length < this.byteLength) {
			if (this.resizable) {
				return this.buffer.subarray(0, this.length);
			} else {
				console.warn("Buffer Writer", `Buffer is not filled: ${this.length}/${this.byteLength}`);
			}
		}

		return this.buffer;
	}
}
