import {
  canOfferInMarketplace,
  isContractTransitionAllowed,
  isRequestTransitionAllowed,
  isVerificationReviewReasonValid,
  type AgriTechOwner,
  type AiConsultation,
  type BuyerRequest,
  type Cart,
  type CartItem,
  type CheckoutCartInput,
  type CheckoutCartResult,
  type Contract,
  type ContractDeliveryQuoteInput,
  type ContractLine,
  type DeliveryTerms,
  type Favorite,
  type MarketplaceRepository,
  type OfferSelectionResult,
  type OperationResult,
  type RequestOffer,
  type Review,
  type SampleRequest,
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

const cloneVerification = (verification: Verification): Verification => ({
  ...verification,
  documents: verification.documents.map((document) => ({ ...document })),
  reviewedAt: verification.reviewedAt ? new Date(verification.reviewedAt) : undefined,
  createdAt: new Date(verification.createdAt),
  updatedAt: new Date(verification.updatedAt),
});

const cloneCart = (cart: Cart): Cart => ({
  ...cart,
  items: cart.items.map((item) => ({ ...item })),
  createdAt: new Date(cart.createdAt),
  updatedAt: new Date(cart.updatedAt),
});

const cloneRequest = (request: BuyerRequest): BuyerRequest => ({
  ...request,
  createdAt: new Date(request.createdAt),
  updatedAt: new Date(request.updatedAt),
});

const cloneOffer = (offer: RequestOffer): RequestOffer => ({
  ...offer,
  createdAt: new Date(offer.createdAt),
});

const cloneContract = (contract: Contract): Contract => ({
  ...contract,
  lines: contract.lines.map((line) => ({ ...line })),
  buyerSignedAt: contract.buyerSignedAt ? new Date(contract.buyerSignedAt) : undefined,
  sellerSignedAt: contract.sellerSignedAt ? new Date(contract.sellerSignedAt) : undefined,
  signedAt: contract.signedAt ? new Date(contract.signedAt) : undefined,
  createdAt: new Date(contract.createdAt),
  updatedAt: new Date(contract.updatedAt),
});

export interface MarketplaceInMemoryProductInput {
  tenantId: string;
  productId: string;
  sellerId: string;
  sellerUserId: string;
  name: string;
  unit: string;
  unitPriceUzs: number;
  stockQuantity: number;
}

interface StoredProduct extends MarketplaceInMemoryProductInput {
  status: 'active' | 'out_of_stock';
}

type ContractParty = 'buyer' | 'seller';

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

function contractPartyFor(contract: Contract, userId: string): ContractParty | undefined {
  if (contract.buyerUserId === userId) {
    return 'buyer';
  }
  return contract.sellerUserId === userId ? 'seller' : undefined;
}

function hasPartySigned(contract: Contract, party: ContractParty): boolean {
  return Boolean(party === 'buyer' ? contract.buyerSignedAt : contract.sellerSignedAt);
}

function hasOtherPartySigned(contract: Contract, party: ContractParty): boolean {
  return Boolean(party === 'buyer' ? contract.sellerSignedAt : contract.buyerSignedAt);
}

function lacksRequiredDeliveryQuote(contract: Contract): boolean {
  return (
    contract.deliveryTerms === 'seller_delivery' &&
    (contract.deliveryPriceUzs === undefined || contract.deliveryPriceUzs <= 0)
  );
}

function recordContractConsent(
  contract: Contract,
  party: ContractParty,
  nextStatus: 'active' | 'signed',
  now: Date,
): void {
  if (party === 'buyer') {
    contract.buyerSignedAt = now;
  } else {
    contract.sellerSignedAt = now;
  }
  contract.status = nextStatus;
  contract.signedAt = nextStatus === 'active' ? now : contract.signedAt;
  contract.updatedAt = now;
}

class InMemoryMarketplaceRepository implements MarketplaceRepository {
  private readonly verifications = new Map<string, Verification>();
  private readonly approvedOrganizations = new Set<string>();
  private readonly products = new Map<string, StoredProduct>();
  private readonly carts = new Map<string, Cart>();
  private readonly requests = new Map<string, BuyerRequest>();
  private readonly offers = new Map<string, RequestOffer>();
  private readonly contracts = new Map<string, Contract>();
  private sequence = 0;

  registerVerifiedActor(owner: AgriTechOwner, role: VerificationRole): Verification {
    const now = this.now();
    const verification: Verification = {
      id: this.nextId('verification'),
      tenantId: owner.tenantId,
      userId: owner.userId,
      role,
      level: 'verified',
      status: 'verified',
      oneIdLinked: false,
      documents: [],
      createdAt: now,
      updatedAt: now,
    };
    this.verifications.set(actorKey(owner), verification);
    return cloneVerification(verification);
  }

  registerApprovedOrganization(owner: AgriTechOwner, kind: 'buyer' | 'supplier'): void {
    this.approvedOrganizations.add(organizationKey(owner, kind));
  }

  registerProduct(input: MarketplaceInMemoryProductInput): void {
    if (input.stockQuantity <= 0 || input.unitPriceUzs <= 0) {
      throw new Error('In-memory marketplace products require positive stock and price');
    }
    this.products.set(productKey(input.tenantId, input.productId), {
      ...input,
      status: 'active',
    });
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
    reason?: VerificationRejectionReason,
  ): Promise<OperationResult<Verification>> {
    if (!isVerificationReviewReasonValid(decision, reason)) {
      return Promise.resolve({ status: 'invalid_state', field: 'reason' });
    }
    const verification = [...this.verifications.values()].find(
      (candidate) => candidate.tenantId === tenantId && candidate.id === verificationId,
    );
    if (!verification) {
      return Promise.resolve(missing());
    }
    if (verification.status !== 'pending') {
      return Promise.resolve({ status: 'conflict', field: 'status' });
    }
    const now = this.now();
    verification.status = decision;
    verification.reviewedBy = reviewedBy;
    verification.reviewedAt = now;
    verification.rejectionReason = decision === 'rejected' ? reason : undefined;
    verification.updatedAt = now;
    return Promise.resolve(ok(cloneVerification(verification)));
  }

  listVerifications(tenantId: string): Promise<Verification[]> {
    return Promise.resolve(
      [...this.verifications.values()]
        .filter((verification) => verification.tenantId === tenantId)
        .map(cloneVerification),
    );
  }

  isApprovedOrganization(owner: AgriTechOwner, kind: 'buyer' | 'supplier'): Promise<boolean> {
    return Promise.resolve(this.approvedOrganizations.has(organizationKey(owner, kind)));
  }

  getCart(owner: AgriTechOwner, cartId: string): Promise<Cart | undefined> {
    const cart = this.carts.get(cartId);
    if (!cart || cart.tenantId !== owner.tenantId || cart.userId !== owner.userId) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(cloneCart(cart));
  }

  listCarts(owner: AgriTechOwner): Promise<Cart[]> {
    return Promise.resolve(
      [...this.carts.values()]
        .filter((cart) => cart.tenantId === owner.tenantId && cart.userId === owner.userId && cart.status === 'open')
        .map(cloneCart),
    );
  }

  addToCart(owner: AgriTechOwner, item: CartItem): Promise<OperationResult<Cart>> {
    const product = this.products.get(productKey(owner.tenantId, item.productId));
    if (!product || product.status !== 'active') {
      return Promise.resolve(missing('productId'));
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return Promise.resolve({ status: 'invalid_state', field: 'quantity' });
    }

    let cart = [...this.carts.values()].find(
      (candidate) =>
        candidate.tenantId === owner.tenantId &&
        candidate.userId === owner.userId &&
        candidate.sellerId === product.sellerId &&
        candidate.status === 'open',
    );
    const existing = cart?.items.find((candidate) => candidate.productId === item.productId);
    const nextQuantity = (existing?.quantity ?? 0) + item.quantity;
    if (nextQuantity > product.stockQuantity) {
      return Promise.resolve({ status: 'conflict', field: 'stockQuantity' });
    }

    if (!cart) {
      const now = this.now();
      cart = {
        id: this.nextId('cart'),
        tenantId: owner.tenantId,
        userId: owner.userId,
        sellerId: product.sellerId,
        items: [],
        status: 'open',
        createdAt: now,
        updatedAt: now,
      };
      this.carts.set(cart.id, cart);
    }
    if (existing) {
      existing.quantity = nextQuantity;
    } else {
      cart.items.push({ ...item });
    }
    cart.updatedAt = this.now();
    return Promise.resolve(ok(cloneCart(cart)));
  }

  updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<OperationResult<Cart>> {
    const cart = this.carts.get(cartId);
    if (!cart || cart.tenantId !== owner.tenantId || cart.userId !== owner.userId || cart.status !== 'open') {
      return Promise.resolve(missing());
    }
    const item = cart.items.find((candidate) => candidate.productId === productId);
    if (!item) {
      return Promise.resolve(missing('productId'));
    }
    if (quantity <= 0) {
      cart.items = cart.items.filter((candidate) => candidate.productId !== productId);
    } else {
      const product = this.products.get(productKey(owner.tenantId, productId));
      if (!product || product.sellerId !== cart.sellerId || product.status !== 'active') {
        return Promise.resolve(missing('productId'));
      }
      if (quantity > product.stockQuantity) {
        return Promise.resolve({ status: 'conflict', field: 'stockQuantity' });
      }
      item.quantity = quantity;
    }
    cart.updatedAt = this.now();
    return Promise.resolve(ok(cloneCart(cart)));
  }

  removeCartItem(owner: AgriTechOwner, cartId: string, productId: string): Promise<OperationResult<Cart>> {
    return this.updateCartItem(owner, cartId, productId, 0);
  }

  checkoutCart(
    owner: AgriTechOwner,
    cartId: string,
    input: CheckoutCartInput,
  ): Promise<OperationResult<CheckoutCartResult>> {
    const cart = this.carts.get(cartId);
    if (!cart || cart.tenantId !== owner.tenantId || cart.userId !== owner.userId || cart.status !== 'open') {
      return Promise.resolve(missing());
    }
    if (cart.items.length === 0) {
      return Promise.resolve({ status: 'invalid_state', field: 'items' });
    }

    const products = cart.items.map((item) => this.products.get(productKey(owner.tenantId, item.productId)));
    if (products.some((product) => !product || product.status !== 'active' || product.sellerId !== cart.sellerId)) {
      return Promise.resolve(missing('productId'));
    }
    const sellerUserId = products[0]?.sellerUserId;
    if (
      !sellerUserId ||
      products.some((product) => product?.sellerUserId !== sellerUserId) ||
      !canOfferInMarketplace(this.roleFor(owner.tenantId, sellerUserId)) ||
      !this.approvedOrganizations.has(organizationKey({ tenantId: owner.tenantId, userId: sellerUserId }, 'supplier'))
    ) {
      return Promise.resolve({ status: 'forbidden', field: 'sellerId' });
    }

    const lines: ContractLine[] = [];
    for (const item of cart.items) {
      const product = this.products.get(productKey(owner.tenantId, item.productId));
      if (!product) {
        return Promise.resolve(missing('productId'));
      }
      if (item.quantity <= 0 || item.quantity > product.stockQuantity) {
        return Promise.resolve({ status: 'conflict', field: 'stockQuantity' });
      }
      lines.push({
        productId: product.productId,
        name: product.name,
        unit: product.unit,
        unitPriceUzs: product.unitPriceUzs,
        quantity: item.quantity,
        lineTotalUzs: product.unitPriceUzs * item.quantity,
      });
    }
    const amountUzs = lines.reduce((total, line) => total + line.lineTotalUzs, 0);
    if (amountUzs <= 0) {
      return Promise.resolve({ status: 'invalid_state', field: 'amountUzs' });
    }

    const contract = this.createDraftContract({
      tenantId: owner.tenantId,
      buyerUserId: owner.userId,
      sellerUserId,
      sourceType: 'cart_checkout',
      sourceId: cart.id,
      subject: lines
        .map((line) => line.name)
        .join(', ')
        .slice(0, 300),
      amountUzs,
      lines,
      deliveryTerms: input.deliveryTerms,
      deliveryPriceUzs: input.deliveryTerms === 'pickup' ? 0 : undefined,
    });
    cart.status = 'ordered';
    cart.updatedAt = this.now();
    this.contracts.set(contract.id, contract);
    return Promise.resolve(ok({ cartId: cart.id, contractId: contract.id }));
  }

  requestSample(): Promise<OperationResult<SampleRequest>> {
    return Promise.resolve(missing('productId'));
  }

  listSamples(): Promise<SampleRequest[]> {
    return Promise.resolve([]);
  }

  sampleUsageThisMonth(): Promise<number> {
    return Promise.resolve(0);
  }

  addFavorite(): Promise<OperationResult<{ productId: string }>> {
    return Promise.resolve(missing('productId'));
  }

  removeFavorite(): Promise<OperationResult<{ productId: string }>> {
    return Promise.resolve(missing('productId'));
  }

  listFavorites(): Promise<Favorite[]> {
    return Promise.resolve([]);
  }

  addReview(): Promise<OperationResult<Review>> {
    return Promise.resolve(missing('productId'));
  }

  listProductReviews(): Promise<Review[]> {
    return Promise.resolve([]);
  }

  createRequest(
    owner: AgriTechOwner,
    input: Omit<BuyerRequest, 'id' | 'tenantId' | 'buyerUserId' | 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<OperationResult<BuyerRequest>> {
    const now = this.now();
    const request: BuyerRequest = {
      id: this.nextId('request'),
      tenantId: owner.tenantId,
      buyerUserId: owner.userId,
      ...input,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(request.id, request);
    return Promise.resolve(ok(cloneRequest(request)));
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
    requestId: string,
    priceUzs: number,
    deliveryTerms: DeliveryTerms,
    deliveryPriceUzs?: number,
    deliveryNote?: string,
    deliveryDays?: number,
  ): Promise<OperationResult<RequestOffer>> {
    const request = this.requests.get(requestId);
    if (!request || request.tenantId !== owner.tenantId) {
      return Promise.resolve(missing());
    }
    if (!['open', 'offering'].includes(request.status)) {
      return Promise.resolve({ status: 'invalid_state' });
    }
    if (request.buyerUserId === owner.userId) {
      return Promise.resolve({ status: 'forbidden', field: 'buyerUserId' });
    }
    const invalidField = offerValidationField(priceUzs, deliveryTerms, deliveryPriceUzs, deliveryDays);
    if (invalidField) {
      return Promise.resolve({ status: 'invalid_state', field: invalidField });
    }
    if (!isRequestTransitionAllowed(request.status, 'offering')) {
      return Promise.resolve({ status: 'invalid_state' });
    }

    const offer: RequestOffer = {
      id: this.nextId('offer'),
      requestId,
      tenantId: owner.tenantId,
      sellerUserId: owner.userId,
      priceUzs,
      deliveryTerms,
      deliveryPriceUzs,
      deliveryNote,
      deliveryDays,
      status: 'pending',
      createdAt: this.now(),
    };
    request.status = 'offering';
    request.updatedAt = this.now();
    this.offers.set(offer.id, offer);
    return Promise.resolve(ok(cloneOffer(offer)));
  }

  listOffers(owner: AgriTechOwner, requestId: string): Promise<OperationResult<RequestOffer[]>> {
    const request = this.requests.get(requestId);
    if (!request || request.tenantId !== owner.tenantId || request.buyerUserId !== owner.userId) {
      return Promise.resolve(missing());
    }
    return Promise.resolve(
      ok(
        [...this.offers.values()]
          .filter((offer) => offer.tenantId === owner.tenantId && offer.requestId === requestId)
          .map(cloneOffer),
      ),
    );
  }

  chooseOffer(
    owner: AgriTechOwner,
    requestId: string,
    offerId: string,
  ): Promise<OperationResult<OfferSelectionResult>> {
    const request = this.requests.get(requestId);
    if (!request || request.tenantId !== owner.tenantId || request.buyerUserId !== owner.userId) {
      return Promise.resolve(missing());
    }
    if (!isRequestTransitionAllowed(request.status, 'selected')) {
      return Promise.resolve({ status: 'conflict', field: 'status' });
    }
    const offer = this.offers.get(offerId);
    if (!offer || offer.tenantId !== owner.tenantId || offer.requestId !== requestId) {
      return Promise.resolve(missing('offerId'));
    }
    if (offer.status !== 'pending') {
      return Promise.resolve({ status: 'conflict', field: 'status' });
    }
    if (offer.sellerUserId === owner.userId) {
      return Promise.resolve({ status: 'forbidden', field: 'sellerUserId' });
    }
    if (
      !canOfferInMarketplace(this.roleFor(owner.tenantId, offer.sellerUserId)) ||
      !this.approvedOrganizations.has(
        organizationKey({ tenantId: owner.tenantId, userId: offer.sellerUserId }, 'supplier'),
      )
    ) {
      return Promise.resolve({ status: 'forbidden', field: 'sellerUserId' });
    }

    const contract = this.createDraftContract({
      tenantId: owner.tenantId,
      buyerUserId: owner.userId,
      sellerUserId: offer.sellerUserId,
      sourceType: 'offer_selection',
      sourceId: offer.id,
      subject: [request.title, request.volume].filter(Boolean).join(' — ').slice(0, 300),
      amountUzs: offer.priceUzs,
      lines: [],
      deliveryTerms: offer.deliveryTerms,
      deliveryPriceUzs: offer.deliveryPriceUzs,
      deliveryNote: offer.deliveryNote,
      deliveryDays: offer.deliveryDays,
    });
    for (const candidate of this.offers.values()) {
      if (
        candidate.tenantId === owner.tenantId &&
        candidate.requestId === requestId &&
        candidate.status === 'pending'
      ) {
        candidate.status = candidate.id === offer.id ? 'accepted' : 'declined';
      }
    }
    request.status = 'selected';
    request.updatedAt = this.now();
    this.contracts.set(contract.id, contract);
    return Promise.resolve(
      ok({
        requestId,
        offerId,
        sellerUserId: offer.sellerUserId,
        contractId: contract.id,
      }),
    );
  }

  updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: ContractDeliveryQuoteInput,
  ): Promise<OperationResult<Contract>> {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.tenantId !== owner.tenantId) {
      return Promise.resolve(missing());
    }
    if (contract.sellerUserId !== owner.userId) {
      return Promise.resolve({ status: 'forbidden', field: 'sellerUserId' });
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
      return Promise.resolve({ status: 'invalid_state', field: 'deliveryPriceUzs' });
    }
    contract.deliveryPriceUzs = input.deliveryPriceUzs;
    contract.deliveryNote = input.deliveryNote;
    contract.deliveryDays = input.deliveryDays;
    contract.updatedAt = this.now();
    return Promise.resolve(ok(cloneContract(contract)));
  }

  signContract(owner: AgriTechOwner, contractId: string): Promise<OperationResult<Contract>> {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.tenantId !== owner.tenantId) {
      return Promise.resolve(missing());
    }
    const party = contractPartyFor(contract, owner.userId);
    if (!party) {
      return Promise.resolve({ status: 'forbidden' });
    }
    const organizationKind = party === 'buyer' ? 'buyer' : 'supplier';
    if (!this.approvedOrganizations.has(organizationKey(owner, organizationKind))) {
      return Promise.resolve({ status: 'forbidden', field: 'organization' });
    }
    if (contract.buyerUserId === contract.sellerUserId) {
      return Promise.resolve({ status: 'invalid_state', field: 'parties' });
    }
    if (['cancelled', 'completed', 'legacy_review_required'].includes(contract.status)) {
      return Promise.resolve({ status: 'invalid_state' });
    }
    if (lacksRequiredDeliveryQuote(contract)) {
      return Promise.resolve({ status: 'invalid_state', field: 'deliveryPriceUzs' });
    }
    if (contract.status === 'active' || hasPartySigned(contract, party)) {
      return Promise.resolve(ok(cloneContract(contract)));
    }

    const otherPartySigned = hasOtherPartySigned(contract, party);
    const nextStatus = otherPartySigned ? 'active' : 'signed';
    if (!isContractTransitionAllowed(contract.status, nextStatus)) {
      return Promise.resolve({ status: 'invalid_state' });
    }
    if (otherPartySigned && contract.sourceType === 'cart_checkout') {
      const inventoryResult = this.validateCartContractInventory(contract);
      if (inventoryResult.status !== 'ok') {
        return Promise.resolve(inventoryResult);
      }
      this.commitCartContractInventory(contract);
    }

    const now = this.now();
    recordContractConsent(contract, party, nextStatus, now);
    return Promise.resolve(ok(cloneContract(contract)));
  }

  listContracts(owner: AgriTechOwner): Promise<Contract[]> {
    return Promise.resolve(
      [...this.contracts.values()]
        .filter(
          (contract) =>
            contract.tenantId === owner.tenantId &&
            (contract.buyerUserId === owner.userId || contract.sellerUserId === owner.userId),
        )
        .map(cloneContract),
    );
  }

  listTenantContracts(tenantId: string): Promise<Contract[]> {
    return Promise.resolve(
      [...this.contracts.values()].filter((contract) => contract.tenantId === tenantId).map(cloneContract),
    );
  }

  askAi(): Promise<OperationResult<AiConsultation>> {
    return Promise.resolve({ status: 'invalid_state' });
  }

  listAiConsultations(): Promise<AiConsultation[]> {
    return Promise.resolve([]);
  }

  roleOf(owner: AgriTechOwner): Promise<VerificationRole | undefined> {
    return Promise.resolve(this.roleFor(owner.tenantId, owner.userId));
  }

  private roleFor(tenantId: string, userId: string): VerificationRole | undefined {
    const verification = this.verifications.get(actorKey({ tenantId, userId }));
    return verification?.status === 'verified' ? verification.role : undefined;
  }

  private validateCartContractInventory(contract: Contract): OperationResult<void> {
    if (contract.lines.length === 0) {
      return { status: 'invalid_state', field: 'lines' };
    }
    for (const line of contract.lines) {
      const product = this.products.get(productKey(contract.tenantId, line.productId));
      if (
        !product ||
        product.status !== 'active' ||
        product.sellerUserId !== contract.sellerUserId ||
        line.quantity <= 0 ||
        line.quantity > product.stockQuantity
      ) {
        return { status: 'conflict', field: 'stockQuantity' };
      }
    }
    return ok(undefined);
  }

  private commitCartContractInventory(contract: Contract): void {
    for (const line of contract.lines) {
      const product = this.products.get(productKey(contract.tenantId, line.productId));
      if (!product) {
        throw new Error('Validated marketplace inventory disappeared before commit');
      }
      product.stockQuantity -= line.quantity;
      product.status = product.stockQuantity === 0 ? 'out_of_stock' : 'active';
    }
  }

  private createDraftContract(
    input: Pick<
      Contract,
      | 'tenantId'
      | 'buyerUserId'
      | 'sellerUserId'
      | 'sourceType'
      | 'sourceId'
      | 'subject'
      | 'amountUzs'
      | 'lines'
      | 'deliveryTerms'
      | 'deliveryPriceUzs'
      | 'deliveryNote'
      | 'deliveryDays'
    >,
  ): Contract {
    const now = this.now();
    return {
      id: this.nextId('contract'),
      ...input,
      lines: input.lines.map((line) => ({ ...line })),
      factoringEnabled: false,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
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

  reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    reason?: VerificationRejectionReason,
  ): Promise<Verification> {
    return this.service.reviewVerification(tenantId, verificationId, decision, reviewedBy, reason);
  }

  registerApprovedOrganization(owner: AgriTechOwner, kind: 'buyer' | 'supplier'): void {
    this.repository.registerApprovedOrganization(owner, kind);
  }

  registerProduct(input: MarketplaceInMemoryProductInput): void {
    this.repository.registerProduct(input);
  }

  addToCart(owner: AgriTechOwner, productId: string, quantity: number): Promise<Cart> {
    return this.service.addToCart(owner, { productId, quantity });
  }

  listCarts(owner: AgriTechOwner): Promise<Cart[]> {
    return this.service.listCarts(owner);
  }

  getCart(owner: AgriTechOwner, cartId: string): Promise<Cart> {
    return this.service.getCart(owner, cartId);
  }

  checkoutCart(owner: AgriTechOwner, cartId: string, input: CheckoutCartInput): Promise<CheckoutCartResult> {
    return this.service.checkoutCart(owner, cartId, input);
  }

  createRequest(
    owner: AgriTechOwner,
    input: Omit<BuyerRequest, 'id' | 'tenantId' | 'buyerUserId' | 'status' | 'createdAt' | 'updatedAt'>,
  ): Promise<BuyerRequest> {
    return this.service.createRequest(owner, input);
  }

  makeOffer(
    owner: AgriTechOwner,
    requestId: string,
    priceUzs: number,
    deliveryTerms: DeliveryTerms,
    deliveryPriceUzs?: number,
    deliveryNote?: string,
    deliveryDays?: number,
  ): Promise<RequestOffer> {
    return this.service.makeOffer(
      owner,
      requestId,
      priceUzs,
      deliveryTerms,
      deliveryPriceUzs,
      deliveryNote,
      deliveryDays,
    );
  }

  chooseOffer(owner: AgriTechOwner, requestId: string, offerId: string): Promise<OfferSelectionResult> {
    return this.service.chooseOffer(owner, requestId, offerId);
  }

  signContract(owner: AgriTechOwner, contractId: string): Promise<Contract> {
    return this.service.signContract(owner, contractId);
  }

  async findRequest(owner: AgriTechOwner, requestId: string): Promise<BuyerRequest | undefined> {
    return (await this.service.listMyRequests(owner)).find((request) => request.id === requestId);
  }

  async findOffer(owner: AgriTechOwner, requestId: string, offerId: string): Promise<RequestOffer | undefined> {
    return (await this.service.listOffers(owner, requestId)).find((offer) => offer.id === offerId);
  }

  async findContract(owner: AgriTechOwner, contractId: string): Promise<Contract | undefined> {
    return (await this.service.listContracts(owner)).find((contract) => contract.id === contractId);
  }

  listContracts(owner: AgriTechOwner): Promise<Contract[]> {
    return this.service.listContracts(owner);
  }
}
