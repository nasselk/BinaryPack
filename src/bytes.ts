// Shared scratch space for converting floats to and from bytes without a DataView.
// These are created once when the module loads and reused by every reader and writer.
const F16 = new Float16Array(1);
const F16B = new Uint8Array(F16.buffer);
const F32 = new Float32Array(1);
const F32B = new Uint8Array(F32.buffer);
const F64 = new Float64Array(1);
const F64B = new Uint8Array(F64.buffer);

/** True when the machine stores numbers in little-endian order (practically all hardware). */
export const NATIVE_LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export function getFloat16(buffer: Uint8Array, offset: number, littleEndian: boolean): number {
	if (littleEndian === NATIVE_LE) {
		F16B[0] = buffer[offset];
		F16B[1] = buffer[offset + 1];
	} else {
		F16B[0] = buffer[offset + 1];
		F16B[1] = buffer[offset];
	}

	return F16[0];
}

export function setFloat16(buffer: Uint8Array, offset: number, value: number, littleEndian: boolean): void {
	F16[0] = value;

	if (littleEndian === NATIVE_LE) {
		buffer[offset] = F16B[0];
		buffer[offset + 1] = F16B[1];
	} else {
		buffer[offset] = F16B[1];
		buffer[offset + 1] = F16B[0];
	}
}

export function getFloat32(buffer: Uint8Array, offset: number, littleEndian: boolean): number {
	if (littleEndian === NATIVE_LE) {
		F32B[0] = buffer[offset];
		F32B[1] = buffer[offset + 1];
		F32B[2] = buffer[offset + 2];
		F32B[3] = buffer[offset + 3];
	} else {
		F32B[0] = buffer[offset + 3];
		F32B[1] = buffer[offset + 2];
		F32B[2] = buffer[offset + 1];
		F32B[3] = buffer[offset];
	}

	return F32[0];
}

export function setFloat32(buffer: Uint8Array, offset: number, value: number, littleEndian: boolean): void {
	F32[0] = value;

	if (littleEndian === NATIVE_LE) {
		buffer[offset] = F32B[0];
		buffer[offset + 1] = F32B[1];
		buffer[offset + 2] = F32B[2];
		buffer[offset + 3] = F32B[3];
	} else {
		buffer[offset] = F32B[3];
		buffer[offset + 1] = F32B[2];
		buffer[offset + 2] = F32B[1];
		buffer[offset + 3] = F32B[0];
	}
}

export function getFloat64(buffer: Uint8Array, offset: number, littleEndian: boolean): number {
	if (littleEndian === NATIVE_LE) {
		for (let i = 0; i < 8; i++) F64B[i] = buffer[offset + i];
	} else {
		for (let i = 0; i < 8; i++) F64B[i] = buffer[offset + 7 - i];
	}

	return F64[0];
}

export function setFloat64(buffer: Uint8Array, offset: number, value: number, littleEndian: boolean): void {
	F64[0] = value;

	if (littleEndian === NATIVE_LE) {
		for (let i = 0; i < 8; i++) buffer[offset + i] = F64B[i];
	} else {
		for (let i = 0; i < 8; i++) buffer[offset + i] = F64B[7 - i];
	}
}
