// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ResourceNotFoundException } from '@app/backend-common-exception';
import {
  marketplaceMediaChecksum,
  type MarketplaceMediaObjectStorage,
  type OperationResult,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceMediaDomainService } from './marketplace-media.domain-service';
import { MarketplaceMediaStorageUnavailableException } from './marketplace-media.storage';

const workspaceRoot = join(import.meta.dirname, '../../../../../../..');
const photograph = new Uint8Array(
  readFileSync(join(workspaceRoot, 'apps/frontend/app/public/media/marketplace/wheat-grain.webp')),
);
const owner = { tenantId: 'tenant-1', userId: 'seller-user' };
const publicIdPattern = /^[A-Za-z0-9_-]{22}$/u;

function fixture(options: { configured?: boolean; record?: OperationResult<unknown> } = {}) {
  const objects = new Map<string, Uint8Array>();
  const storage: MarketplaceMediaObjectStorage = {
    configured: options.configured ?? true,
    get: vi.fn((key: string) => Promise.resolve(objects.get(key))),
    put: vi.fn((key: string, body: Uint8Array) => {
      objects.set(key, body);
      return Promise.resolve();
    }),
  };
  const repository = {
    findAsset: vi.fn().mockResolvedValue(undefined),
    findOwnedPublicIds: vi.fn().mockResolvedValue([]),
    recordAsset: vi.fn((_owner: unknown, input: { publicId: string; byteSize: number; mediaType: string }) =>
      Promise.resolve(
        options.record ?? {
          status: 'ok',
          value: {
            byteSize: input.byteSize,
            checksumSha256: 'a'.repeat(64),
            createdAt: new Date('2026-08-20T00:00:00.000Z'),
            mediaType: input.mediaType,
            publicId: input.publicId,
          },
        },
      ),
    ),
  };

  return {
    objects,
    repository,
    service: new MarketplaceMediaDomainService(repository as never, storage),
    storage,
  };
}

