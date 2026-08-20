// @requirements REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-ADVISORY-009 REQ-AGRITECH-INTEGRATION-013
import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import {
  isDeliveryTransitionAllowed,
  isPartnerApproved,
  isPilotTransitionAllowed,
  isProduceReservationAllowed,
} from '@app/backend-feature-agritech-shared';
import type {
  Advisory,
  AgriTechAnalytics,
  AgriTechOrderSummary,
  AgriTechOperationsRepository,
  AgriTechOwner,
  CreatePartnerInput,
  CreateProduceListingInput,
  Delivery,
  DeliveryStatus,
  FieldVisit,
  IntegrationReadiness,
  OperationResult,
  Partner,
  PartnerStatus,
  PilotCohort,
  PilotStatus,
  PriceDiscovery,
  ProduceGrade,
  ProduceListing,
  SupplierProductInput,
  SupplierProduct,
  UpdateSupplierProductInput,
  AssignedFarmer,
} from '@app/backend-feature-agritech-shared';
import { FarmerEntity } from '../entities/farmer.entity';
import { OrderEntity } from '../entities/order.entity';
import {
  AdvisoryEntity,
  AgriTechPartnerEntity,
  DeliveryEntity,
  FieldVisitEntity,
  IntegrationStateEntity,
  PaymentTransactionEntity,
  PilotCohortEntity,
  ProduceListingEntity,
} from '../entities/operations.entity';
import { ProductEntity } from '../entities/product.entity';
import { MarketplaceProduceOrganizationBindingEntity } from '../entities/marketplace-source-binding.entity';

const providers = ['click', 'payme', 'bnpl', 'weather', 'agronomy', 'agroportal', 'digital-agriculture'] as const;
const maximumMarketplaceUzs = 9_999_999_999_999;

