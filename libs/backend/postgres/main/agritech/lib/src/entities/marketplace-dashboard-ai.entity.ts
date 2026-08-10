// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type { AiConsultationAnswer, AiConsultationKind } from '@app/backend-feature-agritech-shared';
import type { MarketplaceAiGroundedResponse } from '@app/backend-feature-agritech-shared';

export class MarketplaceAiConsultationEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  kind!: AiConsultationKind;
  question!: string;
  answer!: AiConsultationAnswer;
  listingPublicationIds: string[] = [];
  response!: MarketplaceAiGroundedResponse;
  revision = 0;
  confirmedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceAiConsultationEntitySchema = new EntitySchema<MarketplaceAiConsultationEntity>({
  class: MarketplaceAiConsultationEntity,
  tableName: 'marketplace_ai_consultations',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    kind: { type: 'varchar', length: 30 },
    question: { type: 'text' },
    answer: { type: 'text' },
    listingPublicationIds: {
      type: 'jsonb',
      defaultRaw: "'[]'::jsonb",
      fieldName: 'listing_publication_ids',
    },
    response: {
      type: 'jsonb',
      fieldName: 'response_snapshot',
      defaultRaw: `'${JSON.stringify({
        explanationCodes: ['no_grounded_catalog_match'],
        recommendations: [],
        starterCartPreview: { sellerPartitions: [], status: 'unavailable' },
      })}'::jsonb`,
    },
    revision: { type: 'int', default: 0 },
    confirmedAt: { type: 'timestamptz', nullable: true, fieldName: 'confirmed_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  indexes: [
    {
      name: 'ix__marketplace_ai_consultations__tenant_id_user_id_created_at',
      properties: ['tenantId', 'userId', 'createdAt'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_ai_consultations__kind',
      expression: `"kind" in ('recommendation', 'find_cheaper', 'season_advice', 'generic')`,
    },
    {
      name: 'ck__marketplace_ai_consultations__answer',
      expression: `"answer" in ('catalog_match', 'no_catalog_match')`,
    },
    {
      name: 'ck__marketplace_ai_consultations__listing_ids',
      expression: `jsonb_typeof("listing_publication_ids") = 'array' and jsonb_array_length("listing_publication_ids") <= 3`,
    },
    {
      name: 'ck__marketplace_ai_consultations__answer_shape',
      expression: `("answer" = 'catalog_match' and jsonb_array_length("listing_publication_ids") between 1 and 3)
        or ("answer" = 'no_catalog_match' and jsonb_array_length("listing_publication_ids") = 0)`,
    },
    {
      name: 'ck__marketplace_ai_consultations__question',
      expression: `char_length("question") between 1 and 2000
        and "question" = btrim("question")
        and "question" !~ '[[:cntrl:]]'
        and "question" !~ U&'[\\00AD\\061C\\200B-\\200F\\202A-\\202E\\2060-\\2064\\2066-\\206F\\FEFF]'`,
    },
    {
      name: 'ck__marketplace_ai_consultations__response_snapshot',
      expression: `jsonb_typeof("response_snapshot") = 'object'
        and jsonb_typeof("response_snapshot" -> 'explanationCodes') = 'array'
        and jsonb_typeof("response_snapshot" -> 'recommendations') = 'array'
        and jsonb_array_length("response_snapshot" -> 'recommendations') <= 3
        and jsonb_typeof("response_snapshot" -> 'starterCartPreview') = 'object'
        and ("response_snapshot" -> 'starterCartPreview' ->> 'status') in ('requires_confirmation', 'unavailable')
        and jsonb_typeof("response_snapshot" -> 'starterCartPreview' -> 'sellerPartitions') = 'array'
        and pg_column_size("response_snapshot") <= 65536`,
    },
    {
      name: 'ck__marketplace_ai_consultations__revision',
      expression: `"revision" between 0 and 1`,
    },
    {
      name: 'ck__marketplace_ai_consultations__confirmation',
      expression: `("revision" = 0 and "confirmed_at" is null) or ("revision" = 1 and "confirmed_at" is not null)`,
    },
  ],
});

export class MarketplaceAiConsultationOperationEntity {
  id: string = randomUUID();
  actorTenantId!: string;
  actorUserId!: string;
  consultationId!: string;
  idempotencyKey!: string;
  requestFingerprint!: string;
  resultSnapshot!: Record<string, unknown>;
  createdAt: Date = new Date();
}

export const MarketplaceAiConsultationOperationEntitySchema =
  new EntitySchema<MarketplaceAiConsultationOperationEntity>({
    class: MarketplaceAiConsultationOperationEntity,
    tableName: 'marketplace_ai_consultation_operations',
    properties: {
      id: { type: 'uuid', primary: true },
      actorTenantId: { type: 'varchar', length: 100, fieldName: 'actor_tenant_id' },
      actorUserId: { type: 'varchar', length: 100, fieldName: 'actor_user_id' },
      consultationId: { type: 'uuid', fieldName: 'consultation_id' },
      idempotencyKey: { type: 'varchar', length: 100, fieldName: 'idempotency_key' },
      requestFingerprint: { type: 'varchar', length: 64, fieldName: 'request_fingerprint' },
      resultSnapshot: { type: 'jsonb', fieldName: 'result_snapshot' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    uniques: [
      {
        name: 'uq__marketplace_ai_consultation_operations__actor_key',
        properties: ['actorTenantId', 'actorUserId', 'idempotencyKey'],
      },
      {
        name: 'uq__marketplace_ai_consultation_operations__consultation_id',
        properties: ['consultationId'],
      },
    ],
    checks: [
      {
        name: 'ck__marketplace_ai_consultation_operations__idempotency_key',
        expression: `"idempotency_key" ~ '^[A-Za-z0-9:_-]{8,100}$'`,
      },
      {
        name: 'ck__marketplace_ai_consultation_operations__request_fingerprint',
        expression: `"request_fingerprint" ~ '^[0-9a-f]{64}$'`,
      },
      {
        name: 'ck__marketplace_ai_consultation_operations__result_snapshot',
        expression: `jsonb_typeof("result_snapshot") = 'object'
          and jsonb_typeof("result_snapshot" -> 'listingPublicationIds') = 'array'
          and jsonb_typeof("result_snapshot" -> 'response') = 'object'
          and pg_column_size("result_snapshot") <= 65536`,
      },
    ],
  });

MarketplaceAiConsultationOperationEntitySchema.addManyToOne<MarketplaceAiConsultationOperationEntity>(
  'consultationId',
  MarketplaceAiConsultationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'consultation_id',
    foreignKeyName: 'fk__marketplace_ai_consultation_operations__consultation_id',
    mapToPk: true,
  },
);

export class MarketplaceAiStarterCartOperationEntity {
  id: string = randomUUID();
  actorTenantId!: string;
  actorUserId!: string;
  consultationId!: string;
  buyerPartnerId!: string;
  idempotencyKey!: string;
  requestFingerprint!: string;
  resultSnapshot!: Record<string, unknown>;
  createdAt: Date = new Date();
}

export const MarketplaceAiStarterCartOperationEntitySchema = new EntitySchema<MarketplaceAiStarterCartOperationEntity>({
  class: MarketplaceAiStarterCartOperationEntity,
  tableName: 'marketplace_ai_starter_cart_operations',
  properties: {
    id: { type: 'uuid', primary: true },
    actorTenantId: { type: 'varchar', length: 100, fieldName: 'actor_tenant_id' },
    actorUserId: { type: 'varchar', length: 100, fieldName: 'actor_user_id' },
    consultationId: { type: 'uuid', fieldName: 'consultation_id' },
    buyerPartnerId: { type: 'uuid', fieldName: 'buyer_partner_id' },
    idempotencyKey: { type: 'varchar', length: 100, fieldName: 'idempotency_key' },
    requestFingerprint: { type: 'varchar', length: 64, fieldName: 'request_fingerprint' },
    resultSnapshot: { type: 'jsonb', fieldName: 'result_snapshot' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__marketplace_ai_starter_cart_operations__actor_key',
      properties: ['actorTenantId', 'actorUserId', 'idempotencyKey'],
    },
    {
      name: 'uq__marketplace_ai_starter_cart_operations__consultation_id',
      properties: ['consultationId'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_ai_starter_cart_operations__actor_tena_5a95027e',
      properties: ['actorTenantId', 'actorUserId', 'createdAt'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_ai_starter_cart_operations__request_fingerprint',
      expression: `"request_fingerprint" ~ '^[0-9a-f]{64}$'`,
    },
    {
      name: 'ck__marketplace_ai_starter_cart_operations__idempotency_key',
      expression: `"idempotency_key" ~ '^[A-Za-z0-9:_-]{8,100}$'`,
    },
    {
      name: 'ck__marketplace_ai_starter_cart_operations__result_snapshot',
      expression: `jsonb_typeof("result_snapshot") = 'object'
        and "result_snapshot" ->> 'status' = 'confirmed'
        and jsonb_typeof("result_snapshot" -> 'carts') = 'array'
        and jsonb_array_length("result_snapshot" -> 'carts') between 1 and 3
        and ("result_snapshot" ->> 'consultationId')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and pg_column_size("result_snapshot") <= 65536`,
    },
  ],
});

MarketplaceAiStarterCartOperationEntitySchema.addManyToOne<MarketplaceAiStarterCartOperationEntity>(
  'consultationId',
  MarketplaceAiConsultationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'consultation_id',
    foreignKeyName: 'fk__marketplace_ai_starter_cart_operations__consultation_id',
    mapToPk: true,
  },
);
MarketplaceAiStarterCartOperationEntitySchema.addManyToOne<MarketplaceAiStarterCartOperationEntity>(
  'buyerPartnerId',
  'AgriTechPartnerEntity',
  {
    deleteRule: 'restrict',
    fieldName: 'buyer_partner_id',
    foreignKeyName: 'fk__marketplace_ai_starter_cart_operations__buyer_partner_id',
    mapToPk: true,
  },
);
