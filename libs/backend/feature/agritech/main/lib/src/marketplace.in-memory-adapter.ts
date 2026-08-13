import {
  canBuyInMarketplace,
  canOfferInMarketplace,
  isRequestTransitionAllowed,
  isVerificationReviewReasonValid,
  type AddCartItemInput,
  type AgriTechOwner,
  type BuyerRequest,
  type Cart,
  type CheckoutCartInput,
  type CheckoutCartResult,
  type Contract,
  type ContractDeliveryQuoteInput,
  type ContractLine,
  type CreateBuyerRequestInput,
  type CreateRequestOfferInput,
  type DeliveryTerms,
  type MarketplacePartySnapshot,
  type MarketplaceRepository,
  type OfferSelectionResult,
  type OperationResult,
  type RequestOffer,
  type Verification,
  type VerificationRejectionReason,
  type VerificationRole,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceDomainService } from './marketplace.domain-service';

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });

const missing = <T>(field?: string): OperationResult<T> => ({
  status: 'not_found',
  ...(field ? { field } : {}),
});

const actorKey = ({ tenantId, userId }: AgriTechOwner): string => `${tenantId}:${userId}`;
const productKey = (tenantId: string, productId: string): string => `${tenantId}:${productId}`;
const organizationKey = (owner: AgriTechOwner, kind: 'buyer' | 'supplier'): string => `${actorKey(owner)}:${kind}`;
const membershipKey = (owner: AgriTechOwner, partnerId: string, capability: 'buyer' | 'seller'): string =>
  `${actorKey(owner)}:${partnerId}:${capability}`;

const cloneVerification = (verification: Verification): Verification => ({
  ...verification,
  /* v8 ignore next -- verification documents are written by the verification repository, never by this in-memory marketplace fixture. */
  documents: verification.documents.map((document) => ({ ...document })),
  reviewedAt: verification.reviewedAt ? new Date(verification.reviewedAt) : undefined,
  createdAt: new Date(verification.createdAt),
  updatedAt: new Date(verification.updatedAt),
});

const cloneCart = (cart: Cart): Cart => ({
  ...cart,
  items: cart.items.map((item) => ({ ...item })),
  seller: { ...cart.seller },
  createdAt: new Date(cart.createdAt),
  updatedAt: new Date(cart.updatedAt),
});

const cloneRequest = (request: BuyerRequest): BuyerRequest => ({
  ...request,
  createdAt: new Date(request.createdAt),
  updatedAt: new Date(request.updatedAt),
});

const cloneOffer = (offer: RequestOffer): RequestOffer => ({
  id: offer.id,
  requestPublicId: offer.requestPublicId,
  buyerTenantId: offer.buyerTenantId,
  buyerUserId: offer.buyerUserId,
  buyerPartnerId: offer.buyerPartnerId,
  sellerTenantId: offer.sellerTenantId,
  sellerUserId: offer.sellerUserId,
  sellerPartnerId: offer.sellerPartnerId,
  seller: { ...offer.seller },
  priceUzs: offer.priceUzs,
  deliveryTerms: offer.deliveryTerms,
  deliveryPriceUzs: offer.deliveryPriceUzs,
  deliveryNote: offer.deliveryNote,
  deliveryDays: offer.deliveryDays,
  status: offer.status,
  createdAt: new Date(offer.createdAt),
});

const cloneContract = (contract: Contract): Contract => ({
  ...contract,
  lines: contract.lines.map((line) => ({ ...line })),
  /* v8 ignore start -- contract signatures are written by the lifecycle repository, so a contract built here never carries signature timestamps. */
  buyerSignedAt: contract.buyerSignedAt ? new Date(contract.buyerSignedAt) : undefined,
  sellerSignedAt: contract.sellerSignedAt ? new Date(contract.sellerSignedAt) : undefined,
  signedAt: contract.signedAt ? new Date(contract.signedAt) : undefined,
  /* v8 ignore stop */
  createdAt: new Date(contract.createdAt),
  updatedAt: new Date(contract.updatedAt),
});

export interface MarketplaceInMemoryProductInput {
  tenantId: string;
  productId: string;
  listingPublicationId?: string;
  sellerPartnerId?: string;
  sellerId: string;
  sellerUserId: string;
  sellerLegalName?: string;
  sellerRegion?: string;
  name: string;
  unit: string;
  unitPriceUzs: number;
  stockQuantity: number;
}

interface StoredProduct extends MarketplaceInMemoryProductInput {
  contentRevision: number;
  listingPublicationId: string;
  sellerPartnerId: string;
  status: 'active' | 'out_of_stock';
}

interface InMemoryOrganization {
  kind: 'buyer' | 'supplier';
  legalName: string;
  ownerUserId: string;
  partnerId: string;
  region: string;
  status: 'approved' | 'suspended';
  tenantId: string;
}

interface InMemoryMembership {
  capability: 'buyer' | 'seller';
  partnerId: string;
  status: 'active' | 'revoked';
  tenantId: string;
  userId: string;
}

interface InMemoryListingPublication {
  id: string;
  moderationStatus: 'approved' | 'rejected';
  productKey: string;
  status: 'published' | 'paused';
}

interface InMemoryRequestPublication {
  buyerPartnerId: string;
  buyerTenantId: string;
  buyerUserId: string;
  contentRevision: number;
  id: string;
  moderationStatus: 'approved' | 'rejected';
  requestId: string;
  status: 'published' | 'paused';
}

interface StoredOffer extends RequestOffer {
  requestId: string;
}

interface InMemoryContractDraftInput {
  amountUzs: number;
  buyerPartnerId: string;
  buyerPartySnapshot: MarketplacePartySnapshot;
  buyerTenantId: string;
  buyerUserId: string;
  deliveryDays?: number;
  deliveryNote?: string;
  deliveryPriceUzs?: number;
  deliveryTerms: DeliveryTerms;
  lines: ContractLine[];
  sellerPartnerId: string;
  sellerPartySnapshot: MarketplacePartySnapshot;
  sellerTenantId: string;
  sellerUserId: string;
  sourceId: string;
  sourceType: 'cart_checkout' | 'offer_selection';
  subject: string;
}

