import { Migration } from '@mikro-orm/migrations';

/**
 * The index behind an uploaded photograph.
 *
 * `public_id` is the only member a public response carries, and it is the only
 * way in: the unique index on it is what makes `GET /marketplace/media/{id}` a
 * single-row lookup, while `tenant_id`/`owner_user_id` stay server-side so an
 * attachment command can prove the actor uploaded what it is attaching. The
 * bytes live in object storage under `storage_key`; this table holds only where
 * they are and the digest of what was written, so a row can never disagree with
 * the object it names without the checksum saying so.
 */
const createMediaAssets = `
  create table "marketplace_media_assets" (
    "id" uuid not null,
    "tenant_id" varchar(100) not null,
    "owner_user_id" varchar(100) not null,
    "public_id" varchar(100) not null,
    "storage_key" varchar(300) not null,
    "media_type" varchar(20) not null,
    "byte_size" int not null,
    "checksum_sha256" varchar(64) not null,
    "created_at" timestamptz not null default now(),
    constraint "marketplace_media_assets_pkey" primary key ("id"),
    constraint "ck__marketplace_media_assets__content"
      check ("media_type" in ('image/jpeg', 'image/png', 'image/webp')
        and "byte_size" between 32 and 5242880
        and "public_id" ~ '^[A-Za-z0-9_-]{22}$'
        and "checksum_sha256" ~ '^[0-9a-f]{64}$')
  );
`;

const mediaAssetPublicIdIndex = `
  create unique index "uq__marketplace_media_assets__public_id"
    on "marketplace_media_assets" ("public_id");
`;

const mediaAssetStorageKeyIndex = `
  create unique index "uq__marketplace_media_assets__storage_key"
    on "marketplace_media_assets" ("storage_key");
`;

const mediaAssetOwnerIndex = `
  create index "ix__marketplace_media_assets__tenant_id_owner_user_id"
    on "marketplace_media_assets" ("tenant_id", "owner_user_id");
`;

/**
 * A harvest listing may now carry its own photographs.
 *
 * The publication projection copies the locked source row's assets into the
 * public snapshot, and `marketplace_listing_publications.public_images` already
 * refuses more than five. Without this column a farmer's produce had no place to
 * put a photograph at all, so every harvest published assetless whatever the
 * farmer uploaded. The bound is restated here so the source row cannot hold a
 * sixth entry that the snapshot would silently drop.
 */
const addProduceImages = `
  alter table "produce_listings"
    add column "images" jsonb not null default '[]'::jsonb,
    add constraint "ck__produce_listings__images"
      check (jsonb_typeof("images") = 'array' and jsonb_array_length("images") <= 5);
`;

export class Migration20260813120000AddMarketplaceMediaUploads extends Migration {
  override up(): void {
    this.addSql(createMediaAssets);
    this.addSql(mediaAssetPublicIdIndex);
    this.addSql(mediaAssetStorageKeyIndex);
    this.addSql(mediaAssetOwnerIndex);
    this.addSql(addProduceImages);
  }

  override down(): void {
    this.addSql(`alter table "produce_listings" drop constraint if exists "ck__produce_listings__images";`);
    this.addSql(`alter table "produce_listings" drop column if exists "images";`);
    this.addSql(`drop table if exists "marketplace_media_assets";`);
  }
}
