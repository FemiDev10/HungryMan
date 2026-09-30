import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

/**
 * Private file storage. Files never live under a public URL; they are only served by
 * authenticated API routes. With STORAGE_ENCRYPTION_KEY set, files are encrypted at
 * rest with AES-256-GCM (format: "HMENC1" | iv(12) | tag(16) | ciphertext).
 * Swap this for an S3-compatible adapter by implementing the same interface.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  deleteAll(): Promise<void>;
}

const MAGIC = Buffer.from('HMENC1');

function keyBuffer(): Buffer | null {
  if (!env.STORAGE_ENCRYPTION_KEY) return null;
  const k = Buffer.from(env.STORAGE_ENCRYPTION_KEY, 'hex');
  if (k.length !== 32) throw new Error('STORAGE_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  return k;
}

export function encrypt(data: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ct]);
}

export function decrypt(blob: Buffer, key: Buffer | null): Buffer {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) return blob; // stored unencrypted (dev)
  if (!key) throw new Error('File is encrypted but STORAGE_ENCRYPTION_KEY is not set');
  const iv = blob.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = blob.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(MAGIC.length + 28)), decipher.final()]);
}

export class LocalEncryptedStorage implements StorageAdapter {
  constructor(private root: string) {}

  private resolve(key: string): string {
    if (!/^[\w./-]+$/.test(key) || key.includes('..')) throw new Error(`Invalid storage key: ${key}`);
    return path.join(this.root, key);
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const k = keyBuffer();
    // wx: never overwrite an existing artifact
    await fs.writeFile(file, k ? encrypt(data, k) : data, { flag: 'wx', mode: 0o600 });
  }

  async get(key: string) {
    return decrypt(await fs.readFile(this.resolve(key)), keyBuffer());
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }

  async deleteAll() {
    await fs.rm(this.root, { recursive: true, force: true });
  }
}

export const storage: StorageAdapter = new LocalEncryptedStorage(path.resolve(env.STORAGE_DIR));
