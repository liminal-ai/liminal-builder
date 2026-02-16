import { NotImplementedError } from "../errors";
import type { CliProvider, CliType, ProviderRegistry } from "./provider-types";

export class InMemoryProviderRegistry implements ProviderRegistry {
	register(_provider: CliProvider): void {
		throw new NotImplementedError("InMemoryProviderRegistry.register");
	}

	resolve(_cliType: CliType): CliProvider {
		throw new NotImplementedError("InMemoryProviderRegistry.resolve");
	}
}
