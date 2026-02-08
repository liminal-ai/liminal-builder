import type { StoreConfig, VersionedFile } from "./store-types";
import { mkdir, rename, readFile, writeFile } from "node:fs/promises";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

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
			const raw = await readFile(this.config.filePath, "utf-8");
			const parsed = JSON.parse(raw) as VersionedFile<T>;
			return parsed.data;
		} catch (err: unknown) {
			const code =
				typeof err === "object" && err !== null && "code" in err
					? (err as { code?: string }).code
					: undefined;
			if (code === "ENOENT") {
				return this.defaultData;
			}
			return this.defaultData;
		}
	}

	/** Synchronous read for use in constructors where async is not available.
	 *  Returns defaultData when the file does not exist. */
	readSync(): T {
		try {
			const raw = readFileSync(this.config.filePath, "utf-8");
			const parsed = JSON.parse(raw) as VersionedFile<T>;
			return parsed.data;
		} catch (err: unknown) {
			const code =
				typeof err === "object" && err !== null && "code" in err
					? (err as { code?: string }).code
					: undefined;
			if (code === "ENOENT") {
				return this.defaultData;
			}
			return this.defaultData;
		}
	}

	/** Synchronous atomic write using writeFileSync + renameSync.
	 *  For use where callers must remain synchronous (e.g. archiveSession). */
	writeSyncBlocking(data: T): void {
		const dir = dirname(this.config.filePath);
		mkdirSync(dir, { recursive: true });
		const tmpPath = `${this.config.filePath}.tmp`;
		const versioned: VersionedFile<T> = { version: 1, data };
		writeFileSync(tmpPath, JSON.stringify(versioned, null, 2), "utf-8");
		renameSync(tmpPath, this.config.filePath);
	}

	/**
	 * Persist data to the JSON store.
	 *
	 * - When `writeDebounceMs <= 0`, writes are immediate (no debouncing).
	 *   This is the mode used by tests (`writeDebounceMs: 0`) for synchronous
	 *   store behavior without timer complications.
	 * - When `writeDebounceMs > 0`, writes are debounced with the configured
	 *   delay. Subsequent calls within the debounce window replace the pending
	 *   data and reset the timer, so only the last write in a burst is flushed.
	 */
	async write(data: T): Promise<void> {
		if (this.config.writeDebounceMs <= 0) {
			await this.writeSync(data);
			return;
		}

		this.pendingData = data;
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			void this.flush();
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
		const tmpPath = `${this.config.filePath}.tmp`;
		const versioned: VersionedFile<T> = { version: 1, data };
		await writeFile(tmpPath, JSON.stringify(versioned, null, 2), "utf-8");
		await rename(tmpPath, this.config.filePath);
	}
}