function canonicalValue(value: unknown): unknown {
  /* v8 ignore next 3 -- no marketplace command input carries an array, so the idempotency fingerprint never canonicalizes one. */
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function cloneOperationResult<T>(result: OperationResult<T>): OperationResult<T> {
  return structuredClone(result);
}

function offerValidationField(
  priceUzs: number,
  deliveryTerms: DeliveryTerms,
  deliveryPriceUzs?: number,
  deliveryDays?: number,
): string | undefined {
  if (priceUzs <= 0) {
    return 'priceUzs';
  }
  if (deliveryTerms === 'seller_delivery') {
    if (deliveryPriceUzs === undefined || deliveryPriceUzs <= 0) {
      return 'deliveryPriceUzs';
    }
  } else if (deliveryPriceUzs !== undefined) {
    return 'deliveryPriceUzs';
  }
  return deliveryDays !== undefined && deliveryDays <= 0 ? 'deliveryDays' : undefined;
}

class InMemoryMarketplaceRepository implements MarketplaceRepository {
  private readonly verifications = new Map<string, Verification>();
  private readonly approvedOrganizations = new Set<string>();
  private readonly organizations = new Map<string, InMemoryOrganization>();
  private readonly memberships = new Map<string, InMemoryMembership>();
  private readonly products = new Map<string, StoredProduct>();
  private readonly listingPublications = new Map<string, InMemoryListingPublication>();
  private readonly carts = new Map<string, Cart>();
  private readonly requests = new Map<string, BuyerRequest>();
  private readonly requestPublications = new Map<string, InMemoryRequestPublication>();
  private readonly offers = new Map<string, StoredOffer>();
  private readonly contracts = new Map<string, Contract>();
  private readonly operationReceipts = new Map<string, { fingerprint: string; result: OperationResult<unknown> }>();
  private sequence = 0;

  registerVerifiedActor(owner: AgriTechOwner, role: VerificationRole): Verification {
    return this.registerActor(owner, role, 'verified');
  }

  /** Seeds the actor a moderator still has to decide on, so {@link reviewVerification} has a case. */
  registerPendingActor(owner: AgriTechOwner, role: VerificationRole): Verification {
    return this.registerActor(owner, role, 'pending');
  }

  private registerActor(owner: AgriTechOwner, role: VerificationRole, status: 'pending' | 'verified'): Verification {
    const now = this.now();
    const verification: Verification = {
      caseRevision: 0,
      id: this.nextId('verification'),
      tenantId: owner.tenantId,
      userId: owner.userId,
      role,
      level: status === 'verified' ? 'verified' : 'basic',
      status,
      oneIdLinked: false,
      providerMode: 'none',
      identityAssurance: 'none',
      version: 0,
      documents: [],
      createdAt: now,
      updatedAt: now,
    };
    this.verifications.set(actorKey(owner), verification);
    return cloneVerification(verification);
  }

  registerApprovedOrganization(
    owner: AgriTechOwner,
    kind: 'buyer' | 'supplier',
    partnerId = `${kind}-${owner.tenantId}-${owner.userId}`,
    profile: { legalName?: string; region?: string } = {},
  ): string {
    this.approvedOrganizations.add(organizationKey(owner, kind));
    this.organizations.set(partnerId, {
      kind,
      legalName: profile.legalName ?? `${kind === 'buyer' ? 'Buyer' : 'Supplier'} ${owner.userId}`,
      ownerUserId: owner.userId,
      partnerId,
      region: profile.region ?? 'Samarkand',
      status: 'approved',
      tenantId: owner.tenantId,
    });
    this.registerPartnerMembership(owner, partnerId, kind === 'buyer' ? 'buyer' : 'seller');
    return partnerId;
  }

  registerPartnerMembership(owner: AgriTechOwner, partnerId: string, capability: 'buyer' | 'seller'): void {
    const organization = this.organizations.get(partnerId);
    if (
      !organization ||
      organization.tenantId !== owner.tenantId ||
      (capability === 'buyer' ? organization.kind !== 'buyer' : organization.kind !== 'supplier')
    ) {
      throw new Error('In-memory marketplace membership must match its tenant-scoped organization');
    }
    this.memberships.set(membershipKey(owner, partnerId, capability), {
      capability,
      partnerId,
      status: 'active',
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
  }

  revokePartnerMembership(owner: AgriTechOwner, partnerId: string, capability: 'buyer' | 'seller'): void {
    const membership = this.memberships.get(membershipKey(owner, partnerId, capability));
    if (membership) {
      membership.status = 'revoked';
    }
  }

  setOrganizationStatus(partnerId: string, status: 'approved' | 'suspended'): void {
    const organization = this.organizations.get(partnerId);
    if (organization) {
      organization.status = status;
    }
  }

  registerProduct(input: MarketplaceInMemoryProductInput): string {
    if (input.stockQuantity <= 0 || input.unitPriceUzs <= 0) {
      throw new Error('In-memory marketplace products require positive stock and price');
    }
    const sellerPartnerId =
      input.sellerPartnerId ??
      this.activePartnerFor({ tenantId: input.tenantId, userId: input.sellerUserId }, 'seller');
    const organization = sellerPartnerId ? this.organizations.get(sellerPartnerId) : undefined;
    if (!sellerPartnerId || !organization || organization.kind !== 'supplier' || organization.status !== 'approved') {
      throw new Error('In-memory marketplace products require an approved seller organization membership');
    }
    const listingPublicationId = input.listingPublicationId ?? `listing-${input.productId}`;
    const storedProductKey = productKey(input.tenantId, input.productId);
    this.products.set(storedProductKey, {
      ...input,
      contentRevision: 1,
      listingPublicationId,
      sellerPartnerId,
      status: 'active',
    });
    this.listingPublications.set(listingPublicationId, {
      id: listingPublicationId,
      moderationStatus: 'approved',
      productKey: storedProductKey,
      status: 'published',
    });
    return listingPublicationId;
  }

  requestPublicIdFor(requestId: string): string | undefined {
    return [...this.requestPublications.values()].find((publication) => publication.requestId === requestId)?.id;
  }

  getVerification(owner: AgriTechOwner): Promise<Verification | undefined> {
    const verification = this.verifications.get(actorKey(owner));
    return Promise.resolve(verification ? cloneVerification(verification) : undefined);
  }

  reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    expectedRevision: number,
    idempotencyKey: string,
    reason?: VerificationRejectionReason,
  ): Promise<OperationResult<Verification>> {
    /* v8 ignore next 3 -- MarketplaceDomainService rejects an invalid decision and reason pair before the repository is reached. */
    if (!isVerificationReviewReasonValid(decision, reason)) {
      return Promise.resolve({ status: 'invalid_state', field: 'reason' });
    }
    return Promise.resolve(
      this.executeIdempotent(
        { tenantId, userId: reviewedBy },
        'verification_review',
        verificationId,
        idempotencyKey,
        { decision, expectedRevision, ...(reason ? { reason } : {}) },
        () => {
          const verification = [...this.verifications.values()].find(
            (candidate) => candidate.tenantId === tenantId && candidate.id === verificationId,
          );
          if (!verification) {
            return missing();
          }
          if (verification.version !== expectedRevision) {
            return { status: 'conflict', field: 'expectedRevision' };
          }
          if (verification.status !== 'pending') {
            return { status: 'conflict', field: 'status' };
          }
          const now = this.now();
          verification.status = decision;
          verification.reviewedBy = reviewedBy;
          verification.reviewedAt = now;
          verification.rejectionReason = decision === 'rejected' ? reason : undefined;
          verification.updatedAt = now;
          verification.version += 1;
          return ok(cloneVerification(verification));
        },
      ),
    );
  }

  listVerifications(tenantId: string): Promise<Verification[]> {
    return Promise.resolve(
      [...this.verifications.values()]
        .filter((verification) => verification.tenantId === tenantId)
        .map(cloneVerification),
    );
  }

  /*
   * Repository contract member that no marketplace command consults any more:
   * per-partner membership authorization replaced the tenant-wide organization
   * check, and `marketplace.service.spec.ts` asserts it stays unconsulted.
   */
  /* v8 ignore next 3 */
  isApprovedOrganization(owner: AgriTechOwner, kind: 'buyer' | 'supplier'): Promise<boolean> {
    return Promise.resolve(this.approvedOrganizations.has(organizationKey(owner, kind)));
  }

  getCart(owner: AgriTechOwner, cartId: string): Promise<Cart | undefined> {
    const cart = this.carts.get(cartId);
    if (!cart || cart.buyerTenantId !== owner.tenantId || cart.buyerUserId !== owner.userId) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(cloneCart(cart));
  }

  listCarts(owner: AgriTechOwner): Promise<Cart[]> {
    return Promise.resolve(
      [...this.carts.values()]
        .filter(
          (cart) =>
            cart.buyerTenantId === owner.tenantId && cart.buyerUserId === owner.userId && cart.status === 'open',
        )
        .map(cloneCart),
    );
  }

  addToCart(owner: AgriTechOwner, item: AddCartItemInput, idempotencyKey: string): Promise<OperationResult<Cart>> {
    return Promise.resolve(
      this.executeIdempotent(owner, 'cart_add', item.listingPublicationId, idempotencyKey, item, () => {
        const buyerOrganization = this.authorizedOrganization(owner, item.actingPartnerId, 'buyer');
        if (!buyerOrganization) {
          return { status: 'forbidden', field: 'organization' };
        }
        const product = this.resolveListing(item.listingPublicationId);
        if (!product) {
          return missing('listingPublicationId');
        }
        const sellerOrganization = this.organizations.get(product.sellerPartnerId);
        /* v8 ignore next 3 -- resolveListing() already required an approved seller organization for this listing. */
        if (!sellerOrganization) {
          return missing('listingPublicationId');
        }
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          return { status: 'invalid_state', field: 'quantity' };
        }
        /* v8 ignore next 3 -- a partner id is either a buyer or a supplier organization, so the acting buyer partner is never the listing's seller. */
        if (product.tenantId === owner.tenantId && product.sellerPartnerId === item.actingPartnerId) {
          return { status: 'forbidden', field: 'organization' };
        }

        let cart = [...this.carts.values()].find(
          (candidate) =>
            candidate.buyerTenantId === owner.tenantId &&
            candidate.buyerUserId === owner.userId &&
            candidate.buyerPartnerId === item.actingPartnerId &&
            candidate.sellerTenantId === product.tenantId &&
            candidate.sellerPartnerId === product.sellerPartnerId &&
            candidate.status === 'open',
        );
        const existing = cart?.items.find((candidate) => candidate.listingPublicationId === item.listingPublicationId);
        const nextQuantity = (existing?.quantity ?? 0) + item.quantity;
        if (nextQuantity > product.stockQuantity) {
          return { status: 'conflict', field: 'stockQuantity' };
        }

        if (!cart) {
          const now = this.now();
          cart = {
            buyerPartnerId: buyerOrganization.partnerId,
            buyerTenantId: owner.tenantId,
            buyerUserId: owner.userId,
            createdAt: now,
            id: this.nextId('cart'),
            items: [],
            seller: {
              displayName: sellerOrganization.legalName,
              region: sellerOrganization.region,
            },
            sellerPartnerId: product.sellerPartnerId,
            sellerTenantId: product.tenantId,
            sellerUserId: product.sellerUserId,
            status: 'open',
            updatedAt: now,
          };
          this.carts.set(cart.id, cart);
        }
        if (existing) {
          existing.quantity = nextQuantity;
        } else {
          cart.items.push({
            listingPublicationId: item.listingPublicationId,
            quantity: item.quantity,
            sourceId: product.productId,
            sourceKind: 'product',
          });
        }
        cart.updatedAt = this.now();
        return ok(cloneCart(cart));
      }),
    );
  }

  updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<OperationResult<Cart>> {
    return Promise.resolve(
      this.executeIdempotent(
        owner,
        'cart_update',
        `${cartId}:${listingPublicationId}`,
        idempotencyKey,
        { quantity },
        () => this.mutateCartItem(owner, cartId, listingPublicationId, quantity),
      ),
    );
  }

  removeCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<Cart>> {
    return Promise.resolve(
      this.executeIdempotent(owner, 'cart_remove', `${cartId}:${listingPublicationId}`, idempotencyKey, {}, () =>
        this.mutateCartItem(owner, cartId, listingPublicationId, 0),
      ),
    );
  }

  checkoutCart(
    owner: AgriTechOwner,
    cartId: string,
    input: CheckoutCartInput,
    idempotencyKey: string,
  ): Promise<OperationResult<CheckoutCartResult>> {
    return Promise.resolve(
      this.executeIdempotent(owner, 'cart_checkout', cartId, idempotencyKey, input, () => {
        const cart = this.carts.get(cartId);
        if (
          !cart ||
          cart.buyerTenantId !== owner.tenantId ||
          cart.buyerUserId !== owner.userId ||
          cart.status !== 'open'
        ) {
          return missing();
        }
        const buyerOrganization = this.authorizedOrganization(owner, cart.buyerPartnerId, 'buyer');
        if (!buyerOrganization) {
          return { status: 'forbidden', field: 'organization' };
        }
        if (cart.items.length === 0) {
          return { status: 'invalid_state', field: 'items' };
        }

        const products = cart.items.map((item) => this.resolveListing(item.listingPublicationId));
        if (
          products.some(
            (product) =>
              !product ||
              product.tenantId !== cart.sellerTenantId ||
              product.sellerPartnerId !== cart.sellerPartnerId ||
              product.sellerUserId !== cart.sellerUserId,
          )
        ) {
          return missing('listingPublicationId');
        }
        const sellerOrganization = this.organizations.get(cart.sellerPartnerId);
        /* v8 ignore next 12 -- resolveListing() already required this seller organization to be approved, staffed by an active member, and allowed to sell. */
        if (
          !sellerOrganization ||
          sellerOrganization.status !== 'approved' ||
          !this.isActiveMember(
            { tenantId: cart.sellerTenantId, userId: cart.sellerUserId },
            cart.sellerPartnerId,
            'seller',
          ) ||
          !canOfferInMarketplace(this.roleFor(cart.sellerTenantId, cart.sellerUserId))
        ) {
          return { status: 'forbidden', field: 'organization' };
        }

        const lines: ContractLine[] = [];
        for (const [index, item] of cart.items.entries()) {
          const product = products[index];
          /* v8 ignore next 3 -- the products.some() check above already rejected an unresolvable line; this guard only narrows the type. */
          if (!product) {
            return missing('listingPublicationId');
          }
          if (item.quantity <= 0 || item.quantity > product.stockQuantity) {
            return { status: 'conflict', field: 'stockQuantity' };
          }
          lines.push({
            lineTotalUzs: product.unitPriceUzs * item.quantity,
            name: product.name,
            quantity: item.quantity,
            sourceId: product.productId,
            sourceKind: 'product',
            sourcePublicationId: product.listingPublicationId,
            sourceRevision: product.contentRevision,
            unit: product.unit,
            unitPriceUzs: product.unitPriceUzs,
          });
        }
        const amountUzs = lines.reduce((total, line) => total + line.lineTotalUzs, 0);
        /* v8 ignore next 3 -- every listing carries a positive unit price and every line a positive quantity, so the total is never zero. */
        if (amountUzs <= 0) {
          return { status: 'invalid_state', field: 'amountUzs' };
        }

        const contract = this.createDraftContract({
          amountUzs,
          buyerPartnerId: cart.buyerPartnerId,
          buyerPartySnapshot: this.partySnapshot(buyerOrganization, owner.userId),
          buyerTenantId: cart.buyerTenantId,
          buyerUserId: cart.buyerUserId,
          deliveryPriceUzs: input.deliveryTerms === 'pickup' ? 0 : undefined,
          deliveryTerms: input.deliveryTerms,
          lines,
          sellerPartnerId: cart.sellerPartnerId,
          sellerPartySnapshot: this.partySnapshot(sellerOrganization, cart.sellerUserId),
          sellerTenantId: cart.sellerTenantId,
          sellerUserId: cart.sellerUserId,
          sourceId: cart.id,
          sourceType: 'cart_checkout',
          subject: lines
            .map((line) => line.name)
            .join(', ')
            .slice(0, 300),
        });
        cart.status = 'ordered';
        cart.updatedAt = this.now();
        this.contracts.set(contract.id, contract);
        return ok({ cartId: cart.id, contractId: contract.id });
      }),
    );
  }

  createRequest(
    owner: AgriTechOwner,
    input: CreateBuyerRequestInput,
    idempotencyKey: string,
  ): Promise<OperationResult<BuyerRequest>> {
    return Promise.resolve(
      this.executeIdempotent(owner, 'request_create', 'new', idempotencyKey, input, () => {
        const buyerOrganization = this.authorizedOrganization(owner, input.actingPartnerId, 'buyer');
        if (!buyerOrganization) {
          return { status: 'forbidden', field: 'organization' };
        }
        const { actingPartnerId, ...requestInput } = input;
        const now = this.now();
        const request: BuyerRequest = {
          ...requestInput,
          buyerPartnerId: actingPartnerId,
          buyerUserId: owner.userId,
          createdAt: now,
          id: this.nextId('request'),
          status: 'open',
          tenantId: owner.tenantId,
          updatedAt: now,
        };
        this.requests.set(request.id, request);
        const publicationId = this.nextId('request-publication');
        this.requestPublications.set(publicationId, {
          buyerPartnerId: actingPartnerId,
          buyerTenantId: owner.tenantId,
          buyerUserId: owner.userId,
          contentRevision: 1,
          id: publicationId,
          moderationStatus: 'approved',
          requestId: request.id,
          status: 'published',
        });
        return ok(cloneRequest(request));
      }),
    );
  }

  listRequests(tenantId: string, status?: string): Promise<BuyerRequest[]> {
    return Promise.resolve(
      [...this.requests.values()]
        .filter(
          (request) => request.tenantId === tenantId && (!status || status === 'all' || request.status === status),
        )
        .map(cloneRequest),
    );
  }

  listMyRequests(owner: AgriTechOwner): Promise<BuyerRequest[]> {
    return Promise.resolve(
      [...this.requests.values()]
        .filter((request) => request.tenantId === owner.tenantId && request.buyerUserId === owner.userId)
        .map(cloneRequest),
    );
  }

  makeOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    input: CreateRequestOfferInput,
    idempotencyKey: string,
  ): Promise<OperationResult<RequestOffer>> {
    return Promise.resolve(
      this.executeIdempotent(owner, 'offer_create', requestPublicId, idempotencyKey, input, () => {
        const sellerOrganization = this.authorizedOrganization(owner, input.actingPartnerId, 'seller');
        if (!sellerOrganization) {
          return { status: 'forbidden', field: 'organization' };
        }
        const publication = this.requestPublications.get(requestPublicId);
        if (!publication || publication.status !== 'published' || publication.moderationStatus !== 'approved') {
          return missing();
        }
        const request = this.requests.get(publication.requestId);
        /* v8 ignore next 8 -- a request and its publication are written together and never diverge. */
        if (
          !request ||
          request.tenantId !== publication.buyerTenantId ||
          request.buyerUserId !== publication.buyerUserId ||
          request.buyerPartnerId !== publication.buyerPartnerId
        ) {
          return missing();
        }
        if (!['open', 'offering'].includes(request.status)) {
          return { status: 'invalid_state' };
        }
        /* v8 ignore next 5 -- a partner id is either a buyer or a supplier organization, so only the buyer user branch of this self-dealing guard can fire. */
        if (
          publication.buyerTenantId === owner.tenantId &&
          (publication.buyerUserId === owner.userId || publication.buyerPartnerId === input.actingPartnerId)
        ) {
          return { status: 'forbidden', field: 'organization' };
        }
        const invalidField = offerValidationField(
          input.priceUzs,
          input.deliveryTerms,
          input.deliveryPriceUzs,
          input.deliveryDays,
        );
        if (invalidField) {
          return { status: 'invalid_state', field: invalidField };
        }
        /* v8 ignore next 3 -- only open and offering requests reach here, and both allow the transition to offering. */
        if (!isRequestTransitionAllowed(request.status, 'offering')) {
          return { status: 'invalid_state' };
        }

        const offer: StoredOffer = {
          buyerPartnerId: publication.buyerPartnerId,
          buyerTenantId: publication.buyerTenantId,
          buyerUserId: publication.buyerUserId,
          createdAt: this.now(),
          deliveryDays: input.deliveryDays,
          deliveryNote: input.deliveryNote,
          deliveryPriceUzs: input.deliveryPriceUzs,
          deliveryTerms: input.deliveryTerms,
          id: this.nextId('offer'),
          priceUzs: input.priceUzs,
          requestId: request.id,
          requestPublicId,
          seller: {
            displayName: sellerOrganization.legalName,
            region: sellerOrganization.region,
          },
          sellerPartnerId: input.actingPartnerId,
          sellerTenantId: owner.tenantId,
          sellerUserId: owner.userId,
          status: 'pending',
        };
        request.status = 'offering';
        request.updatedAt = this.now();
        this.offers.set(offer.id, offer);
        return ok(cloneOffer(offer));
      }),
    );
  }

  listOffers(owner: AgriTechOwner, requestPublicId: string): Promise<OperationResult<RequestOffer[]>> {
    const publication = this.requestPublications.get(requestPublicId);
    if (
      !publication ||
      publication.status !== 'published' ||
      publication.moderationStatus !== 'approved' ||
      publication.buyerTenantId !== owner.tenantId ||
      publication.buyerUserId !== owner.userId ||
      !this.authorizedOrganization(owner, publication.buyerPartnerId, 'buyer')
    ) {
      return Promise.resolve(missing());
    }
    const request = this.requests.get(publication.requestId);
    /* v8 ignore next 8 -- a request and its publication are written together and never diverge. */
    if (
      !request ||
      request.tenantId !== publication.buyerTenantId ||
      request.buyerUserId !== publication.buyerUserId ||
      request.buyerPartnerId !== publication.buyerPartnerId
    ) {
      return Promise.resolve(missing());
    }
    return Promise.resolve(
      ok(
        [...this.offers.values()]
          .filter(
            (offer) =>
              offer.requestPublicId === requestPublicId &&
              offer.buyerTenantId === owner.tenantId &&
              offer.requestId === request.id,
          )
          .map(cloneOffer),
      ),
    );
  }

  chooseOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    offerId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<OfferSelectionResult>> {
    return Promise.resolve(
      this.executeIdempotent(owner, 'offer_choose', requestPublicId, idempotencyKey, { offerId }, () => {
        const publication = this.requestPublications.get(requestPublicId);
        if (
          !publication ||
          publication.status !== 'published' ||
          publication.moderationStatus !== 'approved' ||
          publication.buyerTenantId !== owner.tenantId ||
          publication.buyerUserId !== owner.userId ||
          !this.authorizedOrganization(owner, publication.buyerPartnerId, 'buyer')
        ) {
          return missing();
        }
        const request = this.requests.get(publication.requestId);
        /* v8 ignore next 8 -- a request and its publication are written together and never diverge. */
        if (
          !request ||
          request.tenantId !== owner.tenantId ||
          request.buyerUserId !== owner.userId ||
          request.buyerPartnerId !== publication.buyerPartnerId
        ) {
          return missing();
        }
        if (!isRequestTransitionAllowed(request.status, 'selected')) {
          return { status: 'conflict', field: 'status' };
        }
        const offer = this.offers.get(offerId);
        if (!offer || offer.requestId !== request.id || offer.requestPublicId !== requestPublicId) {
          return missing('offerId');
        }
        if (offer.status !== 'pending') {
          return { status: 'conflict', field: 'status' };
        }
        const sellerOwner = { tenantId: offer.sellerTenantId, userId: offer.sellerUserId };
        const sellerOrganization = this.authorizedOrganization(sellerOwner, offer.sellerPartnerId, 'seller');
        const buyerOrganization = this.organizations.get(publication.buyerPartnerId);
        /* v8 ignore next 6 -- a partner id is either a buyer or a supplier organization, so the self-dealing arm of this guard can never fire. */
        if (
          !sellerOrganization ||
          !buyerOrganization ||
          (offer.sellerTenantId === owner.tenantId && offer.sellerPartnerId === publication.buyerPartnerId)
        ) {
          return { status: 'forbidden', field: 'organization' };
        }

        const contract = this.createDraftContract({
          amountUzs: offer.priceUzs,
          buyerPartnerId: publication.buyerPartnerId,
          buyerPartySnapshot: this.partySnapshot(buyerOrganization, owner.userId),
          buyerTenantId: owner.tenantId,
          buyerUserId: owner.userId,
          deliveryDays: offer.deliveryDays,
          deliveryNote: offer.deliveryNote,
          deliveryPriceUzs: offer.deliveryPriceUzs,
          deliveryTerms: offer.deliveryTerms,
          lines: [
            {
              lineTotalUzs: offer.priceUzs,
              name: request.title,
              quantity: 1,
              sourceId: request.id,
              sourceKind: 'request',
              sourcePublicationId: requestPublicId,
              sourceRevision: publication.contentRevision,
              unit: request.volume ?? 'request',
              unitPriceUzs: offer.priceUzs,
            },
          ],
          sellerPartnerId: offer.sellerPartnerId,
          sellerPartySnapshot: this.partySnapshot(sellerOrganization, offer.sellerUserId),
          sellerTenantId: offer.sellerTenantId,
          sellerUserId: offer.sellerUserId,
          sourceId: offer.id,
          sourceType: 'offer_selection',
          subject: [request.title, request.volume].filter(Boolean).join(' — ').slice(0, 300),
        });
        for (const candidate of this.offers.values()) {
          if (candidate.requestId === request.id && candidate.status === 'pending') {
            candidate.status = candidate.id === offer.id ? 'accepted' : 'declined';
          }
        }
        request.status = 'selected';
        request.updatedAt = this.now();
        this.contracts.set(contract.id, contract);
        return ok({
          contractId: contract.id,
          offerId,
          requestPublicId,
          sellerUserId: offer.sellerUserId,
        });
      }),
    );
  }

  updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: ContractDeliveryQuoteInput,
    idempotencyKey: string,
  ): Promise<OperationResult<Contract>> {
    return Promise.resolve(
      this.executeIdempotent(owner, 'contract_delivery_quote', contractId, idempotencyKey, input, () => {
        const contract = this.contracts.get(contractId);
        if (!contract || contract.sellerTenantId !== owner.tenantId || contract.sellerUserId !== owner.userId) {
          return missing();
        }
        if (contract.revision !== input.expectedRevision) {
          return { status: 'conflict', field: 'expectedRevision' };
        }
        if (
          !this.authorizedOrganization(owner, contract.sellerPartnerId, 'seller') ||
          !this.authorizedOrganization(
            { tenantId: contract.buyerTenantId, userId: contract.buyerUserId },
            contract.buyerPartnerId,
            'buyer',
          )
        ) {
          return { status: 'forbidden', field: 'organization' };
        }
        if (
          contract.deliveryTerms !== 'seller_delivery' ||
          contract.sourceType !== 'cart_checkout' ||
          contract.deliveryPriceUzs !== undefined ||
          contract.status !== 'draft' ||
          contract.buyerSignedAt ||
          contract.sellerSignedAt ||
          input.deliveryPriceUzs <= 0 ||
          (input.deliveryDays !== undefined && input.deliveryDays <= 0)
        ) {
          return { status: 'invalid_state', field: 'deliveryPriceUzs' };
        }
        contract.deliveryPriceUzs = input.deliveryPriceUzs;
        contract.deliveryNote = input.deliveryNote;
        contract.deliveryDays = input.deliveryDays;
        contract.updatedAt = this.now();
        contract.revision += 1;
        return ok(cloneContract(contract));
      }),
    );
  }

  listContracts(owner: AgriTechOwner): Promise<Contract[]> {
    return Promise.resolve(
      [...this.contracts.values()]
        .filter(
          (contract) =>
            (contract.buyerTenantId === owner.tenantId && contract.buyerUserId === owner.userId) ||
            (contract.sellerTenantId === owner.tenantId && contract.sellerUserId === owner.userId),
        )
        .map(cloneContract),
    );
  }

  listTenantContracts(tenantId: string): Promise<Contract[]> {
    return Promise.resolve(
      [...this.contracts.values()]
        .filter((contract) => contract.buyerTenantId === tenantId || contract.sellerTenantId === tenantId)
        .map(cloneContract),
    );
  }

  roleOf(owner: AgriTechOwner): Promise<VerificationRole | undefined> {
    return Promise.resolve(this.roleFor(owner.tenantId, owner.userId));
  }

  private roleFor(tenantId: string, userId: string): VerificationRole | undefined {
    const verification = this.verifications.get(actorKey({ tenantId, userId }));
    return verification?.status === 'verified' ? verification.role : undefined;
  }

  private createDraftContract(input: InMemoryContractDraftInput): Contract {
    const now = this.now();
    return {
      id: this.nextId('contract'),
      revision: 0,
      ...input,
      lines: input.lines.map((line) => ({ ...line })),
      factoringEnabled: false,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
  }

  private activePartnerFor(owner: AgriTechOwner, capability: 'buyer' | 'seller'): string | undefined {
    const partnerIds = [...this.memberships.values()]
      .filter(
        (membership) =>
          membership.tenantId === owner.tenantId &&
          membership.userId === owner.userId &&
          membership.capability === capability &&
          membership.status === 'active' &&
          Boolean(this.authorizedOrganization(owner, membership.partnerId, capability)),
      )
      .map((membership) => membership.partnerId);
    return partnerIds.length === 1 ? partnerIds[0] : undefined;
  }

  private authorizedOrganization(
    owner: AgriTechOwner,
    partnerId: string,
    capability: 'buyer' | 'seller',
  ): InMemoryOrganization | undefined {
    const organization = this.organizations.get(partnerId);
    const role = this.roleFor(owner.tenantId, owner.userId);
    const roleAllowed = capability === 'buyer' ? canBuyInMarketplace(role) : canOfferInMarketplace(role);
    if (
      !organization ||
      organization.tenantId !== owner.tenantId ||
      organization.kind !== (capability === 'buyer' ? 'buyer' : 'supplier') ||
      organization.status !== 'approved' ||
      !roleAllowed ||
      !this.isActiveMember(owner, partnerId, capability)
    ) {
      return undefined;
    }
    return organization;
  }

  private isActiveMember(owner: AgriTechOwner, partnerId: string, capability: 'buyer' | 'seller'): boolean {
    const membership = this.memberships.get(membershipKey(owner, partnerId, capability));
    return Boolean(
      membership &&
      membership.tenantId === owner.tenantId &&
      membership.userId === owner.userId &&
      membership.partnerId === partnerId &&
      membership.capability === capability &&
      membership.status === 'active',
    );
  }

  private resolveListing(listingPublicationId: string): StoredProduct | undefined {
    const publication = this.listingPublications.get(listingPublicationId);
    if (!publication || publication.status !== 'published' || publication.moderationStatus !== 'approved') {
      return undefined;
    }
    const product = this.products.get(publication.productKey);
    if (
      !product ||
      product.listingPublicationId !== listingPublicationId ||
      product.status !== 'active' ||
      !this.authorizedOrganization(
        { tenantId: product.tenantId, userId: product.sellerUserId },
        product.sellerPartnerId,
        'seller',
      )
    ) {
      return undefined;
    }
    return product;
  }

  private mutateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    quantity: number,
  ): OperationResult<Cart> {
    const cart = this.carts.get(cartId);
    if (!cart || cart.buyerTenantId !== owner.tenantId || cart.buyerUserId !== owner.userId || cart.status !== 'open') {
      return missing();
    }
    if (!this.authorizedOrganization(owner, cart.buyerPartnerId, 'buyer')) {
      return { status: 'forbidden', field: 'organization' };
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      return { status: 'invalid_state', field: 'quantity' };
    }
    const index = cart.items.findIndex((item) => item.listingPublicationId === listingPublicationId);
    if (index < 0) {
      return missing('listingPublicationId');
    }
    if (quantity === 0) {
      cart.items.splice(index, 1);
    } else {
      const product = this.resolveListing(listingPublicationId);
      if (
        !product ||
        product.tenantId !== cart.sellerTenantId ||
        product.sellerPartnerId !== cart.sellerPartnerId ||
        product.sellerUserId !== cart.sellerUserId
      ) {
        return missing('listingPublicationId');
      }
      if (quantity > product.stockQuantity) {
        return { status: 'conflict', field: 'stockQuantity' };
      }
      const item = cart.items[index];
      /* v8 ignore next 3 -- index came from findIndex above; the guard only satisfies noUncheckedIndexedAccess. */
      if (!item) {
        return missing('listingPublicationId');
      }
      item.quantity = quantity;
    }
    cart.updatedAt = this.now();
    return ok(cloneCart(cart));
  }

  private partySnapshot(organization: InMemoryOrganization, userId: string): MarketplacePartySnapshot {
    return {
      legalName: organization.legalName,
      partnerId: organization.partnerId,
      region: organization.region,
      tenantId: organization.tenantId,
      userId,
    };
  }

  private executeIdempotent<T>(
    owner: AgriTechOwner,
    operation: string,
    resourceKey: string,
    idempotencyKey: string,
    input: unknown,
    mutate: () => OperationResult<T>,
  ): OperationResult<T> {
    if (!/^[A-Za-z0-9:_-]{8,100}$/u.test(idempotencyKey) || resourceKey.length > 100) {
      return { status: 'invalid_state', field: 'idempotencyKey' };
    }
    const receiptKey = `${actorKey(owner)}:${operation}:${resourceKey}:${idempotencyKey}`;
    const fingerprint = JSON.stringify(canonicalValue(input));
    const existing = this.operationReceipts.get(receiptKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return { status: 'conflict', field: 'idempotencyKey' };
      }
      return cloneOperationResult(existing.result as OperationResult<T>);
    }
    const result = mutate();
    if (result.status === 'ok') {
      this.operationReceipts.set(receiptKey, {
        fingerprint,
        result: cloneOperationResult(result),
      });
    }
    return result;
  }

  private nextId(kind: string): string {
    this.sequence += 1;
    return `memory-${kind}-${this.sequence}`;
  }

  private now(): Date {
    this.sequence += 1;
    return new Date(Date.UTC(2030, 0, 1, 0, 0, this.sequence));
  }
}

