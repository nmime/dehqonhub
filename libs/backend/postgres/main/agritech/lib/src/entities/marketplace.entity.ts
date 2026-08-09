import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type {
  AiConsultationAnswer,
  AiConsultationKind,
  CartItem,
  ContractLine,
  ContractSourceType,
  ContractStatus,
  DeliveryTerms,
  OfferStatus,
  RequestStatus,
  SampleStatus,
  VerificationDocument,
  VerificationLevel,
  VerificationRejectionReason,
  VerificationRole,
  VerificationStatus,
} from '@app/backend-feature-agritech-shared';

export class VerificationEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  role!: VerificationRole;
  level!: VerificationLevel;
  status: VerificationStatus = 'pending';
  oneIdLinked = false;
  documents: VerificationDocument[] = [];
  reviewedBy: string | null = null;
  reviewedAt: Date | null = null;
  rejectionReason: VerificationRejectionReason | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const VerificationEntitySchema = new EntitySchema<VerificationEntity>({
  class: VerificationEntity,
  tableName: 'marketplace_verifications',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    role: { type: 'varchar', length: 20 },
    level: { type: 'varchar', length: 20 },
    status: { type: 'varchar', length: 20, default: 'pending' },
    oneIdLinked: { type: 'boolean', fieldName: 'one_id_linked' },
    documents: { type: 'jsonb', default: '[]' },
    reviewedBy: { type: 'varchar', length: 100, nullable: true, fieldName: 'reviewed_by' },
    reviewedAt: { type: 'timestamptz', nullable: true, fieldName: 'reviewed_at' },
    rejectionReason: { type: 'varchar', length: 500, nullable: true, fieldName: 'rejection_reason' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [{ name: 'ux__marketplace_verifications__tenant_user', properties: ['tenantId', 'userId'] }],
  indexes: [{ name: 'ix__marketplace_verifications__tenant_id_status', properties: ['tenantId', 'status'] }],
  checks: [
    {
      name: 'ck__marketplace_verifications__role',
      expression: `"role" in ('farmer', 'seller', 'buyer')`,
    },
    {
      name: 'ck__marketplace_verifications__level',
      expression: `"level" in ('basic', 'verified', 'trusted')`,
    },
    {
      name: 'ck__marketplace_verifications__status',
      expression: `"status" in ('none', 'pending', 'verified', 'rejected')`,
    },
    {
      name: 'ck__marketplace_verifications__rejection_reason',
      expression: `
        (("status")::text = 'rejected'::text
          and ("rejection_reason")::text = any (
            (array[
              'criteria_not_met'::character varying,
              'documents_unreadable'::character varying,
              'identity_mismatch'::character varying
            ])::text[]
          ))
        or (("status")::text <> 'rejected'::text and "rejection_reason" is null)
      `,
    },
  ],
});

export class CartEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  sellerId!: string;
  items: CartItem[] = [];
  status: 'open' | 'ordered' | 'abandoned' = 'open';
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const CartEntitySchema = new EntitySchema<CartEntity>({
  class: CartEntity,
  tableName: 'marketplace_carts',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    sellerId: { type: 'varchar', length: 100, fieldName: 'seller_id' },
    items: { type: 'jsonb', default: '[]' },
    status: { type: 'varchar', length: 20, default: 'open' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  indexes: [
    { name: 'ix__marketplace_carts__tenant_id_user_id_status', properties: ['tenantId', 'userId', 'status'] },
    { name: 'ix__marketplace_carts__tenant_id_seller_id', properties: ['tenantId', 'sellerId'] },
  ],
  checks: [
    {
      name: 'ck__marketplace_carts__status',
      expression: `"status" in ('open', 'ordered', 'abandoned')`,
    },
  ],
});

export class SampleRequestEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  productId!: string;
  sellerId!: string;
  status: SampleStatus = 'pending';
  createdAt: Date = new Date();
}

export const SampleRequestEntitySchema = new EntitySchema<SampleRequestEntity>({
  class: SampleRequestEntity,
  tableName: 'marketplace_sample_requests',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    productId: { type: 'varchar', length: 100, fieldName: 'product_id' },
    sellerId: { type: 'varchar', length: 100, fieldName: 'seller_id' },
    status: { type: 'varchar', length: 20, default: 'pending' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  indexes: [
    { name: 'ix__marketplace_sample_requests__tenant_id_user_id', properties: ['tenantId', 'userId'] },
    { name: 'ix__marketplace_sample_requests__tenant_id_seller_id', properties: ['tenantId', 'sellerId'] },
  ],
  checks: [
    {
      name: 'ck__marketplace_sample_requests__status',
      expression: `"status" in ('pending', 'shipped', 'delivered', 'cancelled')`,
    },
  ],
});

export class FavoriteEntity {
  tenantId!: string;
  userId!: string;
  productId!: string;
  createdAt: Date = new Date();
}

export const FavoriteEntitySchema = new EntitySchema<FavoriteEntity>({
  class: FavoriteEntity,
  tableName: 'marketplace_favorites',
  properties: {
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id', primary: true },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id', primary: true },
    productId: { type: 'varchar', length: 100, fieldName: 'product_id', primary: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  indexes: [{ name: 'ix__marketplace_favorites__tenant_id_user_id', properties: ['tenantId', 'userId'] }],
});

export class ReviewEntity {
  id: string = randomUUID();
  tenantId!: string;
  productId!: string;
  userId!: string;
  rating!: number;
  comment: string | null = null;
  createdAt: Date = new Date();
}

export const ReviewEntitySchema = new EntitySchema<ReviewEntity>({
  class: ReviewEntity,
  tableName: 'marketplace_reviews',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    productId: { type: 'varchar', length: 100, fieldName: 'product_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    rating: { type: 'int' },
    comment: { type: 'varchar', length: 2000, nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  indexes: [{ name: 'ix__marketplace_reviews__tenant_id_product_id', properties: ['tenantId', 'productId'] }],
  uniques: [
    {
      name: 'uq__marketplace_reviews__tenant_id_product_id_user_id',
      properties: ['tenantId', 'productId', 'userId'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_reviews__rating',
      expression: '"rating" >= 1 and "rating" <= 5',
    },
  ],
});

export class BuyerRequestEntity {
  id: string = randomUUID();
  tenantId!: string;
  buyerUserId!: string;
  title!: string;
  product: string | null = null;
  volume: string | null = null;
  region!: string;
  deadline: string | null = null;
  budgetUzs: number | null = null;
  requirements: string | null = null;
  status: RequestStatus = 'open';
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const BuyerRequestEntitySchema = new EntitySchema<BuyerRequestEntity>({
  class: BuyerRequestEntity,
  tableName: 'marketplace_requests',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    buyerUserId: { type: 'varchar', length: 100, fieldName: 'buyer_user_id' },
    title: { type: 'varchar', length: 200 },
    product: { type: 'varchar', length: 200, nullable: true },
    volume: { type: 'varchar', length: 100, nullable: true },
    region: { type: 'varchar', length: 100 },
    deadline: { type: 'varchar', length: 100, nullable: true },
    budgetUzs: { type: 'numeric', precision: 15, scale: 2, nullable: true, fieldName: 'budget_uzs' },
    requirements: { type: 'text', nullable: true },
    status: { type: 'varchar', length: 20, default: 'open' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  indexes: [
    { name: 'ix__marketplace_requests__tenant_id_status', properties: ['tenantId', 'status'] },
    { name: 'ix__marketplace_requests__tenant_id_buyer_user_id', properties: ['tenantId', 'buyerUserId'] },
  ],
  checks: [
    {
      name: 'ck__marketplace_requests__status',
      expression: `"status" in ('open', 'offering', 'selected', 'closed', 'expired')`,
    },
  ],
});

export class RequestOfferEntity {
  id: string = randomUUID();
  requestId!: string;
  tenantId!: string;
  sellerUserId!: string;
  priceUzs!: number;
  deliveryTerms!: DeliveryTerms;
  deliveryPriceUzs: number | null = null;
  deliveryNote: string | null = null;
  deliveryDays: number | null = null;
  status: OfferStatus = 'pending';
  createdAt: Date = new Date();
}

export const RequestOfferEntitySchema = new EntitySchema<RequestOfferEntity>({
  class: RequestOfferEntity,
  tableName: 'marketplace_request_offers',
  properties: {
    id: { type: 'uuid', primary: true },
    requestId: { type: 'uuid', fieldName: 'request_id' },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    sellerUserId: { type: 'varchar', length: 100, fieldName: 'seller_user_id' },
    priceUzs: { type: 'numeric', precision: 15, scale: 2, fieldName: 'price_uzs' },
    deliveryTerms: { type: 'varchar', length: 30, fieldName: 'delivery_terms' },
    deliveryPriceUzs: {
      type: 'numeric',
      precision: 15,
      scale: 2,
      nullable: true,
      fieldName: 'delivery_price_uzs',
    },
    deliveryNote: { type: 'varchar', length: 500, nullable: true, fieldName: 'delivery_note' },
    deliveryDays: { type: 'int', nullable: true, fieldName: 'delivery_days' },
    status: { type: 'varchar', length: 20, default: 'pending' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  indexes: [
    { name: 'ix__marketplace_request_offers__tenant_id_request_id', properties: ['tenantId', 'requestId'] },
    { name: 'ix__marketplace_request_offers__tenant_id_seller_user_id', properties: ['tenantId', 'sellerUserId'] },
  ],
  checks: [
    {
      name: 'ck__marketplace_offers__price',
      expression: '"price_uzs" > 0',
    },
    {
      name: 'ck__marketplace_offers__status',
      expression: `"status" in ('pending', 'accepted', 'declined')`,
    },
    {
      name: 'ck__marketplace_offers__delivery_terms',
      expression: `"delivery_terms" in ('pickup', 'seller_delivery', 'by_agreement')`,
    },
    {
      name: 'ck__marketplace_offers__delivery_price',
      expression: `
        ("delivery_terms" = 'pickup' and "delivery_price_uzs" = 0)
        or ("delivery_terms" = 'seller_delivery' and "delivery_price_uzs" > 0)
        or ("delivery_terms" = 'by_agreement' and "delivery_price_uzs" is null)
      `,
    },
  ],
});

RequestOfferEntitySchema.addManyToOne<BuyerRequestEntity>('requestId', BuyerRequestEntity.name, {
  fieldName: 'request_id',
  mapToPk: true,
  deleteRule: 'cascade',
  foreignKeyName: 'fk__marketplace_offers__request',
});

export class ContractEntity {
  id: string = randomUUID();
  tenantId!: string;
  buyerUserId!: string;
  sellerUserId!: string;
  sourceType: ContractSourceType | null = null;
  sourceId: string | null = null;
  subject!: string;
  amountUzs!: number;
  lines: ContractLine[] = [];
  deliveryTerms!: DeliveryTerms;
  deliveryPriceUzs: number | null = null;
  deliveryNote: string | null = null;
  deliveryDays: number | null = null;
  factoringEnabled = false;
  status: ContractStatus = 'draft';
  buyerSignedAt: Date | null = null;
  sellerSignedAt: Date | null = null;
  legacyStatus: 'draft' | 'signed' | 'active' | null = null;
  legacySignedAt: Date | null = null;
  legacyFactoringEnabled: boolean | null = null;
  signedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const ContractEntitySchema = new EntitySchema<ContractEntity>({
  class: ContractEntity,
  tableName: 'marketplace_contracts',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    buyerUserId: { type: 'varchar', length: 100, fieldName: 'buyer_user_id' },
    sellerUserId: { type: 'varchar', length: 100, fieldName: 'seller_user_id' },
    sourceType: { type: 'varchar', length: 30, nullable: true, fieldName: 'source_type' },
    sourceId: { type: 'varchar', length: 100, nullable: true, fieldName: 'source_id' },
    subject: { type: 'varchar', length: 300 },
    amountUzs: { type: 'numeric', precision: 15, scale: 2, fieldName: 'amount_uzs' },
    lines: { type: 'jsonb', default: '[]' },
    deliveryTerms: { type: 'varchar', length: 30, fieldName: 'delivery_terms' },
    deliveryPriceUzs: {
      type: 'numeric',
      precision: 15,
      scale: 2,
      nullable: true,
      fieldName: 'delivery_price_uzs',
    },
    deliveryNote: { type: 'varchar', length: 500, nullable: true, fieldName: 'delivery_note' },
    deliveryDays: { type: 'int', nullable: true, fieldName: 'delivery_days' },
    factoringEnabled: { type: 'boolean', fieldName: 'factoring_enabled' },
    status: { type: 'varchar', length: 30, default: 'draft' },
    buyerSignedAt: { type: 'timestamptz', nullable: true, fieldName: 'buyer_signed_at' },
    sellerSignedAt: { type: 'timestamptz', nullable: true, fieldName: 'seller_signed_at' },
    legacyStatus: { type: 'varchar', length: 20, nullable: true, fieldName: 'legacy_status' },
    legacySignedAt: { type: 'timestamptz', nullable: true, fieldName: 'legacy_signed_at' },
    legacyFactoringEnabled: { type: 'boolean', nullable: true, fieldName: 'legacy_factoring_enabled' },
    signedAt: { type: 'timestamptz', nullable: true, fieldName: 'signed_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  indexes: [
    { name: 'ix__marketplace_contracts__tenant_id_buyer_user_id', properties: ['tenantId', 'buyerUserId'] },
    { name: 'ix__marketplace_contracts__tenant_id_seller_user_id', properties: ['tenantId', 'sellerUserId'] },
  ],
  uniques: [
    {
      name: 'uq__marketplace_contracts__tenant_id_source_type_source_id',
      properties: ['tenantId', 'sourceType', 'sourceId'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_contracts__amount',
      expression: '"amount_uzs" > 0',
    },
    {
      name: 'ck__marketplace_contracts__delivery_terms',
      expression: `"delivery_terms" in ('pickup', 'seller_delivery', 'by_agreement')`,
    },
    {
      name: 'ck__marketplace_contracts__status',
      expression: "\"status\" in ('draft', 'signed', 'active', 'completed', 'cancelled', 'legacy_review_required')",
    },
    {
      name: 'ck__marketplace_contracts__source_type',
      expression: `
        "source_type" is null
        or ("source_type")::text = any (
          (array['cart_checkout'::character varying, 'offer_selection'::character varying])::text[]
        )
      `,
    },
    {
      name: 'ck__marketplace_contracts__source_pair',
      expression: '("source_type" is null) = ("source_id" is null)',
    },
    {
      name: 'ck__marketplace_contracts__delivery_days',
      expression: '"delivery_days" is null or "delivery_days" > 0',
    },
    {
      name: 'ck__marketplace_contracts__delivery_price',
      expression: `
        ("delivery_terms" = 'pickup' and "delivery_price_uzs" = 0)
        or ("delivery_terms" = 'seller_delivery' and ("delivery_price_uzs" is null or "delivery_price_uzs" > 0))
        or ("delivery_terms" = 'by_agreement' and "delivery_price_uzs" is null)
      `,
    },
    {
      name: 'ck__marketplace_contracts__factoring_disabled',
      expression: '"factoring_enabled" = false',
    },
    {
      name: 'ck__marketplace_contracts__party_consent',
      expression: `
        ("status")::text <> all (
          (array[
            'draft'::character varying,
            'signed'::character varying,
            'active'::character varying,
            'legacy_review_required'::character varying
          ])::text[]
        )
        or (
          ("status")::text = 'draft'::text
          and "buyer_signed_at" is null
          and "seller_signed_at" is null
          and "signed_at" is null
        )
        or (
          ("status")::text = 'signed'::text
          and (("buyer_signed_at" is null) <> ("seller_signed_at" is null))
          and "signed_at" is null
        )
        or (
          ("status")::text = 'active'::text
          and "buyer_signed_at" is not null
          and "seller_signed_at" is not null
          and "signed_at" is not null
        )
        or (
          ("status")::text = 'legacy_review_required'::text
          and "buyer_signed_at" is null
          and "seller_signed_at" is null
          and "signed_at" is null
          and ("legacy_status")::text = any (
            (array[
              'draft'::character varying,
              'signed'::character varying,
              'active'::character varying
            ])::text[]
          )
        )
      `,
    },
  ],
});

export class AiConsultationEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  kind!: AiConsultationKind;
  question!: string;
  answer!: AiConsultationAnswer;
  productIds: string[] = [];
  createdAt: Date = new Date();
}

export const AiConsultationEntitySchema = new EntitySchema<AiConsultationEntity>({
  class: AiConsultationEntity,
  tableName: 'marketplace_ai_consultations',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    kind: { type: 'varchar', length: 30 },
    question: { type: 'text' },
    answer: { type: 'text' },
    productIds: { type: 'jsonb', default: '[]', fieldName: 'product_ids' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  indexes: [{ name: 'ix__marketplace_ai_consultations__tenant_id_user_id', properties: ['tenantId', 'userId'] }],
  checks: [
    {
      name: 'ck__marketplace_ai__kind',
      expression: `"kind" in ('recommendation', 'find_cheaper', 'season_advice', 'generic')`,
    },
    {
      name: 'ck__marketplace_ai__answer',
      expression: "\"answer\" in ('catalog_match', 'no_catalog_match')",
    },
    {
      name: 'ck__marketplace_ai__product_ids_array',
      expression: 'jsonb_typeof("product_ids") = \'array\'',
    },
  ],
});
