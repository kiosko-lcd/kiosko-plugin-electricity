/** Every price provider the plugin knows. Add a new one here (and its options in source.ts). */
import type { PriceProvider } from './provider.ts';
import { pvpc } from './pvpc/index.ts';

export const PROVIDERS = { pvpc } satisfies Record<string, PriceProvider>;
export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export const providerOf = (id: string): PriceProvider => PROVIDERS[id as ProviderId] ?? PROVIDERS.pvpc;
