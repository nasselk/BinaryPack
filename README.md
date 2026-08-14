# BinaryPack

BinaryPack is a small, focused TypeScript library for compact binary packing and unpacking with bit-level control.

It provides two primary classes: [`BufferWriter`](./src/writer.ts) for writing binary data (including bit-level fields, LEB128 varints and strings) and [`BufferReader`](./src/reader.ts) for reading the same formats back. The implementation is purposely low-level and zero-dependency — useful for game networking, custom serialization formats, or any performance-sensitive encoding work.


## Overview

- Bit-level writes and reads (non-byte-aligned fields)
- Typed reads/writes for common primitives (int8/16/32/64, uint8/16/32/64, float16/32/64) with control of the endianness
- Variable-length unsigned integers (LEB128) and zigzag encoding for signed ints
- String and buffer writers (with optional size prefixes)
- Small, strict TypeScript codebase with comprehensive in-code documentation


## Table of contents
- [Installation](#installation)
- [Features](#features)
- [Quick example](#quick-example)
- [API highlights](#api-highlights)
- [Building / running locally](#building--running-locally)
- [Releasing](#releasing)
- [Notes](#notes)
- [License](#license)


## Installation

This package is not on the npm registry — install it straight from GitHub:

```pwsh
npm install github:nasselk/BinaryPack          # tracks the default branch
npm install github:nasselk/BinaryPack#v0.1.0   # pinned to a tag
```

ESM-only, no runtime dependencies. Requires Node.js 20+ (or Bun / any modern bundler).

```ts
import { BufferWriter, BufferReader } from "@nasselk/binarypack";
```


## Features

- [`BufferWriter`](./src/writer.ts): sequential and bit-level writes, automatic expansion (optional), typed set methods and convenience helpers
- [`BufferReader`](./src/reader.ts): sequential and bit-level reads, peeking, buffer/string read helpers and convenience methods
- Precision helpers for encoding floats into a fixed number of bits

## Quick example

Roundtrip: write some values and read them back

```ts
import { BufferWriter, BufferReader } from "@nasselk/binarypack";

// Writer: create a resizable writer and write values
const writer = new BufferWriter();
writer.writeUint16(0x1234);        // write 16-bit value
writer.writeBits(5, 3);            // write 3-bit value (value 5)
writer.writeString("hello", true); // write string with 2-byte length prefix
writer.writeInt(-42);              // zigzag + LEB128 encoded signed integer

// Get written bytes (warns if the writer buffer is not filled and is not resizable; shrink otherwise)
const bytes = writer.bytes;

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
import { BufferWriter, BufferReader } from "@nasselk/binarypack";
// encode float 0..100 into 12 bits
const encoded = BufferWriter.toPrecision(75.5, 100, 12);
const w3 = new BufferWriter();
w3.writeBits(encoded, 12);
const r3 = new BufferReader(w3.buffer.subarray(0, w3.offset));
const decoded = BufferReader.fromPrecision(r3.readBits(12), 100, 12);
console.log(decoded); // ~75.5
```

## API highlights

- [`BufferWriter`](./src/writer.ts) — write methods: `writeInt8/16/32/64` `writeUint8/16/32/64`, `writeFloat32/64/16`, `writeBits`, `writeString`, `writeBuffer`, `writeInt`, `writeUint` (LEB128)
- [`BufferReader`](./src/reader.ts) — read methods: `readUint8/16/32/64`, `readFloat32/64/16`, `readBits`, `readString`, `readBuffer`, `readInt` `readUint` (LEB128)
- Precision helpers: `BufferWriter.toPrecision()` / `BufferReader.fromPrecision()`
- Advancement visualisation: `toString` shows a formatted representation of the buffer reading/writing, taking in account the internal state

Read the inline JSDoc comments in `src/reader.ts` and `src/writer.ts` for more details and parameter options.

## Building / running locally

Requirements: Node.js (v20+ recommended) and npm.

```pwsh
bun install         # install dev dependencies
bun test            # run tests
bun run build       # compile src/ -> dist/ (JS + .d.ts + sourcemaps)
bun run type:check  # type-check without emitting
bun run biome:check # format and lint
```

Note the `bun run` prefix on `build` — plain `bun build` invokes Bun's bundler instead of the package script.

## Releasing

`dist/` is committed to the repository so consumers get a prebuilt package with no install-time build step. That means **the build must be rerun before every push**, or consumers will silently receive stale code:

```pwsh
bun run build
git add -A
git commit -m "..."
git push
```

To cut a pinnable version, bump `version` in `package.json` and tag it:

```pwsh
git tag v0.1.0
git push --tags
```

## Notes

The inline documentation (JSDoc comments) and portions of this README were partially written with AI assistance.

## License

This project is released under the MIT License — see the included `LICENSE` file for details.