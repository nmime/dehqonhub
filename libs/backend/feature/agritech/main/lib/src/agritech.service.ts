import { Inject, Injectable } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import {
  AgriTechOperationsRepositoryInjectToken,
  type AgriTechOperationsRepository,
} from '@app/backend-feature-agritech-shared';
import { AgriTechNotificationPublisher } from './agritech-notification.publisher';
import { MarketplaceMediaService } from './marketplace-media.service';
import type {
  AgriTechOwner,
  CreatePartnerInput,
  CreateProduceListingInput,
  DeliveryStatus,
  OperationResult,
  PartnerStatus,
  PilotStatus,
  ProduceGrade,
  SupplierProductInput,
  UpdateSupplierProductInput,
} from '@app/backend-feature-agritech-shared';

@Injectable()
export class AgriTechOperationsService {
  constructor(
    @Inject(AgriTechOperationsRepositoryInjectToken)
    private readonly repository: AgriTechOperationsRepository,
    private readonly notifications: AgriTechNotificationPublisher,
    private readonly media: MarketplaceMediaService,
  ) {}

  async createPartner(owner: AgriTechOwner, input: CreatePartnerInput) {
    return unwrap(await this.repository.createPartner(owner, input), 'partner');
  }

  listOwnedPartners(owner: AgriTechOwner) {
    return this.repository.listOwnedPartners(owner);
  }

  /**
   * A listing may only carry photographs this account uploaded.
   *
   * The DTO already proved that every reference has one of the two accepted
   * shapes. This proves the other half: an uploaded reference must resolve to an
   * object this exact tenant and user own, so one seller cannot attach another
   * seller's photograph to their own listing by quoting its identifier. Library
   * paths belong to the deployment and pass through untouched.
   */
  async createSupplierProduct(owner: AgriTechOwner, input: SupplierProductInput) {
    await this.media.requireOwnedReferences(owner, input.images ?? [], 'images');
    return unwrap(await this.repository.createSupplierProduct(owner, input), 'supplier-product');
  }

  listSupplierProducts(owner: AgriTechOwner) {
    return this.repository.listSupplierProducts(owner);
  }

  async updateSupplierProduct(owner: AgriTechOwner, productId: string, input: UpdateSupplierProductInput) {
    return unwrap(await this.repository.updateSupplierProduct(owner, productId, input), 'supplier-product');
  }

  async createProduceListing(owner: AgriTechOwner, input: CreateProduceListingInput) {
    await this.media.requireOwnedReferences(owner, input.images ?? [], 'images');
    return unwrap(await this.repository.createProduceListing(owner, input), 'produce-listing');
  }

  async updateProduceSampleAvailability(owner: AgriTechOwner, listingId: string, sampleAvailable: boolean) {
    return unwrap(
      await this.repository.updateProduceSampleAvailability(owner, listingId, sampleAvailable),
      'produce-listing',
    );
  }

  listProduce(owner: AgriTechOwner, filter: { crop?: string; region?: string; grade?: ProduceGrade }) {
    return this.repository.listProduce(owner.tenantId, filter);
  }

  async discoverPrice(owner: AgriTechOwner, filter: { crop: string; region: string; grade?: ProduceGrade }) {
    return unwrap(await this.repository.discoverPrice(owner.tenantId, filter), 'produce-price');
  }

  async reserveProduce(
    owner: AgriTechOwner,
    listingId: string,
    input: { partnerId: string; quantityKg: number; deliveryAddress: string },
  ) {
    const reservation = unwrap(await this.repository.reserveProduce(owner, listingId, input), 'produce-listing');
    await this.notifications.produceReserved(reservation.orderId, owner.userId);
    return reservation;
  }

  async cancelProduceListing(owner: AgriTechOwner, listingId: string) {
    return unwrap(await this.repository.cancelProduceListing(owner, listingId), 'produce-listing');
  }

  listAssignedFarmers(owner: AgriTechOwner) {
    return this.repository.listAssignedFarmers(owner);
  }

