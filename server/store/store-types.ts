export interface StoreConfig {
	/** Path to JSON file */
	filePath: string;
	/** Debounce interval for writes (ms) */
	writeDebounceMs: number;
}

export interface VersionedFile<T> {
	version: number;
	data: T;
}
