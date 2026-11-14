import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';

export interface StoredObject {
  size: number;
  /** Flusso dell'intero file o dell'intervallo richiesto (necessario per riprodurre i video). */
  stream: (range?: { start: number; end: number }) => Readable | Buffer;
}

/**
 * Archivio dei file caricati dagli utenti.
 * In sviluppo i file stanno su disco; in produzione va usato un archivio a oggetti con CDN in UE,
 * implementando questa stessa interfaccia.
 */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  remove(key: string): Promise<void>;
}

export class LocalStorage implements Storage {
  private dir: string;
  constructor(dir: string) {
    this.dir = resolve(dir);
  }
  private path(key: string) {
    // Le chiavi sono generate dal server (uuid + estensione): niente percorsi relativi.
    if (!/^[a-z0-9-]+\.[a-z0-9]+$/.test(key)) throw new Error('chiave non valida');
    return join(this.dir, key);
  }
  async put(key: string, data: Buffer) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(key), data);
  }
  async get(key: string) {
    try {
      const path = this.path(key);
      const info = await stat(path);
      return { size: info.size, stream: (range?: { start: number; end: number }) => createReadStream(path, range) };
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
}

/** Archivio in memoria, per i test automatici. */
export class MemoryStorage implements Storage {
  files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    this.files.set(key, data);
  }
  async get(key: string) {
    const data = this.files.get(key);
    if (!data) return null;
    return { size: data.length, stream: (range?: { start: number; end: number }) => (range ? data.subarray(range.start, range.end + 1) : data) };
  }
  async remove(key: string) {
    this.files.delete(key);
  }
}

/** Riconosce il tipo di file dai primi byte: non ci si fida del nome né del tipo dichiarato. */
export function sniff(data: Buffer): { kind: 'image' | 'video'; contentType: string; ext: string } | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { kind: 'image', contentType: 'image/jpeg', ext: 'jpg' };
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', contentType: 'image/png', ext: 'png' };
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return { kind: 'image', contentType: 'image/webp', ext: 'webp' };
  if (data.toString('ascii', 4, 8) === 'ftyp') {
    const brand = data.toString('ascii', 8, 12);
    if (brand.startsWith('qt')) return { kind: 'video', contentType: 'video/quicktime', ext: 'mov' };
    if (/^(heic|heix|mif1|avif)/.test(brand)) return null;
    return { kind: 'video', contentType: 'video/mp4', ext: 'mp4' };
  }
  return null;
}
