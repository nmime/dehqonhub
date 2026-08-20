import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

/**
 * One uploaded photograph, as the index between its opaque public name and the
 * object-storage location holding its bytes.
 *
 * The row exists so two things stay true at once. A public read resolves
 * `public_id` to a storage key without the browser ever naming a bucket, a
 * tenant or an account; and an attachment command can prove the actor uploaded
 * the photograph it is attaching, because `tenant_id` and `owner_user_id` are
 * persisted here rather than inferred from a caller-supplied reference.
 *
 * The bytes themselves are never stored in Postgres — only where they are, how
 * big they were, and the digest of what was written.
 */
export class MarketplaceMediaAssetEntity {
  id: string = randomUUID();
  tenantId!: string;
  ownerUserId!: string;
  publicId!: string;
  storageKey!: string;
  mediaType!: string;
  byteSize!: number;
  checksumSha256!: string;
  createdAt: Date = new Date();
}

/**
 * The check expression is written in the form PostgreSQL normalizes the
 * migration's SQL to — `= any (array[...])` rather than `in (...)`, an explicit
 * pair of comparisons rather than `between`, and explicit `::text` casts. The
 * schema-drift component test compares this text against the applied migration,
 * and a readable spelling here would read as a constraint that needs replacing
 * on every run.
 */
const contentCheck = [
  `("media_type")::text = any ((array['image/jpeg'::character varying,`,
  `  'image/png'::character varying, 'image/webp'::character varying])::text[])`,
  `and ("byte_size" >= 32 and "byte_size" <= 5242880)`,
  `and ("public_id")::text ~ '^[A-Za-z0-9_-]{22}$'::text`,
  `and ("checksum_sha256")::text ~ '^[0-9a-f]{64}$'::text`,
].join('\n');

export const MarketplaceMediaAssetEntitySchema = new EntitySchema<MarketplaceMediaAssetEntity>({
  class: MarketplaceMediaAssetEntity,
  tableName: 'marketplace_media_assets',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    ownerUserId: { type: 'varchar', length: 100, fieldName: 'owner_user_id' },
    publicId: { type: 'varchar', length: 100, fieldName: 'public_id' },
    storageKey: { type: 'varchar', length: 300, fieldName: 'storage_key' },
    mediaType: { type: 'varchar', length: 20, fieldName: 'media_type' },
    byteSize: { type: 'int', fieldName: 'byte_size' },
    checksumSha256: { type: 'varchar', length: 64, fieldName: 'checksum_sha256' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    { name: 'uq__marketplace_media_assets__public_id', properties: ['publicId'] },
    { name: 'uq__marketplace_media_assets__storage_key', properties: ['storageKey'] },
  ],
  indexes: [
    {
      name: 'ix__marketplace_media_assets__tenant_id_owner_user_id',
      properties: ['tenantId', 'ownerUserId'],
    },
  ],
  checks: [{ name: 'ck__marketplace_media_assets__content', expression: contentCheck }],
});
