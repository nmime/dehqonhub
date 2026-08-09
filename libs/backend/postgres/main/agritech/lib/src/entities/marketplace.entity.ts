import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type {
  AiConsultationKind,
  CartItem,
  ContractStatus,
  DeliveryTerms,
  OfferStatus,
  RequestStatus,
  SampleStatus,
  VerificationDocument,
  VerificationLevel,
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
  rejectionReason: string | null = null;
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
    createdAt: { type: 'timestamptz', fieldName: 'created_at' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at' },
  },
  uniques: [{ name: 'ux__marketplace_verifications__tenant_user', properties: ['tenantId', 'userId'] }],
  indexes: [{ name: 'ix__marketplace_verifications__tenant_status', properties: ['tenantId', 'status'] }],
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
    createdAt: { type: 'timestamptz', fieldName: 'created_at' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at' },
  },
  indexes: [
    { name: 'ix__marketplace_carts__tenant_user_status', properties: ['tenantId', 'userId', 'status'] },
    { name: 'ix__marketplace_carts__tenant_seller', properties: ['tenantId', 'sellerId'] },
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
    createdAt: { type: 'timestamptz', fieldName: 'created_at' },
  },
  indexes: [
    { name: 'ix__marketplace_samples__tenant_user', properties: ['tenantId', 'userId'] },
    { name: 'ix__marketplace_samples__tenant_seller', properties: ['tenantId', 'sellerId'] },
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
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    productId: { type: 'varchar', length: 100, fieldName: 'product_id' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at' },
  },
  uniques: [
    { name: 'ux__marketplace_favorites__tenant_user_product', properties: ['tenantId', 'userId', 'productId'] },
  ],
  indexes: [{ name: 'ix__marketplace_favorites__tenant_user', properties: ['tenantId', 'userId'] }],
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
    createdAt: { type: 'timestamptz', fieldName: 'created_at' },
  },
  indexes: [{ name: 'ix__marketplace_reviews__tenant_product', properties: ['tenantId', 'productId'] }],
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
    budgetUzs: { type: 'numeric', nullable: true, fieldName: 'budget_uzs' },
    requirements: { type: 'text', nullable: true },
    status: { type: 'varchar', length: 20, default: 'open' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at' },
  },
  indexes: [
    { name: 'ix__marketplace_requests__tenant_status', properties: ['tenantId', 'status'] },
    { name: 'ix__marketplace_requests__tenant_buyer', properties: ['tenantId', 'buyerUserId'] },
  ],
});

export class RequestOfferEntity {
  id: string = randomUUID();
  requestId!: string;
  tenantId!: string;
  sellerUserId!: string;
  priceUzs!: number;
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
    priceUzs: { type: 'numeric', fieldName: 'price_uzs' },
    deliveryNote: { type: 'varchar', length: 500, nullable: true, fieldName: 'delivery_note' },
    deliveryDays: { type: 'int', nullable: true, fieldName: 'delivery_days' },
    status: { type: 'varchar', length: 20, default: 'pending' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at' },
  },
  indexes: [
    { name: 'ix__marketplace_offers__tenant_request', properties: ['tenantId', 'requestId'] },
    { name: 'ix__marketplace_offers__tenant_seller', properties: ['tenantId', 'sellerUserId'] },
  ],
});

export class ContractEntity {
  id: string = randomUUID();
  tenantId!: string;
  buyerUserId!: string;
  sellerUserId!: string;
  subject!: string;
  amountUzs!: number;
  deliveryTerms!: DeliveryTerms;
  deliveryPriceUzs: number | null = null;
  factoringEnabled = false;
  status: ContractStatus = 'draft';
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
    subject: { type: 'varchar', length: 300 },
    amountUzs: { type: 'numeric', fieldName: 'amount_uzs' },
    deliveryTerms: { type: 'varchar', length: 30, fieldName: 'delivery_terms' },
    deliveryPriceUzs: { type: 'numeric', nullable: true, fieldName: 'delivery_price_uzs' },
    factoringEnabled: { type: 'boolean', fieldName: 'factoring_enabled' },
    status: { type: 'varchar', length: 20, default: 'draft' },
    signedAt: { type: 'timestamptz', nullable: true, fieldName: 'signed_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at' },
  },
  indexes: [
    { name: 'ix__marketplace_contracts__tenant_buyer', properties: ['tenantId', 'buyerUserId'] },
    { name: 'ix__marketplace_contracts__tenant_seller', properties: ['tenantId', 'sellerUserId'] },
  ],
});

export class AiConsultationEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  kind!: AiConsultationKind;
  question!: string;
  answer!: string;
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
    createdAt: { type: 'timestamptz', fieldName: 'created_at' },
  },
  indexes: [{ name: 'ix__marketplace_ai__tenant_user', properties: ['tenantId', 'userId'] }],
});
