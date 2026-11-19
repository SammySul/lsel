// Fonts the user added, kept in this browser's IndexedDB. The database, store and record
// shape are the ones the first typ used, so fonts saved back then still load.
const DB_NAME = "FontsDB";
const STORE = "fonts";

/**
 * A stored font. New records keep `bytes`: WebKit's private mode refuses Blobs in IndexedDB.
 * `blob` and `fontBase64` (a `data:` URL) are from the first typ.
 */
export interface StoredFont {
  fontName: string;
  bytes?: ArrayBuffer;
  blob?: Blob;
  fontBase64?: string;
}

/** What the Local Font Access API returns for one face of an installed font. */
interface LocalFace {
  family: string;
  style: string;
  blob(): Promise<Blob>;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "fontName" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs one request in its own transaction and waits until the transaction is committed. */
async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function base64Bytes(dataUrl: string): ArrayBuffer {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function register(name: string, bytes: ArrayBuffer): Promise<void> {
  document.fonts.add(await new FontFace(name, bytes).load());
}

/** The record's font file, or undefined when it holds nothing a font could be read from. */
async function payload(r: StoredFont): Promise<ArrayBuffer | undefined> {
  if (r.bytes) return r.bytes;
  if (r.blob) return r.blob.arrayBuffer();
  if (!r.fontBase64) return undefined;
  try {
    return base64Bytes(r.fontBase64);
  } catch {
    return undefined;
  }
}

/**
 * Registers every stored font with the page and deletes the records that hold no font file.
 * A font the browser won't load is kept: the browser may only be blocking fonts for now.
 */
export async function loadStored(): Promise<{
  loaded: string[];
  failed: string[];
  removed: string[];
}> {
  const records = await run("readonly", (s) => s.getAll() as IDBRequest<StoredFont[]>);
  const loaded: string[] = [];
  const failed: string[] = [];
  const removed: string[] = [];
  for (const r of records) {
    try {
      const bytes = await payload(r);
      if (bytes === undefined) {
        await remove(r.fontName);
        removed.push(r.fontName);
      } else {
        await register(r.fontName, bytes);
        loaded.push(r.fontName);
      }
    } catch {
      failed.push(r.fontName);
    }
  }
  return { loaded, failed, removed };
}

/** The name a file is shown and stored under: its name without the extension. */
export const fontName = (file: File) => file.name.replace(/\.[^/.]+$/, "");

export class NotAFont extends Error {}

/**
 * Registers a font file with the page, then stores it. Throws `NotAFont` when the browser
 * can't read it as a font, and the storage error when it is shown but could not be kept.
 */
export async function addFile(file: File): Promise<string> {
  const name = fontName(file);
  const bytes = await file.arrayBuffer();
  try {
    await register(name, bytes);
  } catch {
    throw new NotAFont(name);
  }
  await run("readwrite", (s) => s.put({ fontName: name, bytes } satisfies StoredFont));
  return name;
}

export async function remove(name: string): Promise<void> {
  await run("readwrite", (s) => s.delete(name));
}

export const localFontsSupported = () => "queryLocalFonts" in window;

let faces: LocalFace[] = [];

/** The installed font families, after the browser asks the user for permission. */
export async function localFamilies(): Promise<string[]> {
  const w = window as unknown as { queryLocalFonts(): Promise<LocalFace[]> };
  faces = await w.queryLocalFonts();
  return [...new Set(faces.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
}

// Loads the real bytes instead of naming the family in CSS, which browsers that shield
// against fingerprinting (Brave) answer with a fallback font.
export async function loadLocal(family: string): Promise<void> {
  const same = faces.filter((f) => f.family === family);
  const face = same.find((f) => f.style === "Regular") ?? same[0];
  if (face === undefined) throw new Error(`${family} is not installed`);
  await register(family, await (await face.blob()).arrayBuffer());
}
