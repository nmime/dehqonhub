import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AgriTechOwner,
  MarketplaceMediaAsset,
  MarketplaceMediaAssetRecord,
  MarketplaceMediaRepository,
  MarketplaceMediaType,
  OperationResult,
  StoreMarketplaceMediaInput,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceMediaAssetEntity } from '../entities/marketplace-media.entity';

export function toMarketplaceMediaAsset(entity: MarketplaceMediaAssetEntity): MarketplaceMediaAsset {
  return {
    byteSize: entity.byteSize,
    checksumSha256: entity.checksumSha256,
    createdAt: entity.createdAt,
    mediaType: entity.mediaType as MarketplaceMediaType,
    publicId: entity.publicId,
  };
}

@Injectable()
export class PostgresMarketplaceMediaRepository implements MarketplaceMediaRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  /**
   * Persist the index row for one already-written object.
   *
   * A duplicate `public_id` is a generated-identifier collision rather than a
   * caller mistake, so it reports a conflict instead of overwriting the row that
   * already owns that address.
   */
  async recordAsset(
    owner: AgriTechOwner,
    input: StoreMarketplaceMediaInput,
  ): Promise<OperationResult<MarketplaceMediaAsset>> {
    const existing = await this.em.findOne(MarketplaceMediaAssetEntity, { publicId: input.publicId });
    if (existing) {
      return { field: 'publicId', status: 'conflict' };
    }
    const entity = new MarketplaceMediaAssetEntity();
    Object.assign(entity, {
      byteSize: input.byteSize,
      checksumSha256: input.checksumSha256,
      mediaType: input.mediaType,
      ownerUserId: owner.userId,
      publicId: input.publicId,
      storageKey: input.storageKey,
      tenantId: owner.tenantId,
    });
    this.em.persist(entity);
    await this.em.flush();

    return { status: 'ok', value: toMarketplaceMediaAsset(entity) };
  }

  /**
   * The public read is deliberately not tenant-scoped.
   *
   * A guest browsing an approved publication has no tenant, and the photograph
   * is part of that public snapshot. The opaque identifier is the whole
   * authorization, which is why it is 128 random bits and why this row exposes
   * its storage key to the caller of this method and to nothing else.
   */
  async findAsset(publicId: string): Promise<MarketplaceMediaAssetRecord | undefined> {
    const entity = await this.em.findOne(MarketplaceMediaAssetEntity, { publicId });

    return entity ? { ...toMarketplaceMediaAsset(entity), storageKey: entity.storageKey } : undefined;
  }

  async findOwnedPublicIds(owner: AgriTechOwner, publicIds: readonly string[]): Promise<string[]> {
    if (publicIds.length === 0) {
      return [];
    }
    const entities = await this.em.find(MarketplaceMediaAssetEntity, {
      ownerUserId: owner.userId,
      publicId: { $in: [...publicIds] },
      tenantId: owner.tenantId,
    });

    return entities.map((entity) => entity.publicId);
  }
}