@Injectable()
export class PostgresAgriTechOperationsRepository implements AgriTechOperationsRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async createPartner(owner: AgriTechOwner, input: CreatePartnerInput): Promise<OperationResult<Partner>> {
    const existing = await this.em.findOne(AgriTechPartnerEntity, {
      tenantId: owner.tenantId,
      kind: input.kind,
      taxId: input.taxId,
    });
    if (existing) {
      return { status: 'conflict', field: 'taxId' };
    }
    const entity = new AgriTechPartnerEntity();
    Object.assign(entity, input, { tenantId: owner.tenantId, ownerUserId: owner.userId });
    this.em.persist(entity);
    await this.em.flush();
    return { status: 'ok', value: toPartner(entity) };
  }

  async listOwnedPartners(owner: AgriTechOwner): Promise<Partner[]> {
    const rows = await this.em.find(
      AgriTechPartnerEntity,
      { tenantId: owner.tenantId, ownerUserId: owner.userId },
      { orderBy: { createdAt: 'DESC' } },
    );
    return rows.map(toPartner);
  }

  async listPartners(tenantId: string): Promise<Partner[]> {
    const rows = await this.em.find(AgriTechPartnerEntity, { tenantId }, { orderBy: { createdAt: 'DESC' } });
    return rows.map(toPartner);
  }

  async setPartnerStatus(
    owner: AgriTechOwner,
    partnerId: string,
    status: PartnerStatus,
  ): Promise<OperationResult<Partner>> {
    const entity = await this.em.findOne(AgriTechPartnerEntity, { tenantId: owner.tenantId, id: partnerId });
    if (!entity) {
      return { status: 'not_found' };
    }
    if (entity.status === status) {
      return { status: 'ok', value: toPartner(entity) };
    }
    if (entity.status === 'rejected' && status === 'approved') {
      return { status: 'invalid_state' };
    }
    entity.status = status;
    entity.reviewedBy = owner.userId;
    entity.reviewedAt = new Date();
    await this.em.flush();
    return { status: 'ok', value: toPartner(entity) };
  }

  async createSupplierProduct(
    owner: AgriTechOwner,
    input: SupplierProductInput,
  ): Promise<OperationResult<{ id: string }>> {
    const partner = await this.em.findOne(AgriTechPartnerEntity, {
      tenantId: owner.tenantId,
      id: input.partnerId,
      ownerUserId: owner.userId,
      kind: 'supplier',
    });
    if (!partner) {
      return { status: 'not_found' };
    }
    if (!isPartnerApproved(partner.status)) {
      return { status: 'partner_unapproved' };
    }
    const entity = new ProductEntity();
    Object.assign(entity, {
      tenantId: owner.tenantId,
      name: input.name,
      nameRu: input.nameRu ?? null,
      nameUz: input.nameUz ?? null,
      nameUzCyrl: input.nameUzCyrl ?? null,
      category: input.category,
      description: input.description,
      supplierId: partner.id,
      supplierName: partner.legalName,
      priceUzs: input.priceUzs,
      unit: input.unit,
      stockQuantity: input.stockQuantity,
      sampleAvailable: input.sampleAvailable ?? false,
      region: input.region,
      status: input.stockQuantity === 0 ? 'out_of_stock' : 'active',
      images: input.images ?? [],
    });
    this.em.persist(entity);
    await this.em.flush();
    return { status: 'ok', value: { id: entity.id } };
  }

  async listSupplierProducts(owner: AgriTechOwner): Promise<SupplierProduct[]> {
    const partners = await this.em.find(AgriTechPartnerEntity, {
      tenantId: owner.tenantId,
      ownerUserId: owner.userId,
      kind: 'supplier',
    });
    const partnerIds = partners.map((partner) => partner.id);
    if (partnerIds.length === 0) {
      return [];
    }
    const products = await this.em.find(
      ProductEntity,
      { tenantId: owner.tenantId, supplierId: { $in: partnerIds } },
      { orderBy: { createdAt: 'DESC' } },
    );
    return products.map(toSupplierProduct);
  }

  async updateSupplierProduct(
    owner: AgriTechOwner,
    productId: string,
    input: UpdateSupplierProductInput,
  ): Promise<OperationResult<SupplierProduct>> {
    return this.em.transactional(async (em) => {
      const product = await em.findOne(
        ProductEntity,
        { tenantId: owner.tenantId, id: productId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!product) {
        return { status: 'not_found' };
      }
      const partner = await em.findOne(
        AgriTechPartnerEntity,
        {
          tenantId: owner.tenantId,
          id: product.supplierId,
          ownerUserId: owner.userId,
          kind: 'supplier',
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      );
      if (!partner) {
        return { status: 'forbidden' };
      }
      if (!isPartnerApproved(partner.status)) {
        return { status: 'partner_unapproved' };
      }
      if (input.name !== undefined) {
        product.name = input.name;
      }
      if (input.nameRu !== undefined) {
        product.nameRu = input.nameRu;
      }
      if (input.nameUz !== undefined) {
        product.nameUz = input.nameUz;
      }
      if (input.nameUzCyrl !== undefined) {
        product.nameUzCyrl = input.nameUzCyrl;
      }
      product.priceUzs = input.priceUzs;
      product.stockQuantity = input.stockQuantity;
      if (input.sampleAvailable !== undefined) {
        product.sampleAvailable = input.sampleAvailable;
      }
      product.status = input.stockQuantity === 0 ? 'out_of_stock' : input.status;
      await em.flush();
      return { status: 'ok', value: toSupplierProduct(product) };
    });
  }

  async createProduceListing(
    owner: AgriTechOwner,
    input: CreateProduceListingInput,
  ): Promise<OperationResult<ProduceListing>> {
    if (input.availableUntil <= input.availableFrom) {
      return { status: 'invalid_state' };
    }
    if (
      !Number.isSafeInteger(input.pricePerKgUzs) ||
      input.pricePerKgUzs < 1 ||
      input.pricePerKgUzs > maximumMarketplaceUzs
    ) {
      return { status: 'invalid_state', field: 'pricePerKgUzs' };
    }
    return this.em.transactional(async (em) => {
      const farmer = await em.findOne(
        FarmerEntity,
        { tenantId: owner.tenantId, userId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_READ },
      );
      if (!farmer) {
        return { status: 'not_found' };
      }
      if (farmer.status !== 'active') {
        return { status: 'farmer_inactive' };
      }
      const partner = await em.findOne(
        AgriTechPartnerEntity,
        {
          id: input.supplierPartnerId,
          kind: 'supplier',
          ownerUserId: owner.userId,
          status: 'approved',
          tenantId: owner.tenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      );
      if (!partner) {
        return { status: 'partner_unapproved' };
      }
      const entity = new ProduceListingEntity();
      Object.assign(entity, {
        availableFrom: input.availableFrom,
        availableQuantityKg: input.quantityKg,
        availableUntil: input.availableUntil,
        crop: input.crop,
        farmerId: farmer.id,
        grade: input.grade,
        images: input.images ? [...input.images] : [],
        pricePerKgUzs: input.pricePerKgUzs,
        sampleAvailable: input.sampleAvailable ?? false,
        quantityKg: input.quantityKg,
        region: input.region,
        tenantId: owner.tenantId,
      });
      const binding = new MarketplaceProduceOrganizationBindingEntity();
      Object.assign(binding, {
        farmerId: farmer.id,
        ownerUserId: owner.userId,
        produceListingId: entity.id,
        supplierPartnerId: partner.id,
        tenantId: owner.tenantId,
      });
      em.persist([entity, binding]);
      await em.flush();
      return { status: 'ok', value: toProduce(entity) };
    });
  }

  async listProduce(
    tenantId: string,
    filter: { crop?: string; region?: string; grade?: ProduceGrade },
  ): Promise<ProduceListing[]> {
    const where: Record<string, unknown> = {
      tenantId,
      status: 'active',
      availableQuantityKg: { $gt: 0 },
      availableUntil: { $gt: new Date() },
    };
    if (filter.crop) {
      where['crop'] = filter.crop;
    }
    if (filter.region) {
      where['region'] = filter.region;
    }
    if (filter.grade) {
      where['grade'] = filter.grade;
    }
    const rows = await this.em.find(ProduceListingEntity, where, { orderBy: { createdAt: 'DESC' } });
    return rows.map(toProduce);
  }

  async discoverPrice(
    tenantId: string,
    filter: { crop: string; region: string; grade?: ProduceGrade },
  ): Promise<OperationResult<PriceDiscovery>> {
    const rows = await this.listProduce(tenantId, filter);
    if (rows.length === 0) {
      return { status: 'not_found' };
    }
    const prices = rows.map((row) => row.pricePerKgUzs).sort((left, right) => left - right);
    const middle = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 0 ? ((prices[middle - 1] ?? 0) + (prices[middle] ?? 0)) / 2 : (prices[middle] ?? 0);
    return {
      status: 'ok',
      value: {
        crop: filter.crop,
        region: filter.region,
        ...(filter.grade ? { grade: filter.grade } : {}),
        currency: 'UZS',
        unit: 'kg',
        minimumUzs: prices[0] ?? 0,
        medianUzs: median,
        maximumUzs: prices.at(-1) ?? 0,
        sampleSize: prices.length,
        observedAt: new Date(),
      },
    };
  }

  reserveProduce(
    owner: AgriTechOwner,
    listingId: string,
    input: { partnerId: string; quantityKg: number; deliveryAddress: string },
  ): Promise<OperationResult<{ orderId: string; totalAmountUzs: number }>> {
    return this.em.transactional(async (em) => {
      const partner = await em.findOne(AgriTechPartnerEntity, {
        tenantId: owner.tenantId,
        id: input.partnerId,
        ownerUserId: owner.userId,
        kind: 'buyer',
      });
      if (!partner) {
        return { status: 'not_found' };
      }
      if (!isPartnerApproved(partner.status)) {
        return { status: 'partner_unapproved' };
      }
      const listing = await em.findOne(
        ProduceListingEntity,
        { tenantId: owner.tenantId, id: listingId, status: 'active' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!listing) {
        return { status: 'not_found' };
      }
      if (
        !isProduceReservationAllowed({
          status: listing.status,
          availableQuantityKg: listing.availableQuantityKg,
          requestedQuantityKg: input.quantityKg,
          availableUntil: listing.availableUntil,
        })
      ) {
        return listing.availableQuantityKg < input.quantityKg
          ? { status: 'insufficient_quantity', field: 'quantityKg' }
          : { status: 'invalid_state', field: 'quantityKg' };
      }
      listing.availableQuantityKg -= input.quantityKg;
      if (listing.availableQuantityKg === 0) {
        listing.status = 'reserved';
      }
      const totalAmountUzs = Number(listing.pricePerKgUzs) * input.quantityKg;
      const order = new OrderEntity();
      Object.assign(order, {
        tenantId: owner.tenantId,
        userId: owner.userId,
        farmerId: listing.farmerId,
        kind: 'produce',
        buyerPartnerId: partner.id,
        produceListingId: listing.id,
        items: [
          {
            productId: listing.id,
            productName: `${listing.crop} Grade ${listing.grade}`,
            quantity: input.quantityKg,
            unitPriceUzs: Number(listing.pricePerKgUzs),
            totalUzs: totalAmountUzs,
          },
        ],
        totalAmountUzs,
        deliveryAddress: input.deliveryAddress,
        region: listing.region,
        status: 'confirmed',
        history: [{ status: 'confirmed', actorUserId: owner.userId, at: new Date().toISOString() }],
      });
      em.persist(order);
      await em.flush();
      return { status: 'ok', value: { orderId: order.id, totalAmountUzs } };
    });
  }

  async cancelProduceListing(owner: AgriTechOwner, listingId: string): Promise<OperationResult<ProduceListing>> {
    const farmer = await this.em.findOne(FarmerEntity, owner);
    if (!farmer) {
      return { status: 'not_found' };
    }
    const listing = await this.em.findOne(ProduceListingEntity, {
      tenantId: owner.tenantId,
      id: listingId,
      farmerId: farmer.id,
    });
    if (!listing) {
      return { status: 'not_found' };
    }
    if (listing.availableQuantityKg !== listing.quantityKg) {
      return { status: 'invalid_state' };
    }
    listing.status = 'cancelled';
    await this.em.flush();
    return { status: 'ok', value: toProduce(listing) };
  }

  async updateProduceSampleAvailability(
    owner: AgriTechOwner,
    listingId: string,
    sampleAvailable: boolean,
  ): Promise<OperationResult<ProduceListing>> {
    const farmer = await this.em.findOne(FarmerEntity, owner);
    if (!farmer) {
      return { status: 'not_found' };
    }
    const listing = await this.em.findOne(ProduceListingEntity, {
      farmerId: farmer.id,
      id: listingId,
      tenantId: owner.tenantId,
    });
    if (!listing) {
      return { status: 'not_found' };
    }
    listing.sampleAvailable = sampleAvailable;
    await this.em.flush();
    return { status: 'ok', value: toProduce(listing) };
  }

  async listAssignedFarmers(owner: AgriTechOwner): Promise<AssignedFarmer[]> {
    const rows = await this.em.find(
      FarmerEntity,
      { tenantId: owner.tenantId, fieldAgentUserId: owner.userId },
      { orderBy: { region: 'ASC', lastName: 'ASC' } },
    );
    return rows.map(toAssignedFarmer);
  }

  async listFarmers(tenantId: string): Promise<AssignedFarmer[]> {
    const rows = await this.em.find(FarmerEntity, { tenantId }, { orderBy: { createdAt: 'DESC' } });
    return rows.map(toAssignedFarmer);
  }

  async assignFarmer(
    owner: AgriTechOwner,
    farmerId: string,
    agentUserId: string,
  ): Promise<OperationResult<{ farmerId: string }>> {
    const farmer = await this.em.findOne(FarmerEntity, { tenantId: owner.tenantId, id: farmerId });
    if (!farmer) {
      return { status: 'not_found' };
    }
    farmer.fieldAgentUserId = agentUserId;
    await this.em.flush();
    return { status: 'ok', value: { farmerId } };
  }

  async setFarmerStatus(
    owner: AgriTechOwner,
    farmerId: string,
    status: 'active' | 'inactive' | 'pending_verification',
  ): Promise<OperationResult<{ farmerId: string; status: string }>> {
    const farmer = await this.em.findOne(FarmerEntity, { tenantId: owner.tenantId, id: farmerId });
    if (!farmer) {
      return { status: 'not_found' };
    }
    farmer.status = status;
    await this.em.flush();
    return { status: 'ok', value: { farmerId, status } };
  }

  async recordFieldVisit(
    owner: AgriTechOwner,
    input: { farmerId: string; notes: string; observedGrade?: ProduceGrade; observedAt: Date },
  ): Promise<OperationResult<FieldVisit>> {
    const farmer = await this.em.findOne(FarmerEntity, {
      tenantId: owner.tenantId,
      id: input.farmerId,
      fieldAgentUserId: owner.userId,
    });
    if (!farmer) {
      return { status: 'forbidden' };
    }
    const entity = new FieldVisitEntity();
    Object.assign(entity, input, {
      tenantId: owner.tenantId,
      agentUserId: owner.userId,
      observedGrade: input.observedGrade ?? null,
    });
    this.em.persist(entity);
    await this.em.flush();
    return { status: 'ok', value: toFieldVisit(entity) };
  }

  async listOrders(tenantId: string): Promise<AgriTechOrderSummary[]> {
    const rows = await this.em.find(OrderEntity, { tenantId }, { orderBy: { createdAt: 'DESC' } });
    return rows.map(toOrderSummary);
  }

  async scheduleDelivery(
    owner: AgriTechOwner,
    input: { orderId: string; agentUserId?: string; scheduledAt: Date },
  ): Promise<OperationResult<Delivery>> {
    const order = await this.em.findOne(OrderEntity, { tenantId: owner.tenantId, id: input.orderId });
    if (!order) {
      return { status: 'not_found' };
    }
    const existing = await this.em.findOne(DeliveryEntity, { tenantId: owner.tenantId, orderId: input.orderId });
    if (existing) {
      return { status: 'conflict', field: 'orderId' };
    }
    const entity = new DeliveryEntity();
    const status: DeliveryStatus = input.agentUserId ? 'assigned' : 'scheduled';
    Object.assign(entity, {
      tenantId: owner.tenantId,
      orderId: input.orderId,
      agentUserId: input.agentUserId ?? null,
      scheduledAt: input.scheduledAt,
      status,
      history: [{ status, actorUserId: owner.userId, at: new Date().toISOString() }],
    });
    this.em.persist(entity);
    await this.em.flush();
    return { status: 'ok', value: toDelivery(entity) };
  }

  async listDeliveries(owner: AgriTechOwner): Promise<Delivery[]> {
    const farmer = await this.em.findOne(FarmerEntity, owner);
    const orderWhere: Record<string, unknown> = { tenantId: owner.tenantId };
    orderWhere['$or'] = farmer ? [{ userId: owner.userId }, { farmerId: farmer.id }] : [{ userId: owner.userId }];
    const orders = await this.em.find(OrderEntity, orderWhere);
    const orderIds = orders.map((order) => order.id);
    const where: Record<string, unknown> = { tenantId: owner.tenantId };
    where['$or'] = [{ agentUserId: owner.userId }, ...(orderIds.length > 0 ? [{ orderId: { $in: orderIds } }] : [])];
    if ((where['$or'] as unknown[]).length === 0) {
      return [];
    }
    const rows = await this.em.find(DeliveryEntity, where, { orderBy: { scheduledAt: 'DESC' } });
    return rows.map(toDelivery);
  }

  transitionDelivery(
    owner: AgriTechOwner,
    deliveryId: string,
    input: { status: DeliveryStatus; proofReference?: string },
  ): Promise<OperationResult<Delivery>> {
    return this.em.transactional(async (em) => {
      const entity = await em.findOne(
        DeliveryEntity,
        { tenantId: owner.tenantId, id: deliveryId, agentUserId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!entity) {
        return { status: 'forbidden' };
      }
      if (!isDeliveryTransitionAllowed(entity.status, input.status, input.proofReference)) {
        return { status: 'invalid_state' };
      }
      entity.status = input.status;
      entity.proofReference = input.proofReference ?? entity.proofReference;
      entity.history = [
        ...entity.history,
        { status: input.status, actorUserId: owner.userId, at: new Date().toISOString() },
      ];
      if (input.status === 'delivered') {
        const order = await em.findOne(OrderEntity, { tenantId: owner.tenantId, id: entity.orderId });
        if (order) {
          order.status = 'delivered';
          order.history = [
            ...order.history,
            { status: 'delivered', actorUserId: owner.userId, at: new Date().toISOString() },
          ];
        }
      }
      await em.flush();
      return { status: 'ok', value: toDelivery(entity) };
    });
  }

  async publishAdvisory(
    owner: AgriTechOwner,
    input: {
      farmerId: string;
      kind: 'weather' | 'agronomy';
      source: string;
      summary: string;
      observedAt: Date;
      expiresAt: Date;
    },
  ): Promise<OperationResult<Advisory>> {
    if (input.expiresAt <= input.observedAt) {
      return { status: 'invalid_state' };
    }
    const farmer = await this.em.findOne(FarmerEntity, { tenantId: owner.tenantId, id: input.farmerId });
    if (!farmer) {
      return { status: 'not_found' };
    }
    const entity = new AdvisoryEntity();
    Object.assign(entity, input, { tenantId: owner.tenantId });
    this.em.persist(entity);
    await this.em.flush();
    return { status: 'ok', value: toAdvisory(entity) };
  }

  async listAdvisories(owner: AgriTechOwner): Promise<OperationResult<Advisory[]>> {
    const farmer = await this.em.findOne(FarmerEntity, owner);
    if (!farmer) {
      return { status: 'not_found' };
    }
    const rows = await this.em.find(
      AdvisoryEntity,
      { tenantId: owner.tenantId, farmerId: farmer.id },
      { orderBy: { observedAt: 'DESC' } },
    );
    return { status: 'ok', value: rows.map(toAdvisory) };
  }

  async analytics(tenantId: string): Promise<AgriTechAnalytics> {
    const [farmers, partners, activeInputProducts, activeProduceListings, orders] = await Promise.all([
      this.em.find(FarmerEntity, { tenantId }),
      this.em.find(AgriTechPartnerEntity, { tenantId }),
      this.em.find(ProductEntity, { tenantId, status: 'active' }),
      this.em.find(ProduceListingEntity, { tenantId, status: 'active' }),
      this.em.find(OrderEntity, { tenantId }),
    ]);
    const paidPayments = await this.em.find(PaymentTransactionEntity, { tenantId, state: 'paid' });
    const gmvUzs = paidPayments.reduce((sum, payment) => sum + Number(payment.amountUzs), 0);
    const commissionBasisPoints = configuredCommissionBasisPoints();
    const buyerOrderCounts = new Map<string, number>();
    for (const order of orders) {
      if (!order.buyerPartnerId) {
        continue;
      }
      buyerOrderCounts.set(order.buyerPartnerId, (buyerOrderCounts.get(order.buyerPartnerId) ?? 0) + 1);
    }
    const repeatBuyers = [...buyerOrderCounts.values()].filter((count) => count > 1).length;
    const deliveredOrders = orders.filter((order) => order.status === 'delivered').length;
    return {
      farmers: farmers.length,
      activeFarmers: farmers.filter((farmer) => farmer.status === 'active').length,
      pendingFarmers: farmers.filter((farmer) => farmer.status === 'pending_verification').length,
      partnerApplications: partners.length,
      pendingPartners: partners.filter((partner) => partner.status === 'pending').length,
      approvedSuppliers: partners.filter((partner) => partner.kind === 'supplier' && partner.status === 'approved')
        .length,
      approvedBuyers: partners.filter((partner) => partner.kind === 'buyer' && partner.status === 'approved').length,
      activeInputProducts: activeInputProducts.length,
      inputStockUnits: activeInputProducts.reduce((sum, product) => sum + product.stockQuantity, 0),
      activeProduceListings: activeProduceListings.length,
      produceAvailableKg: activeProduceListings.reduce((sum, listing) => sum + listing.availableQuantityKg, 0),
      orders: orders.length,
      deliveredOrders,
      fulfillmentRateBasisPoints: ratioBasisPoints(deliveredOrders, orders.length),
      paidPayments: paidPayments.length,
      repeatBuyers,
      repeatBuyerRateBasisPoints: ratioBasisPoints(repeatBuyers, buyerOrderCounts.size),
      gmvUzs,
      commissionBasisPoints,
      platformCommissionUzs: Math.round((gmvUzs * commissionBasisPoints) / 10_000),
    };
  }

  async createPilot(
    owner: AgriTechOwner,
    input: { name: string; targetFarmers: number; targetSuppliers: number; startsAt: Date; endsAt: Date },
  ): Promise<OperationResult<PilotCohort>> {
    if (input.endsAt <= input.startsAt) {
      return { status: 'invalid_state' };
    }
    const existing = await this.em.findOne(PilotCohortEntity, { tenantId: owner.tenantId, name: input.name });
    if (existing) {
      return { status: 'conflict', field: 'name' };
    }
    const entity = new PilotCohortEntity();
    Object.assign(entity, input, { tenantId: owner.tenantId });
    this.em.persist(entity);
    await this.em.flush();
    return { status: 'ok', value: await this.toPilot(entity) };
  }

  async listPilots(tenantId: string): Promise<PilotCohort[]> {
    const rows = await this.em.find(PilotCohortEntity, { tenantId }, { orderBy: { startsAt: 'DESC' } });
    return Promise.all(rows.map((row) => this.toPilot(row)));
  }

  async setPilotStatus(
    owner: AgriTechOwner,
    pilotId: string,
    status: PilotStatus,
  ): Promise<OperationResult<PilotCohort>> {
    const entity = await this.em.findOne(PilotCohortEntity, { tenantId: owner.tenantId, id: pilotId });
    if (!entity) {
      return { status: 'not_found' };
    }
    if (!isPilotTransitionAllowed(entity.status, status)) {
      return { status: 'invalid_state' };
    }
    entity.status = status;
    await this.em.flush();
    return { status: 'ok', value: await this.toPilot(entity) };
  }

  async integrationReadiness(tenantId: string): Promise<IntegrationReadiness[]> {
    const rows = await this.em.find(IntegrationStateEntity, { tenantId });
    const byProvider = new Map(rows.map((row) => [row.provider, row]));
    return providers.map((provider) => {
      const row = byProvider.get(provider);
      return {
        provider,
        status: row?.status ?? 'disabled',
        ...(row?.lastSuccessfulAt ? { lastSuccessfulAt: row.lastSuccessfulAt } : {}),
        ...(row?.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
      };
    });
  }

  private async toPilot(entity: PilotCohortEntity): Promise<PilotCohort> {
    const period = { $gte: entity.startsAt, $lte: entity.endsAt };
    const [actualFarmers, actualSuppliers, actualOrders, actualPaidPayments, actualDeliveries] = await Promise.all([
      this.em.count(FarmerEntity, { tenantId: entity.tenantId, createdAt: period }),
      this.em.count(AgriTechPartnerEntity, {
        tenantId: entity.tenantId,
        kind: 'supplier',
        status: 'approved',
        reviewedAt: period,
      }),
      this.em.count(OrderEntity, { tenantId: entity.tenantId, createdAt: period }),
      this.em.count(PaymentTransactionEntity, { tenantId: entity.tenantId, state: 'paid', updatedAt: period }),
      this.em.count(DeliveryEntity, { tenantId: entity.tenantId, status: 'delivered', updatedAt: period }),
    ]);
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      status: entity.status,
      targetFarmers: entity.targetFarmers,
      targetSuppliers: entity.targetSuppliers,
      startsAt: entity.startsAt,
      endsAt: entity.endsAt,
      actualFarmers,
      actualSuppliers,
      actualOrders,
      actualPaidPayments,
      actualDeliveries,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

const toPartner = (entity: AgriTechPartnerEntity): Partner => ({
  id: entity.id,
  tenantId: entity.tenantId,
  ownerUserId: entity.ownerUserId,
  kind: entity.kind,
  legalName: entity.legalName,
  taxId: entity.taxId,
  phone: entity.phone,
  region: entity.region,
  status: entity.status,
  ...(entity.reviewedBy ? { reviewedBy: entity.reviewedBy } : {}),
  ...(entity.reviewedAt ? { reviewedAt: entity.reviewedAt } : {}),
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

const toProduce = (entity: ProduceListingEntity): ProduceListing => ({
  id: entity.id,
  tenantId: entity.tenantId,
  farmerId: entity.farmerId,
  crop: entity.crop,
  grade: entity.grade,
  quantityKg: entity.quantityKg,
  availableQuantityKg: entity.availableQuantityKg,
  sampleAvailable: entity.sampleAvailable,
  pricePerKgUzs: Number(entity.pricePerKgUzs),
  region: entity.region,
  images: [...entity.images],
  availableFrom: entity.availableFrom,
  availableUntil: entity.availableUntil,
  status: entity.status,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

const toDelivery = (entity: DeliveryEntity): Delivery => ({
  id: entity.id,
  tenantId: entity.tenantId,
  orderId: entity.orderId,
  ...(entity.agentUserId ? { agentUserId: entity.agentUserId } : {}),
  status: entity.status,
  scheduledAt: entity.scheduledAt,
  ...(entity.proofReference ? { proofReference: entity.proofReference } : {}),
  history: entity.history,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

const toFieldVisit = (entity: FieldVisitEntity): FieldVisit => ({
  id: entity.id,
  tenantId: entity.tenantId,
  farmerId: entity.farmerId,
  agentUserId: entity.agentUserId,
  notes: entity.notes,
  ...(entity.observedGrade ? { observedGrade: entity.observedGrade } : {}),
  observedAt: entity.observedAt,
  createdAt: entity.createdAt,
});

const toAdvisory = (entity: AdvisoryEntity): Advisory => ({
  id: entity.id,
  tenantId: entity.tenantId,
  farmerId: entity.farmerId,
  kind: entity.kind,
  source: entity.source,
  summary: entity.summary,
  observedAt: entity.observedAt,
  expiresAt: entity.expiresAt,
  createdAt: entity.createdAt,
  stale: entity.expiresAt.getTime() <= Date.now(),
});

const toSupplierProduct = (entity: ProductEntity): SupplierProduct => ({
  id: entity.id,
  partnerId: entity.supplierId,
  name: entity.name,
  ...(entity.nameRu ? { nameRu: entity.nameRu } : {}),
  ...(entity.nameUz ? { nameUz: entity.nameUz } : {}),
  ...(entity.nameUzCyrl ? { nameUzCyrl: entity.nameUzCyrl } : {}),
  category: entity.category,
  description: entity.description,
  priceUzs: Number(entity.priceUzs),
  unit: entity.unit,
  stockQuantity: entity.stockQuantity,
  sampleAvailable: entity.sampleAvailable,
  region: entity.region,
  status: entity.status,
});

const toAssignedFarmer = (entity: FarmerEntity): AssignedFarmer => ({
  id: entity.id,
  userId: entity.userId,
  firstName: entity.firstName,
  lastName: entity.lastName,
  phone: entity.phone,
  region: entity.region,
  ...(entity.district ? { district: entity.district } : {}),
  crops: entity.crops,
  status: entity.status,
  ...(entity.fieldAgentUserId ? { fieldAgentUserId: entity.fieldAgentUserId } : {}),
});

const toOrderSummary = (entity: OrderEntity): AgriTechOrderSummary => ({
  id: entity.id,
  kind: entity.kind,
  ...(entity.buyerPartnerId ? { buyerPartnerId: entity.buyerPartnerId } : {}),
  ...(entity.produceListingId ? { produceListingId: entity.produceListingId } : {}),
  totalAmountUzs: Number(entity.totalAmountUzs),
  status: entity.status,
  deliveryAddress: entity.deliveryAddress,
  region: entity.region,
  createdAt: entity.createdAt,
});

const ratioBasisPoints = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : Math.round((numerator * 10_000) / denominator);

function configuredCommissionBasisPoints(): number {
  const raw = process.env['AGRITECH_COMMISSION_BASIS_POINTS'] ?? '800';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error('AGRITECH_COMMISSION_BASIS_POINTS must be an integer between 0 and 10000.');
  }
  return value;
}
