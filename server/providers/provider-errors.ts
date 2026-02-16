export type ProviderErrorCode =
	| "UNSUPPORTED_CLI_TYPE"
	| "SESSION_NOT_FOUND"
	| "PROCESS_CRASH"
	| "PROTOCOL_ERROR"
	| "INVALID_STREAM_EVENT"
	| "INTERRUPT_FAILED"
	| "SESSION_CREATE_FAILED";

export class ProviderError extends Error {
	readonly code: ProviderErrorCode;
	readonly cause?: unknown;

	constructor(code: ProviderErrorCode, message: string, cause?: unknown) {
		super(message);
		this.name = "ProviderError";
		this.code = code;
		this.cause = cause;
	}
}
