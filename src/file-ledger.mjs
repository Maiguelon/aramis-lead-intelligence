import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Local demo only: atomic replacement, but no cross-process locking. */
export class FileLedger {
  constructor(path) { this.path = path; }

  async readAll() {
    try {
      const rows = JSON.parse(await readFile(this.path, 'utf8'));
      if (!rows || typeof rows !== 'object' || Array.isArray(rows)) throw new Error('invalid_ledger');
      return rows;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async get(key) { return (await this.readAll())[key] || null; }

  async save(key, row) {
    const rows = await this.readAll();
    rows[key] = row;
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(rows, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(temp, this.path);
  }
}
