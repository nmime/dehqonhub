// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import type { MarketplaceExternalProviderMode } from '@app/backend-feature-agritech-shared';

export const MarketplaceProviderConfigInjectToken = Symbol('MarketplaceProviderConfigInjectToken');

export type MarketplaceProviderConfigCapability =
  | 'oneId'
  | 'verificationDocuments'
  | 'contractArtifactStorage'
  | 'disputeEvidenceStorage'
  | 'qualifiedSignature'
  | 'promotionBilling'
  | 'directPayment'
  | 'factoring'
  | 'notificationDelivery';

export interface MarketplaceProviderCapabilityConfig {
  mode: MarketplaceExternalProviderMode;
  providerName: string | null;
  timeoutMs: number;
}

export type MarketplaceProviderConfig = Record<
  MarketplaceProviderConfigCapability,
  MarketplaceProviderCapabilityConfig
>;

export interface MarketplaceProviderCapabilityReadiness extends MarketplaceProviderCapabilityConfig {
  ready: boolean;
  reconciliation: 'disabled' | 'idempotent-retry';
  simulation: boolean;
}

export type MarketplaceProviderReadiness = Record<
  MarketplaceProviderConfigCapability,
  MarketplaceProviderCapabilityReadiness
>;

interface MarketplaceProviderEnvironmentDefinition {
  modeVariable: string;
  mockProviderName: string;
  timeoutVariable: string;
}

const providerDefinitions = {
  oneId: {
    modeVariable: 'MARKETPLACE_ONEID_PROVIDER_MODE',
    mockProviderName: 'mock-oneid',
    timeoutVariable: 'MARKETPLACE_ONEID_PROVIDER_TIMEOUT_MS',
  },
  verificationDocuments: {
    modeVariable: 'MARKETPLACE_DOCUMENT_PROVIDER_MODE',
    mockProviderName: 'mock-document-storage',
    timeoutVariable: 'MARKETPLACE_DOCUMENT_PROVIDER_TIMEOUT_MS',
  },
  contractArtifactStorage: {
    modeVariable: 'MARKETPLACE_CONTRACT_ARTIFACT_STORAGE_PROVIDER_MODE',
    mockProviderName: 'mock-contract-artifact-storage',
    timeoutVariable: 'MARKETPLACE_CONTRACT_ARTIFACT_STORAGE_PROVIDER_TIMEOUT_MS',
  },
  disputeEvidenceStorage: {
    modeVariable: 'MARKETPLACE_DISPUTE_EVIDENCE_STORAGE_PROVIDER_MODE',
    mockProviderName: 'mock-dispute-evidence-storage',
    timeoutVariable: 'MARKETPLACE_DISPUTE_EVIDENCE_STORAGE_PROVIDER_TIMEOUT_MS',
  },
  qualifiedSignature: {
    modeVariable: 'MARKETPLACE_QUALIFIED_SIGNATURE_PROVIDER_MODE',
    mockProviderName: 'mock-qualified-signature',
    timeoutVariable: 'MARKETPLACE_QUALIFIED_SIGNATURE_PROVIDER_TIMEOUT_MS',
  },
  promotionBilling: {
    modeVariable: 'MARKETPLACE_PROMOTION_BILLING_PROVIDER_MODE',
    mockProviderName: 'mock-promotion-billing',
    timeoutVariable: 'MARKETPLACE_PROMOTION_BILLING_PROVIDER_TIMEOUT_MS',
  },
  directPayment: {
    modeVariable: 'MARKETPLACE_DIRECT_PAYMENT_PROVIDER_MODE',
    mockProviderName: 'mock-direct-payment',
    timeoutVariable: 'MARKETPLACE_DIRECT_PAYMENT_PROVIDER_TIMEOUT_MS',
  },
  factoring: {
    modeVariable: 'MARKETPLACE_FACTORING_PROVIDER_MODE',
    mockProviderName: 'mock-factoring',
    timeoutVariable: 'MARKETPLACE_FACTORING_PROVIDER_TIMEOUT_MS',
  },
  notificationDelivery: {
    modeVariable: 'MARKETPLACE_NOTIFICATION_PROVIDER_MODE',
    mockProviderName: 'mock-notification-delivery',
    timeoutVariable: 'MARKETPLACE_NOTIFICATION_PROVIDER_TIMEOUT_MS',
  },
} as const satisfies Record<MarketplaceProviderConfigCapability, MarketplaceProviderEnvironmentDefinition>;

const retiredProviderVariables = ['MARKETPLACE_SIGNATURE_PROVIDER_MODE', 'MARKETPLACE_BANK_PROVIDER_MODE'] as const;
const approvedMockEnvironments = new Set(['development', 'test', 'staging']);
const minimumProviderTimeoutMs = 100;
const maximumProviderTimeoutMs = 30_000;
const defaultProviderTimeoutMs = 10_000;

function providerTimeout(env: Readonly<Record<string, string | undefined>>, variable: string): number {
  const raw = env[variable]?.trim();
  if (!raw) {
    return defaultProviderTimeoutMs;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimumProviderTimeoutMs || value > maximumProviderTimeoutMs) {
    throw new Error(
      `${variable} must be an integer between ${minimumProviderTimeoutMs} and ${maximumProviderTimeoutMs}.`,
    );
  }
  return value;
}

function providerMode(
  env: Readonly<Record<string, string | undefined>>,
  variable: string,
): MarketplaceExternalProviderMode {
  const mode = env[variable]?.trim().toLowerCase() || 'disabled';
  if (mode !== 'disabled' && mode !== 'mock' && mode !== 'live') {
    throw new Error(`${variable} must be one of disabled, mock, or live.`);
  }
  if (mode === 'mock' && !approvedMockEnvironments.has(env.NODE_ENV ?? '')) {
    throw new Error(`${variable}=mock is allowed only when NODE_ENV is development, test, or staging.`);
  }
  if (mode === 'live') {
    throw new Error(`${variable}=live requires an approved configured live provider adapter.`);
  }
  return mode;
}

export function marketplaceProviderReadiness(config: MarketplaceProviderConfig): MarketplaceProviderReadiness {
  return Object.fromEntries(
    (Object.keys(providerDefinitions) as MarketplaceProviderConfigCapability[]).map((capability) => {
      const entry = config[capability];
      return [
        capability,
        {
          ...entry,
          ready: entry.mode !== 'disabled',
          reconciliation: entry.mode === 'disabled' ? 'disabled' : 'idempotent-retry',
          simulation: entry.mode === 'mock',
        },
      ];
    }),
  ) as unknown as MarketplaceProviderReadiness;
}

export function resolveMarketplaceProviderConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): MarketplaceProviderConfig {
  for (const variable of retiredProviderVariables) {
    if (env[variable]?.trim()) {
      throw new Error(`${variable} is retired; configure each exact marketplace provider capability instead.`);
    }
  }
  return Object.fromEntries(
    (
      Object.entries(providerDefinitions) as Array<
        [MarketplaceProviderConfigCapability, MarketplaceProviderEnvironmentDefinition]
      >
    ).map(([capability, definition]) => {
      const mode = providerMode(env, definition.modeVariable);
      return [
        capability,
        {
          mode,
          providerName: mode === 'mock' ? definition.mockProviderName : null,
          timeoutMs: providerTimeout(env, definition.timeoutVariable),
        },
      ];
    }),
  ) as unknown as MarketplaceProviderConfig;
}