/**
 * Deterministic public adapter for exercising marketplace domain journeys
 * without a durable provider. Commands pass through MarketplaceDomainService,
 * the production orchestration inherited by MarketplaceService; only actor and
 * product reference data are registered directly.
 */
export class MarketplaceInMemoryAdapter {
  private readonly repository = new InMemoryMarketplaceRepository();
  private readonly service = new MarketplaceDomainService(this.repository);

  registerVerifiedActor(owner: AgriTechOwner, role: VerificationRole): Verification {
    return this.repository.registerVerifiedActor(owner, role);
  }

  registerPendingActor(owner: AgriTechOwner, role: VerificationRole): Verification {
    return this.repository.registerPendingActor(owner, role);
  }

  getVerification(owner: AgriTechOwner): Promise<Verification | null> {
    return this.service.getVerification(owner);
  }

  listVerifications(tenantId: string): Promise<Verification[]> {
    return this.service.listVerifications(tenantId);
  }

  reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    expectedRevision: number,
    idempotencyKey: string,
    reason?: VerificationRejectionReason,
  ): Promise<Verification> {
    return this.service.reviewVerification(
      tenantId,
      verificationId,
      decision,
      reviewedBy,
      expectedRevision,
      idempotencyKey,
      reason,
    );
  }

  registerApprovedOrganization(
    owner: AgriTechOwner,
    kind: 'buyer' | 'supplier',
    partnerId?: string,
    profile?: { legalName?: string; region?: string },
  ): string {
    return this.repository.registerApprovedOrganization(owner, kind, partnerId, profile);
  }

  registerPartnerMembership(owner: AgriTechOwner, partnerId: string, capability: 'buyer' | 'seller'): void {
    this.repository.registerPartnerMembership(owner, partnerId, capability);
  }

  revokePartnerMembership(owner: AgriTechOwner, partnerId: string, capability: 'buyer' | 'seller'): void {
    this.repository.revokePartnerMembership(owner, partnerId, capability);
  }

  setOrganizationStatus(partnerId: string, status: 'approved' | 'suspended'): void {
    this.repository.setOrganizationStatus(partnerId, status);
  }

  registerProduct(input: MarketplaceInMemoryProductInput): string {
    return this.repository.registerProduct(input);
  }

  addToCart(owner: AgriTechOwner, item: AddCartItemInput, idempotencyKey: string): Promise<Cart> {
    return this.service.addToCart(owner, item, idempotencyKey);
  }

  updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<Cart> {
    return this.service.updateCartItem(owner, cartId, listingPublicationId, quantity, idempotencyKey);
  }

  removeCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<Cart> {
    return this.service.removeCartItem(owner, cartId, listingPublicationId, idempotencyKey);
  }

  listCarts(owner: AgriTechOwner): Promise<Cart[]> {
    return this.service.listCarts(owner);
  }

  getCart(owner: AgriTechOwner, cartId: string): Promise<Cart> {
    return this.service.getCart(owner, cartId);
  }

  checkoutCart(
    owner: AgriTechOwner,
    cartId: string,
    input: CheckoutCartInput,
    idempotencyKey: string,
  ): Promise<CheckoutCartResult> {
    return this.service.checkoutCart(owner, cartId, input, idempotencyKey);
  }

  createRequest(owner: AgriTechOwner, input: CreateBuyerRequestInput, idempotencyKey: string): Promise<BuyerRequest> {
    return this.service.createRequest(owner, input, idempotencyKey);
  }

  listRequests(tenantId: string, status?: string): Promise<BuyerRequest[]> {
    return this.service.listRequests(tenantId, status);
  }

  listMyRequests(owner: AgriTechOwner): Promise<BuyerRequest[]> {
    return this.service.listMyRequests(owner);
  }

  listOffers(owner: AgriTechOwner, requestPublicId: string): Promise<RequestOffer[]> {
    return this.service.listOffers(owner, requestPublicId);
  }

  makeOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    input: CreateRequestOfferInput,
    idempotencyKey: string,
  ): Promise<RequestOffer> {
    return this.service.makeOffer(owner, requestPublicId, input, idempotencyKey);
  }

  chooseOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    offerId: string,
    idempotencyKey: string,
  ): Promise<OfferSelectionResult> {
    return this.service.chooseOffer(owner, requestPublicId, offerId, idempotencyKey);
  }

  updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: ContractDeliveryQuoteInput,
    idempotencyKey: string,
  ): Promise<Contract> {
    return this.service.updateContractDeliveryQuote(owner, contractId, input, idempotencyKey);
  }

  async findRequest(owner: AgriTechOwner, requestId: string): Promise<BuyerRequest | undefined> {
    return (await this.service.listMyRequests(owner)).find((request) => request.id === requestId);
  }

  findRequestPublicationId(requestId: string): string | undefined {
    return this.repository.requestPublicIdFor(requestId);
  }

  async findOffer(owner: AgriTechOwner, requestPublicId: string, offerId: string): Promise<RequestOffer | undefined> {
    return (await this.service.listOffers(owner, requestPublicId)).find((offer) => offer.id === offerId);
  }

  async findContract(owner: AgriTechOwner, contractId: string): Promise<Contract | undefined> {
    return (await this.service.listContracts(owner)).find((contract) => contract.id === contractId);
  }

  listContracts(owner: AgriTechOwner): Promise<Contract[]> {
    return this.service.listContracts(owner);
  }

  listTenantContracts(tenantId: string): Promise<Contract[]> {
    return this.service.listTenantContracts(tenantId);
  }
}
