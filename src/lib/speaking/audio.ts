export const MAX_TURN_BYTES = 2 * 1024 * 1024;

export function wavDurationSeconds(buffer: Buffer): number | null {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bytesPerSecond = buffer.readUInt32LE(28);
  const dataSize = buffer.readUInt32LE(40);
  if (buffer.readUInt16LE(20) !== 1 || channels !== 1 || sampleRate !== 16000 || bytesPerSecond !== 32000) return null;
  if (dataSize === 0 || dataSize + 44 !== buffer.length) return null;
  const seconds = dataSize / bytesPerSecond;
  return seconds > 0 && seconds <= 30.5 ? seconds : null;
}
