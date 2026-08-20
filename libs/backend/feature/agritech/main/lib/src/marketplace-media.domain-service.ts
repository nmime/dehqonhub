// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { BadRequestException, ConflictException, ResourceNotFoundException } from '@app/backend-common-exception';
import {
  createMarketplaceMediaPublicId,
  inspectMarketplaceMedia,
  marketplaceMediaChecksum,
  marketplaceMediaPathFor,
  marketplaceMediaPublicIdFrom,
  marketplaceMediaPublicIdPattern,
  marketplaceMediaReferenceFor,
  marketplaceMediaStorageKey,
  type AgriTechOwner,
  type MarketplaceMediaAsset,
  type MarketplaceMediaObjectStorage,
  type MarketplaceMediaRejection,
  type MarketplaceMediaRepository,
  type MarketplaceMediaType,
  type OperationResult,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceMediaStorageUnavailableException } from './marketplace-media.storage';

const maximumFileNameLength = 200;

/** What the caller is told about one accepted photograph. */
export interface MarketplaceMediaReceipt {
  /** The opaque public name of the stored object. */
  id: string;
  /** Where a listing image column may point: a root-relative same-origin path. */
  path: string;
  /** The `public-asset:` handle a review's `assetReferences` accepts. */
  reference: string;
  mediaType: MarketplaceMediaType;
  byteSize: number;
  createdAt: Date;
}

export interface MarketplaceMediaUpload {
  content: Uint8Array;
  fileName: string;
}

export interface MarketplaceMediaBody {
  content: Uint8Array;
  mediaType: MarketplaceMediaType;
  byteSize: number;
}

/**
 * A file name is caller-authored text that ends up in no persisted field, but it
 * still reaches logs and error metadata, so the same characters dispute evidence
 * refuses are refused here: path separators, control characters, DEL, and the
 * bidirectional overrides that let a name render as something it is not.
 */
const unsafeFileNameCharacter = /[/\\\p{Cc}\u202a-\u202e\u2066-\u2069]/u;

const hasUnsafeFileNameCharacter = (value: string): boolean => unsafeFileNameCharacter.test(value);

const rejectionField: Readonly<Record<MarketplaceMediaRejection, string>> = {
  malformed_media: 'photo',
  too_large: 'photo',
  too_small: 'photo',
  unsupported_media_type: 'photo',
};

const unwrap = <T>(result: OperationResult<T>, resource: string): T => {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(resource);
  }
  if (result.status === 'conflict') {
    throw new ConflictException(resource);
  }
  throw new BadRequestException({ meta: { field: result.field, resourceType: resource } });
};

/**
 * Uploading, reading back, and proving ownership of a marketplace photograph.
 *
 * The three belong together because they share one invariant: an opaque public
 * id is the only thing that ever crosses the API boundary. Nothing here accepts
 * a storage key, a bucket, or a tenant from a caller, and nothing here returns
 * one.
 */
export class MarketplaceMediaDomainService {
  constructor(
    protected readonly repository: MarketplaceMediaRepository,
    protected readonly storage: MarketplaceMediaObjectStorage,
  ) {}

  /** Whether this deployment can store a photograph at all. */
  get configured(): boolean {
    return this.storage.configured;
  }

  /**
   * Accept one photograph from an authenticated account.
   *
   * The order matters. Storage readiness is checked before a single byte is
   * examined, so a deployment without a bucket refuses instead of validating a
   * file it could never keep. The container is then parsed and stripped of
   * camera metadata, and only the sanitized bytes are written. The row is
   * persisted last: an object with no row is unreachable and collectable, while
   * a row with no object would be a reference that resolves to nothing.
   */
  async storePhotograph(owner: AgriTechOwner, upload: MarketplaceMediaUpload): Promise<MarketplaceMediaReceipt> {
    if (!this.storage.configured) {
      throw new MarketplaceMediaStorageUnavailableException({
        extensions: { retryable: false },
        meta: { reason: 'Object storage is not configured for this deployment.' },
      });
    }
    const fileName = upload.fileName.normalize('NFC').trim();
    if (fileName.length < 1 || fileName.length > maximumFileNameLength || hasUnsafeFileNameCharacter(fileName)) {
      throw new BadRequestException({ meta: { field: 'photo', resourceType: 'marketplace-media' } });
    }
    const inspection = inspectMarketplaceMedia(upload.content);
    if (inspection.status === 'rejected') {
      throw new BadRequestException({
        meta: {
          field: rejectionField[inspection.reason],
          reason: inspection.reason,
          resourceType: 'marketplace-media',
        },
      });
    }
    const { content, mediaType } = inspection.value;
    const publicId = createMarketplaceMediaPublicId();
    const storageKey = marketplaceMediaStorageKey(owner, publicId);
    await this.writeObject(storageKey, content, mediaType);
    const asset = unwrap(
      await this.repository.recordAsset(owner, {
        byteSize: content.byteLength,
        checksumSha256: marketplaceMediaChecksum(content),
        mediaType,
        publicId,
        storageKey,
      }),
      'marketplace-media',
    );

    return toReceipt(asset);
  }

