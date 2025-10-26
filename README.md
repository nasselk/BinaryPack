# BinaryPack

BinaryPack is a small, focused TypeScript library for compact binary packing and unpacking with bit-level control.

It provides two primary classes: `BufferWriter` for writing binary data (including bit-level fields, LEB128 varints and strings) and `BufferReader` for reading the same formats back. The implementation is purposely low-level and zero-dependency — useful for game networking, custom serialization formats, or any performance-sensitive encoding work.

Highlights
- Bit-level writes and reads (non-byte-aligned fields)
- Typed reads/writes for common primitives (uint8/16/32/64, int, float16/32/64)
- Variable-length integers (LEB128) and zigzag encoding for signed ints
- String and buffer helpers (optional size prefixes)
- Small, strict TypeScript codebase with comprehensive in-code documentation

Table of contents
- Features
- Quick example
- API highlights
- Building / running locally
- License

## Features

- BufferWriter: sequential and bit-level writes, automatic expansion (optional), typed set methods and convenience helpers
- BufferReader: sequential and bit-level reads, peeking, buffer/string read helpers and convenience methods
- Precision helpers for encoding floats into a fixed number of bits
- Utility helpers (clamp) and small, readable implementation

## Quick example

The following examples assume you run directly against the `src` files (no build) using Node.js with ESM enabled, or that you've built the project with `tsc` and import from the compiled output.

Roundtrip: write some values and read them back

```ts
import { BufferWriter } from "./src/writer.js";
import { BufferReader } from "./src/reader.js";

// Writer: create a resizable writer and write values
const writer = new BufferWriter();
writer.writeUint16(0x1234);        // write 16-bit value
writer.writeBits(5, 3);            // write 3-bit value (value 5)
writer.writeString("hello", true); // write string with 2-byte length prefix
writer.writeInt(-42);              // zigzag + LEB128 encoded signed integer

// Get written bytes (throws if the writer buffer is not filled; shrink otherwise)
const bytes = writer.buffer.subarray(0, writer.offset); // slice to used portion

// Reader: read back the same values
const reader = new BufferReader(bytes);
const a = reader.readUint16();     // 0x1234
reader.resetBits();                // align after bit writes if needed
const b = reader.readBits(3);      // 5
const s = reader.readString(true); // "hello"
const n = reader.readInt();        // -42

console.log({ a: a.toString(16), b, s, n });
```

Bit-level fields example

```ts
const w = new BufferWriter();
// Write three fields: 5 bits, 6 bits, and 5 bits
w.writeBits(0b10101, 5);
w.writeBits(0b110110, 6);
w.writeBits(0b01010, 5);

const buf = w.bytes
const r = new BufferReader(buf);
const f1 = r.readBits(5);
const f2 = r.readBits(6);
const f3 = r.readBits(5);
console.log(f1, f2, f3);
```

Variable-length integers (LEB128) example

```ts
const w2 = new BufferWriter();
w2.writeUint(300); // will use 2 bytes
w2.writeInt(-15);  // zigzag encoded
const b2 = w2.buffer.subarray(0, w2.offset);
const r2 = new BufferReader(b2);
console.log(r2.readUint(), r2.readInt()); // 300, -15
```

Precision example (encode a float into fixed bits)

```ts
import { BufferWriter } from "./src/writer.js";
import { BufferReader } from "./src/reader.js";
// encode float 0..100 into 12 bits
const encoded = BufferWriter.toPrecision(75.5, 100, 12);
const w3 = new BufferWriter();
w3.writeBits(encoded, 12);
const r3 = new BufferReader(w3.buffer.subarray(0, w3.offset));
const decoded = BufferReader.fromPrecision(r3.readBits(12), 100, 12);
console.log(decoded); // ~75.5
```

## API highlights

- `BufferWriter` — write methods: `writeUint8/16/32/64`, `writeInt`, `writeFloat32/64/16`, `writeBits`, `writeString`, `writeBuffer`, `writeUint` (varint)
- `BufferReader` — read methods: `readUint8/16/32/64`, `readInt`, `readFloat32/64/16`, `readBits`, `readString`, `readBuffer`, `readUint` (varint)
- Precision helpers: `BufferWriter.toPrecision()` / `BufferReader.fromPrecision()`

Read the inline JSDoc comments in `src/reader.ts` and `src/writer.ts` for more details and parameter options.

## Building / running locally

Requirements: Node.js (v20+ recommended) and npm.

1. Install dev dependencies (optional, for formatting/type checks):

```pwsh
npm install
```

2. Type-check or compile (TypeScript):

```pwsh
npx tsc --project tsconfig.json
```

3. Run examples directly with Node (if using ESM and TypeScript is compiled to JS), or run with ts-node / bun if you prefer.

## Contributing

Contributions are welcome. Please add tests for new functionality and follow TypeScript strictness. Keep APIs stable; add breaking changes only with major version bumps.

## License

This project is released under the MIT License — see the included `LICENSE` file for details.