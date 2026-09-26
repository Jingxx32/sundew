import assert from "node:assert/strict";
import test from "node:test";
import { wavDurationSeconds } from "./audio";

function pcmWav(seconds: number) {
  const dataBytes = seconds * 32000;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

test("accepts a bounded mono PCM turn", () => assert.equal(wavDurationSeconds(pcmWav(2)), 2));
test("rejects an overlong turn and a truncated upload", () => {
  assert.equal(wavDurationSeconds(pcmWav(31)), null);
  assert.equal(wavDurationSeconds(pcmWav(2).subarray(0, 100)), null);
});
test("rejects unexpected sample rate", () => {
  const wav = pcmWav(2);
  wav.writeUInt32LE(48000, 24);
  assert.equal(wavDurationSeconds(wav), null);
});
