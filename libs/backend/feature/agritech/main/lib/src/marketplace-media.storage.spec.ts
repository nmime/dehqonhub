// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-PUBLIC-018
import { describe, expect, it, vi } from 'vitest';
import type { S3ConfigService, S3Service } from '@app/backend-common-s3';
import {
  MarketplaceMediaStorageUnavailableException,
  createMarketplaceMediaObjectStorage,
} from './marketplace-media.storage';

const service = (overrides: Partial<S3Service> = {}) =>
  ({
    getObject: vi.fn().mockResolvedValue(null),
    putObject: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as S3Service;

const config = (bucket?: string) => ({ bucket }) as unknown as S3ConfigService;

describe('marketplace photograph object storage', () => {
  it('reports itself unconfigured without a bucket and refuses both operations', async () => {
    const s3 = service();
    const storage = createMarketplaceMediaObjectStorage(config(), s3);

    expect(storage.configured).toBe(false);
    await expect(storage.put('key', new Uint8Array([1]), 'image/webp')).rejects.toThrow(
      MarketplaceMediaStorageUnavailableException,
    );
    await expect(storage.get('key')).rejects.toThrow(MarketplaceMediaStorageUnavailableException);
    // Nothing was handed to the client, so nothing can have been half-written.
    expect(s3.putObject).not.toHaveBeenCalled();
    expect(s3.getObject).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only bucket as no bucket at all', () => {
    expect(createMarketplaceMediaObjectStorage(config('   '), service()).configured).toBe(false);
  });

  it('writes and reads through the shared client once a bucket is configured', async () => {
    const stored = new Uint8Array([1, 2, 3]);
    const s3 = service({ getObject: vi.fn().mockResolvedValue({ body: stored, key: 'k' }) });
    const storage = createMarketplaceMediaObjectStorage(config('dehqonhub-media'), s3);

    expect(storage.configured).toBe(true);
    await storage.put('marketplace/media/t/u/id', stored, 'image/jpeg');
    // The bucket is deliberately absent from the call: the shared service resolves
    // it from configuration, so no caller can address another bucket.
    expect(s3.putObject).toHaveBeenCalledWith({
      body: stored,
      contentType: 'image/jpeg',
      key: 'marketplace/media/t/u/id',
    });
    await expect(storage.get('marketplace/media/t/u/id')).resolves.toBe(stored);
  });

  it('answers a missing object with nothing rather than an empty photograph', async () => {
    const storage = createMarketplaceMediaObjectStorage(config('dehqonhub-media'), service());

    await expect(storage.get('absent')).resolves.toBeUndefined();
  });
});
