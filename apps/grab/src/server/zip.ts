// A zip archive written as it streams: stored entries (photos and videos don't compress), no zip64.

const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = (TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface Entry {
  name: string;
  data: Uint8Array;
  modified: Date;
}

/** MS-DOS time and date, in UTC: a zip has no time zone, and the server's is no better a guess. */
function dos(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getUTCFullYear());
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

// UTF-8 names
const FLAGS = 0x0800;
const VERSION = 20;
const LIMIT = 0xffffffff;

function record(size: number, write: (view: DataView) => void, name?: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(size + (name?.length ?? 0));
  write(new DataView(bytes.buffer));
  if (name !== undefined) bytes.set(name, size);
  return bytes;
}

async function* chunks(entries: AsyncIterable<Entry>): AsyncGenerator<Uint8Array> {
  const central: Uint8Array[] = [];
  let offset = 0;
  for await (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const { time, date } = dos(entry.modified);
    if (central.length === 0xffff || offset + 30 + name.length + size > LIMIT) {
      throw new Error("too large for a zip without zip64");
    }
    yield record(
      30,
      (d) => {
        d.setUint32(0, 0x04034b50, true);
        d.setUint16(4, VERSION, true);
        d.setUint16(6, FLAGS, true);
        d.setUint16(8, 0, true);
        d.setUint16(10, time, true);
        d.setUint16(12, date, true);
        d.setUint32(14, crc, true);
        d.setUint32(18, size, true);
        d.setUint32(22, size, true);
        d.setUint16(26, name.length, true);
        d.setUint16(28, 0, true);
      },
      name,
    );
    yield entry.data;
    const at = offset;
    central.push(
      record(
        46,
        (d) => {
          d.setUint32(0, 0x02014b50, true);
          d.setUint16(4, VERSION, true);
          d.setUint16(6, VERSION, true);
          d.setUint16(8, FLAGS, true);
          d.setUint16(10, 0, true);
          d.setUint16(12, time, true);
          d.setUint16(14, date, true);
          d.setUint32(16, crc, true);
          d.setUint32(20, size, true);
          d.setUint32(24, size, true);
          d.setUint16(28, name.length, true);
          // extra, comment, disk, internal and external attributes stay 0
          d.setUint32(42, at, true);
        },
        name,
      ),
    );
    offset += 30 + name.length + size;
  }
  const directory = central.reduce((n, c) => n + c.length, 0);
  if (offset + directory > LIMIT) throw new Error("too large for a zip without zip64");
  yield* central;
  yield record(22, (d) => {
    d.setUint32(0, 0x06054b50, true);
    d.setUint16(8, central.length, true);
    d.setUint16(10, central.length, true);
    d.setUint32(12, directory, true);
    d.setUint32(16, offset, true);
  });
}

/** Pulls one entry at a time, so a slow download holds back the fetching. */
export function zip(entries: AsyncIterable<Entry>): ReadableStream<Uint8Array> {
  const it = chunks(entries);
  return new ReadableStream({
    async pull(controller) {
      const next = await it.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}