  listFarmers(tenantId: string) {
    return this.repository.listFarmers(tenantId);
  }

  listDeliveries(owner: AgriTechOwner) {
    return this.repository.listDeliveries(owner);
  }

  async transitionDelivery(
    owner: AgriTechOwner,
    deliveryId: string,
    input: { status: DeliveryStatus; proofReference?: string },
  ) {
    return unwrap(await this.repository.transitionDelivery(owner, deliveryId, input), 'delivery');
  }

  async recordFieldVisit(
    owner: AgriTechOwner,
    input: { farmerId: string; notes: string; observedGrade?: ProduceGrade; observedAt: Date },
  ) {
    return unwrap(await this.repository.recordFieldVisit(owner, input), 'field-visit');
  }

  listOrders(tenantId: string) {
    return this.repository.listOrders(tenantId);
  }

  async listAdvisories(owner: AgriTechOwner) {
    return unwrap(await this.repository.listAdvisories(owner), 'advisory');
  }

  listPartners(tenantId: string) {
    return this.repository.listPartners(tenantId);
  }

  async setPartnerStatus(owner: AgriTechOwner, partnerId: string, status: PartnerStatus) {
    const partner = unwrap(await this.repository.setPartnerStatus(owner, partnerId, status), 'partner');
    await this.notifications.partnerStatus(partner);
    return partner;
  }

  async assignFarmer(owner: AgriTechOwner, farmerId: string, agentUserId: string) {
    const assignment = unwrap(await this.repository.assignFarmer(owner, farmerId, agentUserId), 'farmer-profile');
    const farmer = (await this.repository.listFarmers(owner.tenantId)).find((candidate) => candidate.id === farmerId);
    if (farmer) {
      await this.notifications.farmerAssigned(farmer, agentUserId);
    }
    return assignment;
  }

  async setFarmerStatus(
    owner: AgriTechOwner,
    farmerId: string,
    status: 'active' | 'inactive' | 'pending_verification',
  ) {
    return unwrap(await this.repository.setFarmerStatus(owner, farmerId, status), 'farmer-profile');
  }

  async scheduleDelivery(owner: AgriTechOwner, input: { orderId: string; agentUserId?: string; scheduledAt: Date }) {
    const delivery = unwrap(await this.repository.scheduleDelivery(owner, input), 'delivery');
    await this.notifications.deliveryScheduled(delivery);
    return delivery;
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
  ) {
    const advisory = unwrap(await this.repository.publishAdvisory(owner, input), 'advisory');
    const farmer = (await this.repository.listFarmers(owner.tenantId)).find(
      (candidate) => candidate.id === input.farmerId,
    );
    if (farmer) {
      await this.notifications.advisoryPublished(advisory, farmer.userId);
    }
    return advisory;
  }

  analytics(tenantId: string) {
    return this.repository.analytics(tenantId);
  }

  async createPilot(
    owner: AgriTechOwner,
    input: { name: string; targetFarmers: number; targetSuppliers: number; startsAt: Date; endsAt: Date },
  ) {
    return unwrap(await this.repository.createPilot(owner, input), 'pilot-cohort');
  }

  listPilots(tenantId: string) {
    return this.repository.listPilots(tenantId);
  }

  async setPilotStatus(owner: AgriTechOwner, pilotId: string, status: PilotStatus) {
    return unwrap(await this.repository.setPilotStatus(owner, pilotId, status), 'pilot-cohort');
  }

  integrationReadiness(tenantId: string) {
    return this.repository.integrationReadiness(tenantId);
  }
}

function unwrap<T>(result: OperationResult<T>, resource: string): T {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(resource);
  }
  if (result.status === 'forbidden' || result.status === 'partner_unapproved') {
    throw new ForbiddenException();
  }
  if (result.status === 'conflict' || result.status === 'insufficient_quantity') {
    throw new ConflictException(resource, result.field ?? result.status);
  }
  throw new BadRequestException();
}