describe('marketplace photograph upload', () => {
  it('stores the sanitized bytes under an opaque key and returns only public members', async () => {
    const { objects, repository, service, storage } = fixture();

    const receipt = await service.storePhotograph(owner, { content: photograph, fileName: 'bug`doy.webp' });

    expect(receipt.id).toMatch(publicIdPattern);
    expect(receipt.path).toBe(`/marketplace/media/${receipt.id}`);
    expect(receipt.reference).toBe(`public-asset:${receipt.id}`);
    expect(receipt.mediaType).toBe('image/webp');

    const [key, body, contentType] = vi.mocked(storage.put).mock.calls[0]!;
    expect(key).toBe(`marketplace/media/tenant-1/seller-user/${receipt.id}`);
    expect(contentType).toBe('image/webp');
    expect(receipt.byteSize).toBe(body.byteLength);
    // The row records the digest of exactly the bytes that were written, never of
    // the upload before sanitizing.
    expect(repository.recordAsset).toHaveBeenCalledWith(owner, {
      byteSize: body.byteLength,
      checksumSha256: marketplaceMediaChecksum(objects.get(key)!),
      mediaType: 'image/webp',
      publicId: receipt.id,
      storageKey: key,
    });
    // Nothing about the bucket, the tenant, the account or the key crosses the
    // boundary — the receipt is the whole public surface.
    expect(JSON.stringify(receipt)).not.toMatch(/tenant-1|seller-user|storageKey|bucket/u);
  });

  it('refuses before reading a byte when the deployment has no storage', async () => {
    const { repository, service, storage } = fixture({ configured: false });

    await expect(
      service.storePhotograph(owner, { content: photograph, fileName: 'bugdoy.webp' }),
    ).rejects.toMatchObject({
      name: 'MarketplaceMediaStorageUnavailableException',
    });
    expect(service.configured).toBe(false);
    expect(storage.put).not.toHaveBeenCalled();
    expect(repository.recordAsset).not.toHaveBeenCalled();
  });

  it('refuses a file name that could be a path, a control sequence, or a reversed name', async () => {
    const { service, storage } = fixture();

    for (const fileName of [
      '',
      '   ',
      'a'.repeat(201),
      '../../etc/passwd',
      'photos\\bugdoy.webp',
      'bugdoy\u0000.webp',
      'bugdoy\u202egpj.webp',
      'bugdoy\u2066.webp',
      'bugdoy\u007f.webp',
    ]) {
      await expect(service.storePhotograph(owner, { content: photograph, fileName })).rejects.toThrow(
        BadRequestException,
      );
    }
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('refuses a file whose extension lies about its content, and names the reason', async () => {
    const { service, storage } = fixture();

    await expect(
      service.storePhotograph(owner, {
        content: Buffer.from('%PDF-1.7 a document that a name calls a photograph'),
        fileName: 'harvest.webp',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.storePhotograph(owner, { content: new Uint8Array(4), fileName: 'harvest.webp' }),
    ).rejects.toThrow(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('reports storage that is configured but did not answer as retryable, and writes no row', async () => {
    const { repository, service, storage } = fixture();
    vi.mocked(storage.put).mockRejectedValueOnce(new Error('connection reset'));

    const failure = await service
      .storePhotograph(owner, { content: photograph, fileName: 'bugdoy.webp' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MarketplaceMediaStorageUnavailableException);
    expect(repository.recordAsset).not.toHaveBeenCalled();
    // The underlying endpoint and bucket stay in private diagnostics.
    expect(JSON.stringify((failure as { extensions?: unknown }).extensions)).toBe('{"retryable":true}');
  });

  it('reports a client that rejected with something other than an error the same way', async () => {
    const { service, storage } = fixture();
    vi.mocked(storage.put).mockRejectedValueOnce('ECONNRESET');

    await expect(service.storePhotograph(owner, { content: photograph, fileName: 'bugdoy.webp' })).rejects.toThrow(
      MarketplaceMediaStorageUnavailableException,
    );
  });

  it('passes an already-typed storage refusal through rather than wrapping it as retryable', async () => {
    const { service, storage } = fixture();
    vi.mocked(storage.put).mockRejectedValueOnce(
      new MarketplaceMediaStorageUnavailableException({ extensions: { retryable: false } }),
    );

    const failure = await service
      .storePhotograph(owner, { content: photograph, fileName: 'bugdoy.webp' })
      .catch((error: unknown) => error);

    expect(JSON.stringify((failure as { extensions?: unknown }).extensions)).toBe('{"retryable":false}');
  });

  it('reports a persistence refusal in the shape the repository named', async () => {
    for (const [record, expected] of [
      [{ status: 'conflict', field: 'publicId' }, ConflictException],
      [{ status: 'not_found' }, ResourceNotFoundException],
      [{ status: 'forbidden' }, BadRequestException],
    ] as const) {
      const { service } = fixture({ record });
      await expect(service.storePhotograph(owner, { content: photograph, fileName: 'a.webp' })).rejects.toThrow(
        expected,
      );
    }
  });
});

describe('marketplace photograph read', () => {
  it('resolves an opaque identifier to bytes without the caller naming a key', async () => {
    const { repository, service } = fixture();
    const receipt = await service.storePhotograph(owner, { content: photograph, fileName: 'bugdoy.webp' });
    const key = `marketplace/media/tenant-1/seller-user/${receipt.id}`;
    repository.findAsset.mockResolvedValue({
      byteSize: receipt.byteSize,
      checksumSha256: 'a'.repeat(64),
      createdAt: new Date(),
      mediaType: 'image/webp',
      publicId: receipt.id,
      storageKey: key,
    });

    const body = await service.readPhotograph(receipt.id);

    expect(body.mediaType).toBe('image/webp');
    expect(body.byteSize).toBe(receipt.byteSize);
    expect(repository.findAsset).toHaveBeenCalledWith(receipt.id);
  });

  it('answers a malformed identifier, an unknown row, and a missing object identically', async () => {
    const { repository, service } = fixture();

    for (const id of ['', 'short', '../../secret', 'A'.repeat(23)]) {
      await expect(service.readPhotograph(id)).rejects.toThrow(ResourceNotFoundException);
    }
    expect(repository.findAsset).not.toHaveBeenCalled();

    await expect(service.readPhotograph('A'.repeat(22))).rejects.toThrow(ResourceNotFoundException);

    repository.findAsset.mockResolvedValue({
      byteSize: 1,
      checksumSha256: 'a'.repeat(64),
      createdAt: new Date(),
      mediaType: 'image/webp',
      publicId: 'A'.repeat(22),
      storageKey: 'marketplace/media/tenant-1/seller-user/absent',
    });
    await expect(service.readPhotograph('A'.repeat(22))).rejects.toThrow(ResourceNotFoundException);
  });

  it('reports an unreachable bucket on the read path as a typed storage refusal', async () => {
    const { repository, service, storage } = fixture();
    repository.findAsset.mockResolvedValue({
      byteSize: 1,
      checksumSha256: 'a'.repeat(64),
      createdAt: new Date(),
      mediaType: 'image/webp',
      publicId: 'A'.repeat(22),
      storageKey: 'marketplace/media/tenant-1/seller-user/key',
    });
    vi.mocked(storage.get).mockRejectedValueOnce(new Error('connection reset'));

    await expect(service.readPhotograph('A'.repeat(22))).rejects.toThrow(MarketplaceMediaStorageUnavailableException);
  });
});

describe('marketplace photograph ownership', () => {
  it('lets library paths through untouched and never queries for them', async () => {
    const { repository, service } = fixture();

    await service.requireOwnedReferences(owner, ['/media/marketplace/wheat-grain.webp'], 'images');

    expect(repository.findOwnedPublicIds).not.toHaveBeenCalled();
  });

  it('accepts both carrying shapes, de-duplicated, when this account uploaded them', async () => {
    const { repository, service } = fixture();
    const first = 'A'.repeat(22);
    const second = 'B'.repeat(22);
    repository.findOwnedPublicIds.mockResolvedValue([first, second]);

    await service.requireOwnedReferences(
      owner,
      [
        `/marketplace/media/${first}`,
        `public-asset:${second}`,
        `/marketplace/media/${first}`,
        '/media/marketplace/wheat-grain.webp',
      ],
      'images',
    );

    expect(repository.findOwnedPublicIds).toHaveBeenCalledWith(owner, [first, second]);
  });

  it('refuses a reference this account did not upload, naming the field and nothing else', async () => {
    const { repository, service } = fixture();
    const mine = 'A'.repeat(22);
    const theirs = 'C'.repeat(22);
    repository.findOwnedPublicIds.mockResolvedValue([mine]);

    const failure = await service
      .requireOwnedReferences(owner, [`/marketplace/media/${mine}`, `/marketplace/media/${theirs}`], 'images')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BadRequestException);
    // Refusing an unowned handle exactly as a malformed one keeps the command
    // from confirming that another account's identifier exists.
    expect(JSON.stringify(failure)).not.toContain(theirs);
  });
});
