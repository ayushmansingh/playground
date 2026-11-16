// Run with: node --test audio-splicer/tests/ops.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Ops = require('../ops.js');

const clip = (...chs) => chs.map((c) => Float32Array.from(c));
const arr = (chs) => chs.map((c) => Array.from(c));

test('slice / remove / insert / replace', () => {
  const a = clip([1, 2, 3, 4, 5]);
  assert.deepEqual(arr(Ops.slice(a, 1, 3)), [[2, 3]]);
  assert.deepEqual(arr(Ops.remove(a, 1, 3)), [[1, 4, 5]]);
  assert.deepEqual(arr(Ops.insert(a, 2, clip([9, 9]))), [[1, 2, 9, 9, 3, 4, 5]]);
  assert.deepEqual(arr(Ops.replace(a, 1, 4, clip([7]))), [[1, 7, 5]]);
  assert.deepEqual(arr(a), [[1, 2, 3, 4, 5]], 'input untouched');
});

test('conform up- and down-mixes', () => {
  assert.deepEqual(arr(Ops.conform(clip([1, 2]), 2)), [[1, 2], [1, 2]]);
  assert.deepEqual(arr(Ops.conform(clip([1, 0], [0, 1]), 1)), [[0.5, 0.5]]);
  // pasting stereo into mono downmixes
  assert.deepEqual(arr(Ops.insert(clip([0, 0]), 1, clip([1], [0]))), [[0, 0.5, 0]]);
});

test('concat with gap and crossfade', () => {
  const a = clip([1, 1, 1, 1]);
  const b = clip([2, 2, 2, 2]);
  assert.deepEqual(arr(Ops.concat([a, b], 0)), [[1, 1, 1, 1, 2, 2, 2, 2]]);
  assert.deepEqual(arr(Ops.concat([a, b], 2)), [[1, 1, 1, 1, 0, 0, 2, 2, 2, 2]]);
  const x = Ops.concat([a, b], -2);
  assert.equal(Ops.length(x), 6);
  assert.equal(x[0][0], 1);
  assert.equal(x[0][5], 2);
  // mono + stereo joins as stereo
  assert.equal(Ops.concat([a, clip([2], [3])], 0).length, 2);
});

test('mix sums and prevents clipping', () => {
  const r = Ops.mix([clip([0.25, 0.25, 0.25]), clip([0.5])]);
  assert.deepEqual(arr(r.channels), [[0.75, 0.25, 0.25]]);
  assert.equal(r.scaled, false);
  const loud = Ops.mix([clip([0.8]), clip([0.8])]);
  assert.ok(loud.scaled && loud.channels[0][0] < 1);
});

test('fade and silence', () => {
  const a = clip([1, 1, 1, 1, 1]);
  assert.deepEqual(arr(Ops.fade(a, 0, 5, 'in')), [[0, 0.25, 0.5, 0.75, 1]]);
  assert.deepEqual(arr(Ops.fade(a, 0, 5, 'out')), [[1, 0.75, 0.5, 0.25, 0]]);
  assert.deepEqual(arr(Ops.silence(a, 1, 3)), [[1, 0, 0, 1, 1]]);
});

test('encodeWav writes a valid 16-bit PCM header', () => {
  const buf = Ops.encodeWav(clip([0, 1, -1], [0.5, 0, 0]), 44100);
  const v = new DataView(buf);
  const str = (o) => String.fromCharCode(...new Uint8Array(buf, o, 4));
  assert.equal(str(0), 'RIFF');
  assert.equal(str(8), 'WAVE');
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(40, true), 12);
  assert.equal(buf.byteLength, 56);
  assert.equal(v.getInt16(46, true), 16383); // ch2 sample 0 = 0.5
  assert.equal(v.getInt16(48, true), 32767);
  assert.equal(v.getInt16(52, true), -32768);
});

test('zip stores files with correct CRC and directory', () => {
  const data = new TextEncoder().encode('hello');
  const z = Ops.zip([{ name: 'a.txt', data }]);
  const v = new DataView(z.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(14, true), 0x3610a686); // crc32("hello")
  assert.equal(new TextDecoder().decode(z.subarray(35, 40)), 'hello');
  const end = z.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50);
  assert.equal(v.getUint16(end + 10, true), 1);
  assert.equal(v.getUint32(end + 16, true), 40); // central directory offset
});
