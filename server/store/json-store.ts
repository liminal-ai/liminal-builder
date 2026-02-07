import { StoreConfig, VersionedFile } from './store-types';
import { mkdir, rename, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

export class JsonStore<T> {
  private config: StoreConfig;
  private defaultData: T;
  private pendingData: T | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: StoreConfig, defaultData: T) {
    this.config = config;
    this.defaultData = defaultData;
  }

  async read(): Promise<T> {
    try {
      const raw = await readFile(this.config.filePath, 'utf-8');
      const parsed: VersionedFile<T> = JSON.parse(raw);
      return parsed.data;
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return this.defaultData;
      }
      return this.defaultData;
    }
  }

  async write(data: T): Promise<void> {
    this.pendingData = data;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.config.writeDebounceMs);
  }

  async writeSync(data: T): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingData = null;
    await this.atomicWrite(data);
  }

  private async flush(): Promise<void> {
    if (this.pendingData === null) return;
    const data = this.pendingData;
    this.pendingData = null;
    this.debounceTimer = null;
    await this.atomicWrite(data);
  }

  private async atomicWrite(data: T): Promise<void> {
    const dir = dirname(this.config.filePath);
    await mkdir(dir, { recursive: true });
    const tmpPath = this.config.filePath + '.tmp';
    const versioned: VersionedFile<T> = { version: 1, data };
    await writeFile(tmpPath, JSON.stringify(versioned, null, 2), 'utf-8');
    await rename(tmpPath, this.config.filePath);
  }
}
