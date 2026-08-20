// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-PUBLIC-018
import { Exception, ExceptionKind } from '@app/backend-common-exception';
import { S3ConfigService, S3Service } from '@app/backend-common-s3';
import type { MarketplaceMediaObjectStorage, MarketplaceMediaType } from '@app/backend-feature-agritech-shared';

export const MarketplaceMediaStorageUnavailableExtensions = class {
  retryable!: boolean;
};

/**
 * What a deployment without working object storage answers.
 *
 * It is a 503 rather than a 500 because nothing about the request was wrong, and
 * it carries `retryable` so the client can tell "this deployment stores no
 * photographs at all" from "the bucket was briefly unreachable". Either way no
 * object was written and no reference was minted, so the screen can say the
 * photograph was not stored instead of implying it was.
 */
export class MarketplaceMediaStorageUnavailableException extends Exception({
  name: 'MarketplaceMediaStorageUnavailableException',
  kind: ExceptionKind.Server,
  problemType: 'marketplace-media-storage-unavailable',
  extensionsType: MarketplaceMediaStorageUnavailableExtensions,
}) {}

/**
 * The photograph bucket, behind the repository's existing S3 abstraction.
 *
 * `@app/backend-common-s3` already owns the AWS client, the endpoint/path-style
 * configuration a MinIO deployment needs, and an in-memory client for tests, so
 * this adapter adds exactly one thing: an explicit `configured` flag derived
 * from configuration rather than discovered on the first failed write.
 *
 * `S3_BUCKET` is the whole test. Region has a default, an endpoint is only
 * needed for a non-AWS server, and the underlying client already refuses a
 * half-supplied credential pair — but without a bucket there is nowhere for a
 * photograph to go, and the upload route must know that before it reads a byte.
 */
export const createMarketplaceMediaObjectStorage = (
  config: S3ConfigService,
  storage: S3Service,
): MarketplaceMediaObjectStorage => {
  const configured = Boolean(config.bucket?.trim());

  return {
    configured,
    async get(key: string): Promise<Uint8Array | undefined> {
      requireConfigured(configured);
      const object = await storage.getObject({ key });

      return object?.body;
    },
    async put(key: string, body: Uint8Array, contentType: MarketplaceMediaType): Promise<void> {
      requireConfigured(configured);
      await storage.putObject({ body, contentType, key });
    },
  };
};

function requireConfigured(configured: boolean): void {
  if (!configured) {
    throw new MarketplaceMediaStorageUnavailableException({
      extensions: { retryable: false },
      meta: { reason: 'S3_BUCKET is not configured for this deployment.' },
    });
  }
}