  /**
   * The bytes behind one public id, for the same-origin read path.
   *
   * A stored photograph is readable by anyone holding its 128-bit opaque id and
   * by nobody else: the id is the capability. That is deliberate — a published
   * listing is public, and a guest browsing the catalogue has no session — and
   * it is why the id is random rather than derived from anything about the
   * account that uploaded it. A missing row and a missing object answer
   * identically, so neither confirms that an id was ever minted.
   */
  async readPhotograph(publicId: string): Promise<MarketplaceMediaBody> {
    if (!marketplaceMediaPublicIdPattern.test(publicId)) {
      throw new ResourceNotFoundException('marketplace-media');
    }
    const record = await this.repository.findAsset(publicId);
    if (!record) {
      throw new ResourceNotFoundException('marketplace-media');
    }
    const content = await this.readObject(record.storageKey);
    if (!content) {
      throw new ResourceNotFoundException('marketplace-media');
    }

    return { byteSize: content.byteLength, content, mediaType: record.mediaType };
  }

  /**
   * Refuse a reference the caller did not upload.
   *
   * References that carry no public id — the checked-in library paths — pass
   * through untouched, because they belong to the deployment rather than to an
   * account. Every uploaded reference must resolve to a row this exact tenant
   * and user own. An unknown id and a foreign id are refused the same way, with
   * the field named and nothing said about which of the two it was, so the
   * command cannot be used to discover that an id exists.
   */
  async requireOwnedReferences(owner: AgriTechOwner, references: readonly string[], field: string): Promise<void> {
    const publicIds = [
      ...new Set(references.map((reference) => marketplaceMediaPublicIdFrom(reference)).filter(isPresent)),
    ];
    if (publicIds.length === 0) {
      return;
    }
    const owned = new Set(await this.repository.findOwnedPublicIds(owner, publicIds));
    if (publicIds.some((publicId) => !owned.has(publicId))) {
      throw new BadRequestException({ meta: { field, resourceType: 'marketplace-media' } });
    }
  }

  private async writeObject(key: string, content: Uint8Array, mediaType: MarketplaceMediaType): Promise<void> {
    try {
      await this.storage.put(key, content, mediaType);
    } catch (error) {
      throw storageFailure(error, 'put');
    }
  }

  private async readObject(key: string): Promise<Uint8Array | undefined> {
    try {
      return await this.storage.get(key);
    } catch (error) {
      throw storageFailure(error, 'get');
    }
  }
}

const isPresent = (value: string | undefined): value is string => value !== undefined;

const toReceipt = (asset: MarketplaceMediaAsset): MarketplaceMediaReceipt => ({
  byteSize: asset.byteSize,
  createdAt: asset.createdAt,
  id: asset.publicId,
  mediaType: asset.mediaType,
  path: marketplaceMediaPathFor(asset.publicId),
  reference: marketplaceMediaReferenceFor(asset.publicId),
});

/**
 * A bucket that is configured but did not answer is retryable; the caller may
 * send the same photograph again. The underlying error never reaches the wire —
 * an endpoint, a bucket name or a key in a public message would be exactly the
 * leak this route exists to avoid.
 */
function storageFailure(error: unknown, operation: string): Error {
  if (error instanceof MarketplaceMediaStorageUnavailableException) {
    return error;
  }

  return new MarketplaceMediaStorageUnavailableException({
    ...(error instanceof Error ? { cause: error } : {}),
    extensions: { retryable: true },
    meta: { operation },
  });
}
