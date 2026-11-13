/**
 * A stand-in for the R2 map bucket that reads a local PMTiles file, for the
 * local dev API and tests. Node only: never deployed.
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import type { R2Bucket } from '../mapTiles.ts';

export function fileBucket(path: string): R2Bucket {
  return {
    async get(_key, options) {
      const size = statSync(path).size;
      const offset = options?.range?.offset ?? 0;
      const length = Math.min(options?.range?.length ?? size, size - offset);
      const buf = Buffer.alloc(Math.max(0, length));
      const fd = openSync(path, 'r');
      try {
        readSync(fd, buf, 0, buf.length, offset);
      } finally {
        closeSync(fd);
      }
      return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer, etag: String(size) };
    },
  };
}
