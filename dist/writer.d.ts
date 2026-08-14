import { type Buffers, type BufferSlice } from "./buffer.js";
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
export declare class BufferWriter {
    /** The text encoder used for writing UTF-8 encoded strings. */
    static readonly TEXT_ENCODER: TextEncoder;
    /** Whether the buffer can automatically expand when capacity is exceeded. */
    private readonly resizable;
    /** The endianness of the buffer (true for little-endian, false for big-endian). */
    private readonly endianness;
    /** The total length of the buffer in bytes. */
    byteLength: number;
    /** The underlying Uint8Array buffer being written to. */
    buffer: Uint8Array;
    /** The byte offset where bit operations are currently positioned. */
    private bitOffset;
    /** The bit index within the current byte (0-7). */
    private bitIndex;
    /** DataView for efficient typed array access. */
    private view;
    /** The current write position in bytes. */
    offset: number;
    /**
     * Creates a new BufferWriter instance with specified byte length.
     *
     * @param byteLength - Initial buffer size in bytes. Defaults to 0 (auto-resizing).
     * @param resizable - If true, buffer auto-expands when capacity is exceeded. Defaults to true when byteLength is 0 otherwise false.
     * @param littleEndian - If true, uses little-endian byte order. If false, uses big-endian. Defaults to system endianness.
     */
    constructor(byteLength?: number, resizable?: boolean, littleEndian?: boolean);
    /**
     * Creates a new BufferWriter instance from an existing buffer.
     *
     * @param buffer - The buffer to write to. Can be ArrayBuffer, TypedArray, BufferWriter, or BufferReader.
     * @param resizable - If true, buffer auto-expands when capacity is exceeded. Defaults to false.
     * @param littleEndian - If true, uses little-endian byte order. If false, uses big-endian. Defaults to system endianness.
     * @param clone - If true, creates a copy of the buffer. If false, uses the buffer directly. Defaults to false.
     * @param offset - Starting byte offset within the buffer. Defaults to 0.
     */
    constructor(buffer: Buffers, resizable?: boolean, littleEndian?: boolean, clone?: boolean, slice?: {
        readonly start: number;
        readonly byteLength?: number;
    });
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
    constructor(allocation?: number | Buffers, resizable?: boolean, littleEndian?: boolean, clone?: boolean, slice?: {
        readonly start: number;
        readonly byteLength?: number;
    });
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
    static rangeMax(bits: number, signed?: boolean): number;
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
    static rangeMin(bits: number, signed?: boolean): number;
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
    static requiredBits(value: number, signed?: boolean): number;
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
    static toPrecision(value: number, maximum: number, bits: number, signed?: boolean, minimum?: number): number;
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
    static stringByteLength(text: string): number;
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
    static writeTextBuffer(text: string): Uint8Array;
    /**
     * Writes a specified number of bits as an integer.
     * Supports non-byte-aligned writes for space-efficient data encoding.
     *
     * @param value - The integer value to write.
     * @param bits - Number of bits to write (1-53).
     * @param signed - Whether to interpret the value as signed.
     * @param advance - Whether to advance the write position.
     * @returns This writer for method chaining.
     *
     * @throws {RangeError} If bits is not in the range [1, 53].
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
    writeBits(value?: number, bits?: number, signed?: boolean, offset?: number, advance?: boolean): this;
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
    writeBoolean(value?: boolean | number): this;
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
    writeBoolean(value?: boolean | number, byte?: true, offset?: number, advance?: boolean): this;
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
    writeUint8(value?: number, offset?: number, advance?: boolean): this;
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
    writeInt8(value?: number, offset?: number, advance?: boolean): this;
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
    writeUint16(value?: number, offset?: number, advance?: boolean): this;
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
    writeInt16(value?: number, offset?: number, advance?: boolean): this;
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
    writeFloat16(value?: number, offset?: number, advance?: boolean): this;
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
    writeUint32(value?: number, offset?: number, advance?: boolean): this;
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
    writeInt32(value?: number, offset?: number, advance?: boolean): this;
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
    writeFloat32(value?: number, offset?: number, advance?: boolean): this;
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
    writeUint64(value?: bigint, offset?: number, advance?: boolean): this;
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
    writeInt64(value?: bigint, offset?: number, advance?: boolean): this;
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
    writeFloat64(value?: number, offset?: number, advance?: boolean): this;
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
    writeUint(value?: number, offset?: number, advance?: boolean): this;
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
    writeInt(value?: number, offset?: number, advance?: boolean): this;
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
    writeBuffer(buffer: Buffers, writeSize?: boolean, slice?: BufferSlice, offset?: number, advance?: boolean): this;
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
    writeString(text?: string, writeSize?: boolean, offset?: number, advance?: boolean): this;
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
    expand(bytes?: number): number;
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
    shrink(bytes?: number): number;
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
    private ensureCapacity;
    /**
     * Internal method to advance the read position.
     *
     * @param bytes - Number of bytes to advance.
     * @param offset - The reference offset.
     * @param advance - Whether to actually advance.
     * @returns This writer for method chaining.
     */
    private advance;
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
    advanceBits(bits?: number): this;
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
    advanceBytes(bytes?: number): number;
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
    move(byteOffset?: number, bitIndex?: number): this;
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
    clone(reset?: boolean): BufferWriter;
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
    reset(offset?: number): this;
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
    resetBits(): this;
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
    hasSpace(bytes?: number): boolean;
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
    fillOffset(): this;
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
    toString(start?: number, end?: number): string;
    /**
     * Gets the number of bytes remaining to be read from the current position.
     *
     * @returns The number of unread bytes.
     *
     * @example
     * console.log(`${reader.remainingBytes} bytes left`);
     */
    get remainingBytes(): number;
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
    get bytes(): Uint8Array;
}
//# sourceMappingURL=writer.d.ts.map