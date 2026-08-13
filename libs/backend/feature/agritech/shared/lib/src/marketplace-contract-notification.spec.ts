// @requirements REQ-AGRITECH-NOTIFICATION-022
import { describe, expect, it } from 'vitest';
import {
  isMarketplaceContractCriticalNotificationTemplate,
  marketplaceContractCriticalNotificationTemplateKeys,
  marketplaceNotificationMaxAttempts,
  marketplaceNotificationMaxChannelAttempts,
} from './marketplace-contract-notification';

describe('marketplace contract notification policy', () => {
  it('classifies money and dispute templates as critical and nothing else', () => {
    for (const templateKey of marketplaceContractCriticalNotificationTemplateKeys) {
      expect(isMarketplaceContractCriticalNotificationTemplate(templateKey)).toBe(true);
    }
    expect(isMarketplaceContractCriticalNotificationTemplate('marketplace.contract.dispute.opened')).toBe(true);
    expect(isMarketplaceContractCriticalNotificationTemplate('marketplace.contract.delivery.scheduled')).toBe(false);
    expect(isMarketplaceContractCriticalNotificationTemplate('')).toBe(false);
  });

  it('budgets retries across both channels rather than per channel', () => {
    expect(marketplaceNotificationMaxAttempts).toBe(marketplaceNotificationMaxChannelAttempts * 2);
  });
});
