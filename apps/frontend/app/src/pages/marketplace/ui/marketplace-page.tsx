// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import './marketplace.css';
import { observer, useI18n } from '@app/frontend-runtime';
import { useLogout } from '@app/frontend-feature-user-logout';
import { usePublicProfile } from '../model/use-public-profile';
import { MarketplacePublicProfile } from './marketplace-public-profile';
import {
  isApiClientError,
  throwOnOpenApiError,
  throwOnOpenApiErrorData,
  useUserApiClient,
  type BuyerRequestViewDto,
  type CartViewDto,
  type ContractLifecycleDto,
  type ContractViewDto,
  type MarketplaceAiConsultationDto,
  type MarketplaceListingPromotionDto,
  type MarketplacePublicSuggestionDto,
  type MarketplaceReviewDto,
  type MarketplaceReviewSelfStateDto,
  type MarketplaceSampleDto,
  type OfferViewDto,
  type VerificationDocumentInputDto,
  type VerificationViewDto,
} from '@app/frontend-api-client';
import { LanguageSwitcher } from '../../../shared/ui';
import { useActiveDeals, type ActiveDeal } from '../model/use-active-deals';
import { useGuestCart, type GuestCartLine } from '../model/use-guest-cart';
import { useGuestFavorites } from '../model/use-guest-favorites';
import { useMarketplaceNotices } from '../model/use-marketplace-notices';
import { useMarketplaceData, type Resource } from '../model/use-marketplace-data';
import { MarketplaceAi } from './marketplace-ai';
import {
  MarketplaceAccount,
  MarketplaceCart,
  MarketplaceContract,
  MarketplaceRequests,
  MarketplaceVerification,
  type MarketplaceContractLifecycleAction,
  type MarketplaceContractDeliveryQuoteInput,
  type MarketplaceCreateRequestInput,
  type MarketplaceOfferInput,
} from './marketplace-commerce';
import {
  MarketplaceCatalog,
  MarketplaceEmpty,
  MarketplaceFavorites,
  MarketplaceHome,
  MarketplaceProductDetail,
  MarketplaceSellerProfile,
  MarketplaceSkeleton,
} from './marketplace-discovery';
import { MarketplaceDeals } from './marketplace-deals';
import { MarketplaceIcon } from './marketplace-icon';
import { MarketplaceBrandLockup, MarketplaceEmblem } from './marketplace-brand';
import { MarketplaceUserManagement } from './marketplace-management';
import {
  marketplaceRoleCanBuy,
  marketplaceRoleCanSell,
  querySection,
  type MarketplaceNavigate,
  type MarketplaceListing,
  type MarketplaceNotice,
  type MarketplaceRequestFeedItem,
  type MarketplaceSection,
  type MarketplaceTranslate,
  type MarketplaceView,
} from './marketplace-ui';

export interface MarketplacePageProps {
  children?: ReactNode;
  contractId?: string;
  /** Router-subscribed path, which the cabinet's deep-linked sections are read from. */
  locationPathname?: string;
  locationSearch?: string;
  navigate?: MarketplaceNavigate;
  /** Opaque public profile address of a counterparty, from a deal. */
  partyId?: string;
  productId?: string;
  sellerId?: string;
  view?: MarketplaceView;
}

interface Confirmation {
  confirmLabel: string;
  description: string;
  onConfirm: () => Promise<void> | void;
  title: string;
}

type AiKind = 'find_cheaper' | 'generic' | 'recommendation' | 'season_advice';
type DeliveryTerms = 'by_agreement' | 'pickup' | 'seller_delivery';
type VerificationRole = 'buyer' | 'farmer' | 'seller';
type VerificationDocumentKind = VerificationDocumentInputDto['kind'];

const maximumVerificationDocumentBytes = 10 * 1024 * 1024;
const verificationDocumentMimeTypes = new Set<VerificationDocumentInputDto['mimeType']>([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Unable to read verification evidence.'));
    });
    reader.addEventListener('load', () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      if (separator < 0) {
        reject(new Error('Unable to encode verification evidence.'));
        return;
      }
      resolve(result.slice(separator + 1));
    });
    reader.readAsDataURL(file);
  });

const replaceReview = (
  resource: Resource<MarketplaceReviewDto[]>,
  updated: MarketplaceReviewDto,
): Resource<MarketplaceReviewDto[]> => ({
  data: resource.data.map((item) => (item.id === updated.id ? updated : item)),
  status: 'ready',
});

const defaultNavigate: MarketplaceNavigate = (to) => {
  globalThis.location.assign(to);
};

/**
 * Sign-in reached from the cart has to come back to the cart. Without the return
 * address a buyer who followed the checkout boundary notice landed on the home
 * page and had to find the assembled cart again. Verification and organization
 * entries own their own continuation, so only the account route is rewritten.
 */
const withCartReturn = (path: string): string => (path === '/auth' ? '/auth?returnUrl=%2Fcart' : path);

/**
 * The replay identity of one preview line's promotion. It is derived, never
 * generated: the same line at the same quantity must reuse the same key so the
 * server answers a reload with the original cart instead of adding twice.
 */
const adoptionKey = (buyerPartnerId: string, line: GuestCartLine): string =>
  `guest-cart:${buyerPartnerId}:${line.listingPublicationId}:${line.quantity}`;

const canMutateContractForRole = (contract: ContractViewDto, canBuy: boolean, canOffer: boolean): boolean =>
  contract.actorParty === 'buyer' ? canBuy : canOffer;

const isDefinitiveClientError = (error: unknown): boolean =>
  isApiClientError(error) && Math.floor(error.status / 100) === 4;

const verificationStatusForContract = (verification: Resource<VerificationViewDto | null>, canMutate: boolean) => {
  if (verification.status !== 'ready') {
    return verification.status;
  }
  const status = verification.data?.status ?? 'none';
  return status === 'verified' && !canMutate ? 'none' : status;
};

export const MarketplacePage = observer(function MarketplacePage(props: Readonly<MarketplacePageProps>) {
  if (props.view === 'embedded') {
    return <MarketplaceEmbeddedPage {...props} />;
  }
  return <MarketplaceDataPage {...props} />;
});

const MarketplaceDataPage = observer(function MarketplaceDataPage({
  children,
  contractId,
  locationPathname,
  locationSearch = '',
  navigate = defaultNavigate,
  partyId,
  productId,
  sellerId,
  view = 'home',
}: Readonly<MarketplacePageProps>) {
  const { locale, t } = useI18n();
  const translate = useCallback(
    (key: string, params?: Record<string, number | string>) => t(key as never, params as never),
    [t],
  );
  const { api, requestOptions } = useUserApiClient();
  // The marketplace owns the whole chrome, so the settings page that held the only
  // sign-out control is unreachable from inside it.
  const { model: logoutModel, signOut } = useLogout({ navigate });
  const data = useMarketplaceData(productId, sellerId);
  // Read here rather than inside the seller view: the page owns every resource this
  // tree renders, which is what keeps the views renderable from plain props.
  const sellerPublicProfile = usePublicProfile(data.seller.data?.id, 'seller');
  const partyPublicProfile = usePublicProfile(partyId, 'profile');
  const guestCart = useGuestCart();
  const guestFavorites = useGuestFavorites();
  const { dismiss: dismissNotice, flash, notices } = useMarketplaceNotices();
  const [pendingAction, setPendingAction] = useState<string>();
  const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Resource<MarketplacePublicSuggestionDto[]>>({
    data: [],
    status: 'idle',
  });
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [reviews, setReviews] = useState<Resource<MarketplaceReviewDto[]>>({ data: [], status: 'idle' });
  const [reviewSelfState, setReviewSelfState] = useState<Resource<MarketplaceReviewSelfStateDto | null>>({
    data: null,
    status: 'idle',
  });
  const [contractLifecycle, setContractLifecycle] = useState<Resource<ContractLifecycleDto | null>>({
    data: null,
    status: 'idle',
  });
  const [promotionDetail, setPromotionDetail] = useState<Resource<MarketplaceListingPromotionDto | null>>({
    data: null,
    status: 'idle',
  });
  const [contractLifecycleReload, setContractLifecycleReload] = useState(0);
  const commandKeysRef = useRef(new Map<string, { actionKey: string; idempotencyKey: string }>());
  const adoptionRef = useRef({ attemptedKeys: new Set<string>(), rejectedKeys: new Set<string>(), running: false });
  const reloadContractLifecycle = useCallback(() => {
    setContractLifecycleReload((revision) => revision + 1);
  }, []);
  const closeConfirmation = useCallback(() => {
    setConfirmation(undefined);
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'DehqonHub';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setSearchSuggestions({ data: [], status: 'idle' });
      return undefined;
    }
    let active = true;
    setSearchSuggestions((resource) => ({ ...resource, status: 'loading' }));
    const timer = globalThis.setTimeout(() => {
      void throwOnOpenApiErrorData(
        api.marketplacePublicControllerListSuggestions({ limit: 6, q: query }, requestOptions),
      )
        .then((response) => {
          if (active) {
            setSearchSuggestions({
              data: response.items,
              status: response.items.length > 0 ? 'ready' : 'empty',
            });
          }
        })
        .catch(() => {
          if (active) {
            setSearchSuggestions({ data: [], status: 'error' });
          }
        });
    }, 250);
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, requestOptions, search]);

  useEffect(() => {
    if (view !== 'product' || !productId) {
      setReviews({ data: [], status: 'idle' });
      return undefined;
    }
    let active = true;
    setReviews((resource) => ({ ...resource, status: 'loading' }));
    void throwOnOpenApiErrorData(api.marketplacePublicControllerListReviews(productId, requestOptions))
      .then((response) => {
        if (active) {
          setReviews({ data: response.items, status: response.items.length > 0 ? 'ready' : 'empty' });
        }
      })
      .catch(() => {
        if (active) {
          setReviews({ data: [], status: 'error' });
        }
      });
    return () => {
      active = false;
    };
  }, [api, productId, requestOptions, view]);

  /**
   * What this caller may still do with the listing's ratings.
   *
   * The public review projection is author-free, so the browser cannot work out
   * from it whether one of the visible reviews is its own — it cannot tell "you
   * already rated this" apart from "you were never able to". This read answers
   * both from the same persisted eligibility the write path consumes. A signed-out
   * visitor is not asked at all, and a refusal is recorded as an error rather than
   * promoted to eligibility: the ratings block then shows the aggregate and no
   * entry, which is what an ineligible caller should see anyway.
   */
  useEffect(() => {
    if (view !== 'product' || !productId || data.auth !== 'signed-in') {
      setReviewSelfState({ data: null, status: 'idle' });
      return undefined;
    }
    let active = true;
    setReviewSelfState((resource) => ({ ...resource, status: 'loading' }));
    void throwOnOpenApiErrorData(api.marketplaceControllerGetReviewSelfState(productId, requestOptions))
      .then((response) => {
        if (active) {
          setReviewSelfState({ data: response, status: 'ready' });
        }
      })
      .catch(() => {
        if (active) {
          setReviewSelfState({ data: null, status: 'error' });
        }
      });
    return () => {
      active = false;
    };
  }, [api, data.auth, productId, requestOptions, view]);

  useEffect(() => {
    if (view !== 'contract' || !contractId || data.auth !== 'signed-in') {
      setContractLifecycle({ data: null, status: 'idle' });
      return undefined;
    }
    let active = true;
    setContractLifecycle((resource) => ({ ...resource, status: 'loading' }));
    void throwOnOpenApiErrorData(api.marketplaceControllerGetContractLifecycle(contractId, requestOptions))
      .then((response) => {
        if (active) {
          setContractLifecycle({ data: response, status: 'ready' });
        }
      })
      .catch((error) => {
        if (active) {
          const lifecycleNotPrepared = isApiClientError(error) && (error.status === 404 || error.status === 409);
          setContractLifecycle({ data: null, status: lifecycleNotPrepared ? 'empty' : 'error' });
        }
      });
    return () => {
      active = false;
    };
  }, [api, contractId, contractLifecycleReload, data.auth, requestOptions, view]);

  const favoriteIds = useMemo(() => {
    const serverIds = data.auth === 'signed-in' ? data.favorites.data.map((favorite) => favorite.listing.id) : [];
    const localIds = data.catalog.data
      .filter((product) => data.auth !== 'signed-in' || product.provenance === 'demo')
      .map((product) => product.id)
      .filter((id) => guestFavorites.ids.has(id));
    return new Set([...serverIds, ...localIds]);
  }, [data.auth, data.catalog.data, data.favorites.data, guestFavorites.ids]);
  const visibleCarts = useMemo<Resource<CartViewDto[]>>(
    () =>
      data.auth === 'signed-in'
        ? { ...data.carts, data: [...data.carts.data, ...guestCart.carts] }
        : { data: guestCart.carts, status: 'ready' },
    [data.auth, data.carts, guestCart.carts],
  );
  const previewCartIds = useMemo(() => new Set(guestCart.carts.map((cart) => cart.id)), [guestCart.carts]);
  const previewCartLines = guestCart.lines;
  const releasePreviewCartLine = guestCart.release;
  const selectedProduct = data.selectedListing.data ?? data.catalog.data.find((product) => product.id === productId);
  const selectedContract = data.contracts.data.find((contract) => contract.id === contractId);
  const buyerPartner = data.partners.data.find((partner) => partner.kind === 'buyer' && partner.status === 'approved');
  const supplierPartner = data.partners.data.find(
    (partner) => partner.kind === 'supplier' && partner.status === 'approved',
  );
  const isVerified = data.verification.data?.status === 'verified';
  const verificationRole = data.verification.data?.role;
  const canBuy = isVerified && marketplaceRoleCanBuy(verificationRole);
  const canOffer = isVerified && marketplaceRoleCanSell(verificationRole);
  const selectedContractCanMutate = selectedContract
    ? canMutateContractForRole(selectedContract, canBuy, canOffer)
    : false;
  const canReviewSelectedProduct = Boolean(
    selectedProduct &&
    data.contracts.data.some(
      (contract) =>
        contract.actorParty === 'buyer' &&
        contract.status === 'completed' &&
        contract.lines.some((line) => line.sourcePublicationId === selectedProduct.id),
    ),
  );
  const canActOnContract = useCallback(
    (contract: ContractViewDto) => canMutateContractForRole(contract, canBuy, canOffer),
    [canBuy, canOffer],
  );
  /**
   * Deals in flight. The per-deal lifecycle read only happens on the route that
   * shows it; the header badge is derived from the contract list the whole page
   * already carries, so no other route pays for this screen.
   */
  const deals = useActiveDeals({
    canAct: canActOnContract,
    contracts: data.contracts,
    enabled: view === 'deals',
    signedIn: data.auth === 'signed-in',
  });

  const mutationError = useCallback(
    (error: unknown) => {
      if (isApiClientError(error)) {
        if (error.status === 401) {
          return translate('agritech.marketplace.auth.required');
        }
        if (error.status === 403) {
          return translate('agritech.marketplace.cart.verifyRequired');
        }
        if (error.status === 404) {
          return translate('agritech.marketplace.action.notFound');
        }
        if (error.status === 409) {
          return translate('agritech.marketplace.action.conflict');
        }
      }
      return translate('agritech.marketplace.error');
    },
    [translate],
  );

  const runMutation = useCallback(
    async function runMarketplaceMutation<T>(
      key: string,
      action: (idempotencyKey: string) => Promise<T>,
      success: string,
      after?: (result: T) => void,
      commandIdentity = key,
    ): Promise<boolean> {
      if (data.auth !== 'signed-in') {
        flash(translate('agritech.marketplace.auth.required'), 'info');
        const returnUrl =
          typeof globalThis.location === 'undefined'
            ? '/'
            : `${globalThis.location.pathname}${globalThis.location.search}`;
        navigate(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
        return false;
      }
      for (const [identity, command] of commandKeysRef.current) {
        if (command.actionKey === key && identity !== commandIdentity) {
          commandKeysRef.current.delete(identity);
        }
      }
      const retainedCommand = commandKeysRef.current.get(commandIdentity);
      const idempotencyKey = retainedCommand?.idempotencyKey ?? globalThis.crypto.randomUUID();
      commandKeysRef.current.set(commandIdentity, { actionKey: key, idempotencyKey });
      setPendingAction(key);
      try {
        const result = await action(idempotencyKey);
        commandKeysRef.current.delete(commandIdentity);
        flash(success);
        after?.(result);
        data.refresh();
        return true;
      } catch (error) {
        if (isDefinitiveClientError(error)) {
          commandKeysRef.current.delete(commandIdentity);
        }
        if (isApiClientError(error) && (error.status === 404 || error.status === 409)) {
          data.refresh();
        }
        flash(mutationError(error), 'error');
        return false;
      } finally {
        setPendingAction(undefined);
      }
    },
    [data, flash, mutationError, navigate, translate],
  );

  const openProduct = (product: MarketplaceListing) => {
    navigate(`/products/${encodeURIComponent(product.id)}`);
  };

  const addToCart = (product: MarketplaceListing, quantity = 1) => {
    if (!product.transactional || !canBuy || !buyerPartner) {
      guestCart.add(product, quantity);
      flash(translate('agritech.marketplace.cart.previewAdded'), 'info');
      return;
    }
    void runMutation(
      `cart:${product.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerAddToCart(
            { actingPartnerId: buyerPartner.id, listingPublicationId: product.id, quantity },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.cart.addedToSellerCart', { seller: product.supplierName }),
      undefined,
      `cart:${product.id}:${buyerPartner.id}:${quantity}`,
    );
  };

  const toggleFavorite = (product: MarketplaceListing) => {
    if (data.auth !== 'signed-in' || product.provenance === 'demo') {
      const wasFavorite = guestFavorites.ids.has(product.id);
      guestFavorites.toggle(product.id);
      flash(
        wasFavorite
          ? translate('agritech.marketplace.favorites.localRemoved')
          : translate('agritech.marketplace.favorites.localAdded'),
        'info',
      );
      return;
    }
    const favorite = favoriteIds.has(product.id);
    void runMutation(
      `favorite:${product.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          favorite
            ? api.marketplaceControllerRemoveFavorite(product.id, idempotencyKey, requestOptions)
            : api.marketplaceControllerAddFavorite(product.id, idempotencyKey, requestOptions),
        ),
      favorite
        ? translate('agritech.marketplace.favorites.removed')
        : translate('agritech.marketplace.favorites.added'),
      undefined,
      `favorite:${product.id}:${favorite ? 'remove' : 'add'}`,
    );
  };

  const addReview = (product: MarketplaceListing, rating: number, comment?: string) => {
    return runMutation(
      `review:${product.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerAddReview(
            {
              ...(comment ? { comment } : {}),
              assetReferences: [],
              listingPublicationId: product.id,
              rating,
            },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.reviews.submitted'),
      (result) => {
        setReviews((resource) => ({ data: [result, ...resource.data], status: 'ready' }));
        // The eligibility this review consumed is gone, and the row the server
        // returned is the caller's own — which is the one fact the public list
        // can never tell them again.
        setReviewSelfState({
          data: { canReview: false, listingPublicationId: product.id, review: result },
          status: 'ready',
        });
      },
      `review:${product.id}:${rating}:${comment ?? ''}`,
    );
  };

  const replyToReview = (review: MarketplaceReviewDto, comment: string) =>
    runMutation(
      `review-reply:${review.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerReplyToReview(
            review.id,
            { comment, expectedRevision: review.revision },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.reviews.replySubmitted'),
      (updated) => {
        setReviews((resource) => replaceReview(resource, updated));
      },
      `review-reply:${review.id}:${review.revision}:${comment}`,
    );

  const reportReview = (
    review: MarketplaceReviewDto,
    reason: 'abuse' | 'off_topic' | 'privacy' | 'spam',
    comment?: string,
  ) =>
    runMutation(
      `review-report:${review.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerReportReview(
            review.id,
            { ...(comment ? { comment } : {}), reason },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.reviews.reportSubmitted'),
      undefined,
      `review-report:${review.id}:${reason}:${comment ?? ''}`,
    );

  const updateCart = (cart: CartViewDto, productIdToUpdate: string, quantity: number) => {
    if (guestCart.owns(cart.id)) {
      guestCart.update(cart.id, productIdToUpdate, quantity);
      flash(translate('agritech.marketplace.cart.updated'), 'info');
      return;
    }
    void runMutation(
      `cart-update:${productIdToUpdate}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          quantity <= 0
            ? api.marketplaceControllerRemoveCartItem(cart.id, productIdToUpdate, idempotencyKey, requestOptions)
            : api.marketplaceControllerUpdateCartItem(
                cart.id,
                productIdToUpdate,
                { quantity },
                idempotencyKey,
                requestOptions,
              ),
        ),
      translate('agritech.marketplace.cart.updated'),
      undefined,
      `cart-update:${cart.id}:${productIdToUpdate}:${quantity}`,
    );
  };

  const requestSample = (product: MarketplaceListing) => {
    if (!product.transactional) {
      flash(translate('agritech.marketplace.access.demo'), 'info');
      return;
    }
    if (!canBuy) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    setConfirmation({
      confirmLabel: translate('agritech.marketplace.samples.confirm'),
      description: translate('agritech.marketplace.samples.confirmDescription', { product: product.name }),
      onConfirm: async () => {
        await runMutation(
          `sample:${product.id}`,
          (idempotencyKey) =>
            throwOnOpenApiErrorData(
              api.marketplaceControllerRequestSample(
                { deliveryMethod: 'pickup', listingPublicationId: product.id },
                idempotencyKey,
                requestOptions,
              ),
            ),
          translate('agritech.marketplace.samples.requested'),
        );
      },
      title: translate('agritech.marketplace.product.sample'),
    });
  };

  const sharedTransactionAccess = (() => {
    // A session that is still being read is not a signed-out session. Every data
    // refresh re-checks it, so answering `signIn` here told an already signed-in
    // actor to sign in for as long as the refresh lasted.
    if (data.auth === 'checking') {
      return { hint: translate('agritech.marketplace.access.checking') };
    }
    if (data.auth !== 'signed-in') {
      return {
        actionLabel: translate('agritech.marketplace.access.action.signIn'),
        hint: translate('agritech.marketplace.access.signIn'),
        path: '/auth',
      };
    }
    if (data.verification.status === 'loading' || data.verification.status === 'idle') {
      return { hint: translate('agritech.marketplace.access.checking') };
    }
    if (!isVerified) {
      return {
        actionLabel: translate('agritech.marketplace.access.action.verify'),
        hint: translate('agritech.marketplace.access.verify'),
        path: '/verification',
      };
    }
    return undefined;
  })();

  /**
   * The single buying barrier, in the order the actor has to clear it: sign in,
   * then a settled verification, then a verification role that may buy, then an
   * approved buyer organization. Exactly one step is named at a time, and every
   * surface that blocks buying — the catalog card, the product detail action and
   * the cart's checkout control — reads its wording, its entry point and its
   * enabled state from this one value, so a control can never name a step the
   * actor has already cleared. `undefined` means nothing is missing.
   *
   * An organization list that still shows no approved buyer while it is being read
   * is reported as a check in progress rather than as a missing organization:
   * claiming an approval is absent before it has been read is the same class of
   * falsehood as telling a signed-in actor to sign in. A refresh that already
   * carries an approved organization keeps transacting open.
   */
  const transactionAccess = (() => {
    if (sharedTransactionAccess) {
      return sharedTransactionAccess;
    }
    if (!canBuy) {
      return { hint: translate('agritech.marketplace.access.buyerRole') };
    }
    if (!buyerPartner) {
      if (data.partners.status === 'loading' || data.partners.status === 'idle') {
        return { hint: translate('agritech.marketplace.access.checking') };
      }
      return {
        actionLabel: translate('agritech.marketplace.access.action.organization'),
        hint: translate('agritech.marketplace.access.organization'),
        path: '/account',
      };
    }
    return undefined;
  })();

  /**
   * A preview cart assembled before sign-in is not an order, and `checkout` can
   * never make it one: a `guest-cart:` id addresses no server cart. Because the
   * versioned local store outlives authentication, the preview used to reappear
   * beside the buyer's real carts with a checkout control that could only ever
   * answer with a notice — the dead end the owner reported.
   *
   * Once the actor is an authorized buyer the preview is promoted through the same
   * `POST /marketplace/cart/items` the catalog uses, so the server derives the
   * seller from the listing publication, keeps one open cart per buyer and seller,
   * and revalidates price and stock. Nothing runs while signed out or unverified:
   * REQ-AGRITECH-EXPERIENCE-026 keeps that preview explicitly local, and the
   * boundary is the guarantee rather than an oversight.
   *
   * The idempotency key is derived from the acting partner, the listing and the
   * quantity instead of generated, so a reload between an accepted request and the
   * local release replays the same command and returns the original cart rather
   * than adding the quantity a second time. An accepted line is released
   * immediately, which is what makes the pass a no-op on every later render, and a
   * rejected line is remembered so a revalidation failure is reported once instead
   * of retried on every refresh.
   */
  const adoptPreviewCart = useCallback(
    async (retryRejected = false): Promise<void> => {
      if (data.auth !== 'signed-in' || !canBuy || !buyerPartner || adoptionRef.current.running) {
        return;
      }
      if (retryRejected) {
        for (const key of adoptionRef.current.rejectedKeys) {
          adoptionRef.current.attemptedKeys.delete(key);
        }
        adoptionRef.current.rejectedKeys.clear();
      }
      const pending = previewCartLines.filter(
        (line) => !adoptionRef.current.attemptedKeys.has(adoptionKey(buyerPartner.id, line)),
      );
      if (pending.length === 0) {
        return;
      }
      adoptionRef.current.running = true;
      const sellers: string[] = [];
      let rejection: unknown;
      try {
        for (const line of pending) {
          const key = adoptionKey(buyerPartner.id, line);
          adoptionRef.current.attemptedKeys.add(key);
          try {
            // Sequential on purpose: two lines from the same seller resolve to one
            // open cart, and issuing them together would contend for that cart's
            // advisory lock instead of merging into it.
            // eslint-disable-next-line no-await-in-loop
            const cart = await throwOnOpenApiErrorData(
              api.marketplaceControllerAddToCart(
                {
                  actingPartnerId: buyerPartner.id,
                  listingPublicationId: line.listingPublicationId,
                  quantity: line.quantity,
                },
                key,
                requestOptions,
              ),
            );
            releasePreviewCartLine(line.listingPublicationId);
            if (!sellers.includes(cart.seller.displayName)) {
              sellers.push(cart.seller.displayName);
            }
          } catch (error) {
            adoptionRef.current.rejectedKeys.add(key);
            rejection = error;
          }
        }
      } finally {
        adoptionRef.current.running = false;
      }
      for (const seller of sellers) {
        flash(translate('agritech.marketplace.cart.addedToSellerCart', { seller }));
      }
      if (sellers.length > 0) {
        data.refresh();
      }
      if (rejection !== undefined) {
        flash(mutationError(rejection), 'error');
      }
    },
    [
      api,
      buyerPartner,
      canBuy,
      data,
      flash,
      mutationError,
      previewCartLines,
      releasePreviewCartLine,
      requestOptions,
      translate,
    ],
  );

  useEffect(() => {
    void adoptPreviewCart();
  }, [adoptPreviewCart]);

  const checkout = (cart: CartViewDto, deliveryTerms: DeliveryTerms) => {
    if (guestCart.owns(cart.id)) {
      if (canBuy && buyerPartner) {
        void adoptPreviewCart(true);
        return;
      }
      // Nothing was ordered. Name the one thing still missing and go there.
      flash(transactionAccess?.hint ?? translate('agritech.marketplace.cart.previewHint'), 'info');
      if (transactionAccess?.path) {
        navigate(withCartReturn(transactionAccess.path));
      }
      return;
    }
    if (!canBuy) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    const sellerName = cart.seller.displayName;
    setConfirmation({
      confirmLabel: translate('agritech.marketplace.cart.reviewContract'),
      description: translate('agritech.marketplace.cart.checkoutConfirmation', { seller: sellerName }),
      onConfirm: async () => {
        await runMutation(
          `checkout:${cart.id}`,
          (idempotencyKey) =>
            throwOnOpenApiErrorData(
              api.marketplaceControllerCheckoutCart(cart.id, { deliveryTerms }, idempotencyKey, requestOptions),
            ),
          translate('agritech.marketplace.contract.draftCreated'),
          (result) => {
            navigate(`/contracts/${result.contractId}`);
          },
          `checkout:${cart.id}:${deliveryTerms}`,
        );
      },
      title: translate('agritech.marketplace.cart.checkout'),
    });
  };

  const createRequest = (input: MarketplaceCreateRequestInput) => {
    if (!canBuy || !buyerPartner) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      'request:create',
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerCreateRequest(
            { ...input, actingPartnerId: buyerPartner.id },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.orders.created'),
      undefined,
      `request:create:${JSON.stringify(input)}`,
    );
  };

  const makeOffer = (request: MarketplaceRequestFeedItem, input: MarketplaceOfferInput) => {
    if (!canOffer || !supplierPartner) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      `offer:${request.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerMakeOffer(
            request.id,
            { ...input, actingPartnerId: supplierPartner.id },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.orders.offerSent'),
      undefined,
      `offer:${request.id}:${JSON.stringify(input)}`,
    );
  };

  const chooseOffer = (request: BuyerRequestViewDto, offer: OfferViewDto) => {
    if (!canBuy) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    // The offer endpoints are keyed by the request publication. A request still
    // awaiting moderation has none, so say so instead of firing a 404 nobody sees.
    const publicationId = request.publicationId;
    if (!publicationId) {
      flash(translate('agritech.marketplace.orders.awaitingModerationHint'), 'info');
      return;
    }
    setConfirmation({
      confirmLabel: translate('agritech.marketplace.orders.confirmOffer'),
      description: translate('agritech.marketplace.orders.confirmOfferDescription'),
      onConfirm: async () => {
        await runMutation(
          `choose:${offer.id}`,
          (idempotencyKey) =>
            throwOnOpenApiErrorData(
              api.marketplaceControllerChooseOffer(publicationId, offer.id, idempotencyKey, requestOptions),
            ),
          translate('agritech.marketplace.contract.draftCreated'),
          (result) => {
            navigate(`/contracts/${result.contractId}`);
          },
        );
      },
      title: translate('agritech.marketplace.orders.choose'),
    });
  };

  const signContract = (contract: ContractViewDto) => {
    if (!canMutateContractForRole(contract, canBuy, canOffer)) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    setConfirmation({
      confirmLabel: translate('agritech.marketplace.contract.signOwnParty'),
      description: translate('agritech.marketplace.contract.signConfirmation'),
      onConfirm: async () => {
        await runMutation(
          `sign:${contract.id}`,
          async (idempotencyKey) => {
            await throwOnOpenApiErrorData(
              api.marketplaceControllerCreateContractArtifact(
                contract.id,
                { settlementKind: contract.factoringEnabled ? 'factoring' : 'direct_payment' },
                `${idempotencyKey}:artifact`,
                requestOptions,
              ),
            );
            return throwOnOpenApiErrorData(
              api.marketplaceControllerSignContract(contract.id, `${idempotencyKey}:signature`, requestOptions),
            );
          },
          translate('agritech.marketplace.contract.signatureRecorded'),
          reloadContractLifecycle,
          `sign:${contract.id}:${contract.revision}:${contract.factoringEnabled ? 'factoring' : 'direct'}`,
        );
      },
      title: translate('agritech.marketplace.contract.sign'),
    });
  };

  const advanceContractLifecycle = (contract: ContractViewDto, action: MarketplaceContractLifecycleAction): void => {
    if (!canMutateContractForRole(contract, canBuy, canOffer)) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      `lifecycle:${contract.id}`,
      (idempotencyKey) => {
        if (action.kind === 'factoring-consent') {
          return throwOnOpenApiErrorData(
            api.marketplaceControllerConsentFactoring(contract.id, idempotencyKey, requestOptions),
          );
        }
        if (action.kind === 'settlement') {
          return throwOnOpenApiErrorData(
            api.marketplaceControllerRecordSettlementEvent(contract.id, action.body, idempotencyKey, requestOptions),
          );
        }
        return throwOnOpenApiErrorData(
          api.marketplaceControllerTransitionContractFulfillment(
            contract.id,
            action.body,
            idempotencyKey,
            requestOptions,
          ),
        );
      },
      translate('agritech.marketplace.contract.settlement.advanced'),
      (result) => {
        setContractLifecycle({ data: result, status: 'ready' });
        // The command answers with the fresh lifecycle, so the deals card that
        // submitted it re-reads its own next action without a second request.
        deals.apply(contract.id, result);
      },
      `lifecycle:${contract.id}:${JSON.stringify(action)}`,
    );
  };

  /**
   * The one action a deals card offers. `sign` and `command` are the only kinds
   * that reach here: an `open` action is a link the card follows itself.
   */
  const actOnDeal = (deal: ActiveDeal) => {
    if (deal.action.kind === 'sign') {
      signContract(deal.contract);
      return;
    }
    if (deal.action.command) {
      advanceContractLifecycle(deal.contract, deal.action.command);
    }
  };

  const quoteContractDelivery = (contract: ContractViewDto, input: MarketplaceContractDeliveryQuoteInput) => {
    if (!canMutateContractForRole(contract, canBuy, canOffer)) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      `quote:${contract.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerUpdateContractDeliveryQuote(
            contract.id,
            { ...input, expectedRevision: contract.revision },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.contract.deliveryQuoteSaved'),
      undefined,
      `quote:${contract.id}:${contract.revision}:${JSON.stringify(input)}`,
    );
  };

  const refreshContractArtifact = (contract: ContractViewDto) => {
    if (!canMutateContractForRole(contract, canBuy, canOffer)) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      `artifact:${contract.id}`,
      () => throwOnOpenApiErrorData(api.marketplaceControllerGetContractArtifact(contract.id, requestOptions)),
      translate('agritech.marketplace.contract.artifactRefreshed'),
      (artifact) => {
        setContractLifecycle((resource) =>
          resource.data ? { data: { ...resource.data, artifact }, status: 'ready' } : resource,
        );
      },
    );
  };

  const downloadContractArtifact = (contract: ContractViewDto) => {
    if (!canMutateContractForRole(contract, canBuy, canOffer)) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    setPendingAction(`artifact-download:${contract.id}`);
    void throwOnOpenApiError(api.marketplaceControllerDownloadContractArtifact(contract.id, requestOptions))
      .then((body) => {
        const blob = body instanceof Blob ? body : new Blob([body], { type: 'application/pdf' });
        const href = globalThis.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.download = `dehqonhub-contract-${contract.id}.pdf`;
        anchor.click();
        globalThis.URL.revokeObjectURL(href);
        flash(translate('agritech.marketplace.contract.downloadStarted'));
      })
      .catch((error) => {
        flash(mutationError(error), 'error');
      })
      .finally(() => {
        setPendingAction(undefined);
      });
  };

  const openContractDispute = (
    contract: ContractViewDto,
    reason: 'delivery_issue' | 'quality_issue' | 'quantity_issue' | 'other',
  ) => {
    if (!canMutateContractForRole(contract, canBuy, canOffer)) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      `dispute:${contract.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerOpenContractDispute(contract.id, { reason }, idempotencyKey, requestOptions),
        ),
      translate('agritech.marketplace.contract.disputeOpened'),
      (lifecycle) => {
        setContractLifecycle({ data: lifecycle, status: 'ready' });
      },
      `dispute:${contract.id}:${reason}`,
    );
  };

  const uploadContractDisputeEvidence = (contract: ContractViewDto, evidence: File) => {
    if (!canMutateContractForRole(contract, canBuy, canOffer)) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      `dispute-evidence:${contract.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerStoreContractDisputeEvidence(contract.id, evidence, idempotencyKey, requestOptions),
        ),
      translate('agritech.marketplace.contract.evidenceUploaded'),
      () => {
        reloadContractLifecycle();
      },
      `dispute-evidence:${contract.id}:${evidence.name}:${evidence.size}:${evidence.lastModified}`,
    );
  };

  const askAi = async (question: string, kind: AiKind): Promise<MarketplaceAiConsultationDto> => {
    const actionKey = 'ai:ask';
    const commandIdentity = `${actionKey}:${kind}:${question.trim()}`;
    for (const [identity, command] of commandKeysRef.current) {
      if (command.actionKey === actionKey && identity !== commandIdentity) {
        commandKeysRef.current.delete(identity);
      }
    }
    const retainedCommand = commandKeysRef.current.get(commandIdentity);
    const idempotencyKey = retainedCommand?.idempotencyKey ?? globalThis.crypto.randomUUID();
    commandKeysRef.current.set(commandIdentity, { actionKey, idempotencyKey });
    try {
      const consultation = await throwOnOpenApiErrorData(
        api.marketplaceControllerAskAi({ kind, question }, idempotencyKey, requestOptions),
      );
      commandKeysRef.current.delete(commandIdentity);
      return consultation;
    } catch (error) {
      if (isDefinitiveClientError(error)) {
        commandKeysRef.current.delete(commandIdentity);
      }
      throw error;
    }
  };

  const confirmAiStarterCart = (consultation: MarketplaceAiConsultationDto): Promise<boolean> => {
    if (!canBuy || !buyerPartner) {
      flash(translate('agritech.marketplace.cart.verifyRequired'), 'info');
      navigate('/verification');
      return Promise.resolve(false);
    }
    return runMutation(
      `ai-cart:${consultation.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerConfirmAiStarterCart(
            consultation.id,
            { actingPartnerId: buyerPartner.id, confirmed: true },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.ai.starterCart.confirmed'),
    );
  };

  const startVerification = (role: VerificationRole) => {
    void runMutation(
      'verification:start',
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerCreateVerification(
            { expectedRevision: data.verification.data?.revision ?? 0, role },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.verify.started'),
      undefined,
      `verification:start:${role}:${data.verification.data?.revision ?? 0}`,
    );
  };

  const linkVerificationIdentity = (verification: VerificationViewDto) => {
    void runMutation(
      'verification:identity',
      (idempotencyKey) => throwOnOpenApiErrorData(api.marketplaceControllerLinkOneId(idempotencyKey, requestOptions)),
      translate('agritech.marketplace.verify.identityLinked'),
      undefined,
      `verification:identity:${verification.id}:${verification.revision}`,
    );
  };

  const uploadVerificationDocument = (
    verification: VerificationViewDto,
    kind: VerificationDocumentKind,
    file: File,
  ) => {
    if (!verificationDocumentMimeTypes.has(file.type as VerificationDocumentInputDto['mimeType'])) {
      flash(translate('agritech.marketplace.verify.invalidFileType'), 'error');
      return;
    }
    if (file.size > maximumVerificationDocumentBytes) {
      flash(translate('agritech.marketplace.verify.fileTooLarge'), 'error');
      return;
    }
    void runMutation(
      `verification:document:${kind}`,
      async (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerStoreVerificationDocument(
            {
              contentBase64: await readFileAsBase64(file),
              fileName: file.name,
              kind,
              mimeType: file.type as VerificationDocumentInputDto['mimeType'],
            },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.verify.documentUploaded'),
      undefined,
      `verification:document:${verification.id}:${verification.revision}:${kind}:${file.name}:${file.size}:${file.lastModified}`,
    );
  };

  const submitVerification = (verification: VerificationViewDto) => {
    void runMutation(
      'verification:submit',
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerSubmitVerification(
            { expectedRevision: verification.revision },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.verify.pending'),
      undefined,
      `verification:submit:${verification.id}:${verification.revision}`,
    );
  };

  const publishListing = (
    sourceId: string,
    sourceKind: 'produce' | 'product',
    section: 'equipment' | 'produce' | 'seeds',
  ) => {
    if (!canOffer || !supplierPartner) {
      flash(translate('agritech.marketplace.management.verificationRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      `publish-listing:${sourceId}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplacePublicationControllerPublishListing(
            { section, sellerPartnerId: supplierPartner.id, sourceId, sourceKind },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.publication.submitted'),
      undefined,
      `publish-listing:${sourceId}:${sourceKind}:${section}`,
    );
  };

  const publishRequest = (requestId: string) => {
    if (!canBuy || !buyerPartner) {
      flash(translate('agritech.marketplace.management.verificationRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      `publish-request:${requestId}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplacePublicationControllerPublishRequest(
            { buyerPartnerId: buyerPartner.id, requestId },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.publication.submitted'),
    );
  };

  const activatePromotion = (listingPublicId: string, planCode: 'catalog_7d' | 'catalog_14d' | 'catalog_30d') => {
    if (!canOffer || !supplierPartner) {
      flash(translate('agritech.marketplace.management.verificationRequired'), 'info');
      navigate('/verification');
      return;
    }
    void runMutation(
      'promotion:activate',
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplacePromotionControllerActivate(
            { actingPartnerId: supplierPartner.id, listingPublicId, planCode },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.promotion.activated'),
      (promotion) => {
        setPromotionDetail({ data: promotion, status: 'ready' });
      },
      `promotion:activate:${listingPublicId}:${planCode}`,
    );
  };

  const loadPromotion = (promotionId: string) => {
    setPromotionDetail((resource) => ({ ...resource, status: 'loading' }));
    void throwOnOpenApiErrorData(api.marketplacePromotionControllerGet(promotionId, requestOptions))
      .then((promotion) => {
        setPromotionDetail({ data: promotion, status: 'ready' });
      })
      .catch(() => {
        setPromotionDetail({ data: null, status: 'error' });
      });
  };

  const transitionSample = (
    sample: MarketplaceSampleDto,
    action: 'approve' | 'cancel' | 'decline' | 'receive' | 'ship',
    deliveryQuoteUzs?: number,
  ) => {
    void runMutation(
      `sample-transition:${sample.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerTransitionSample(
            sample.id,
            {
              action,
              ...(deliveryQuoteUzs === undefined ? {} : { deliveryQuoteUzs }),
              expectedRevision: sample.revision,
            },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate(`agritech.marketplace.samples.actionSuccess.${action}`),
      undefined,
      `sample-transition:${sample.id}:${sample.revision}:${action}:${deliveryQuoteUzs ?? ''}`,
    );
  };

  const submitSampleFeedback = (sample: MarketplaceSampleDto, rating: number, comment?: string) => {
    void runMutation(
      `sample-feedback:${sample.id}`,
      (idempotencyKey) =>
        throwOnOpenApiErrorData(
          api.marketplaceControllerSubmitSampleFeedback(
            sample.id,
            { ...(comment ? { comment } : {}), expectedRevision: sample.revision, rating },
            idempotencyKey,
            requestOptions,
          ),
        ),
      translate('agritech.marketplace.samples.feedbackSubmitted'),
      undefined,
      `sample-feedback:${sample.id}:${sample.revision}:${rating}:${comment ?? ''}`,
    );
  };

  const submitSearch = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(search.trim() ? `/catalog?q=${encodeURIComponent(search.trim())}` : '/catalog');
  };

  const selectSuggestion = (suggestion: MarketplacePublicSuggestionDto) => {
    setSearch(suggestion.label);
    setSearchSuggestions({ data: [], status: 'idle' });
    if (suggestion.kind === 'listing') {
      navigate(`/products/${encodeURIComponent(suggestion.id)}`);
      return;
    }
    if (suggestion.kind === 'seller') {
      navigate(`/sellers/${encodeURIComponent(suggestion.id)}`);
      return;
    }
    navigate(`/requests?q=${encodeURIComponent(suggestion.label)}`);
  };

  const sellerTransactionAccess = (() => {
    if (sharedTransactionAccess) {
      return sharedTransactionAccess;
    }
    if (!canOffer) {
      return { hint: translate('agritech.marketplace.access.sellerRole') };
    }
    if (!supplierPartner) {
      return {
        actionLabel: translate('agritech.marketplace.access.action.organization'),
        hint: translate('agritech.marketplace.access.sellerOrganization'),
        path: '/account',
      };
    }
    return undefined;
  })();

  const productActions = {
    canTransact: canBuy && Boolean(buyerPartner),
    favoriteIds,
    locale,
    navigate,
    onAdd: addToCart,
    onFavorite: toggleFavorite,
    onOpen: openProduct,
    ...(transactionAccess?.path
      ? {
          onTransactionAction: () => {
            navigate(transactionAccess.path);
          },
        }
      : {}),
    pendingAction,
    products: data.catalog.data,
    t: translate,
    ...(transactionAccess?.actionLabel ? { transactionActionLabel: transactionAccess.actionLabel } : {}),
    ...(transactionAccess?.hint ? { transactionHint: transactionAccess.hint } : {}),
  };

  const privateView = view === 'account' || view === 'contract' || view === 'deals' || view === 'verification';
  const catalogView = view === 'catalog' || view === 'home';
  const authChecking = privateView && data.auth === 'checking';
  const authSignedOut = privateView && data.auth === 'signed-out';
  const contentUnavailable = (privateView && data.auth === 'error') || (catalogView && data.catalog.status === 'error');
  const catalogLoading = catalogView && (data.catalog.status === 'loading' || data.catalog.status === 'idle');
  const productLoading = view === 'product' && data.selectedListing.status === 'loading';
  // eslint-disable-next-line sonarjs/cognitive-complexity -- an exhaustive route-state switch keeps loading, auth, access, recovery, and command props in one auditable boundary
  const renderContent = (): ReactNode => {
    let rendered: ReactNode;
    if (authChecking) {
      rendered = <MarketplaceLoading t={translate} />;
    } else if (authSignedOut) {
      rendered = <MarketplaceSignedOut navigate={navigate} t={translate} />;
    } else if (contentUnavailable) {
      rendered = (
        <MarketplaceEmpty
          actionLabel={translate('ui.runtime.retry')}
          headingLevel={1}
          icon="produce"
          message={translate('agritech.marketplace.catalog.unavailableDescription')}
          onAction={data.refresh}
          title={translate('agritech.marketplace.catalog.unavailable')}
        />
      );
    } else if (catalogLoading) {
      rendered = <MarketplaceLoading t={translate} />;
    } else if (productLoading) {
      rendered = <MarketplaceLoading t={translate} />;
    } else {
      switch (view) {
        case 'embedded':
          rendered = children;
          break;
        case 'catalog':
          rendered = <MarketplaceCatalog {...productActions} locationSearch={locationSearch} />;
          break;
        case 'product':
          rendered = (
            <MarketplaceProductDetail
              {...productActions}
              canReplyToReviews={
                isVerified &&
                (data.verification.data?.role === 'seller' || data.verification.data?.role === 'farmer') &&
                Boolean(selectedProduct) &&
                data.ownedListingPublications.data.some((publication) => publication.id === selectedProduct?.id)
              }
              canReportReviews={data.auth === 'signed-in'}
              canReview={canReviewSelectedProduct}
              onReview={addReview}
              onReplyToReview={replyToReview}
              onReportReview={reportReview}
              onRetry={data.refresh}
              onSample={requestSample}
              product={selectedProduct}
              reviews={reviews}
              reviewSelfState={reviewSelfState.data ?? undefined}
              reviewSelfStateStatus={reviewSelfState.status}
              sampleUsage={data.sampleUsage}
              similar={data.catalog.data.filter(
                (product) =>
                  product.id !== productId && selectedProduct && product.category === selectedProduct.category,
              )}
            />
          );
          break;
        case 'party':
          rendered = (
            <MarketplacePublicProfile
              identity
              locale={locale}
              navigate={navigate}
              profile={partyPublicProfile}
              t={translate}
            />
          );
          break;
        case 'seller':
          rendered = (
            <MarketplaceSellerProfile
              {...productActions}
              catalog={data.sellerCatalog}
              publicProfile={sellerPublicProfile}
              seller={data.seller}
            />
          );
          break;
        case 'favorites':
          rendered = (
            <MarketplaceFavorites
              {...productActions}
              localOnly={data.auth !== 'signed-in'}
              status={data.auth === 'signed-in' ? data.favorites.status : 'ready'}
            />
          );
          break;
        case 'cart':
          rendered = (
            <MarketplaceCart
              canCheckout={transactionAccess === undefined}
              {...(transactionAccess?.actionLabel ? { checkoutActionLabel: transactionAccess.actionLabel } : {})}
              {...(transactionAccess?.hint ? { checkoutHint: transactionAccess.hint } : {})}
              carts={visibleCarts}
              locale={locale}
              navigate={navigate}
              onCheckout={checkout}
              {...(transactionAccess?.path
                ? {
                    onCheckoutAction: () => {
                      navigate(withCartReturn(transactionAccess.path));
                    },
                  }
                : {})}
              onUpdate={(cartId, itemProductId, quantity) => {
                const cart = visibleCarts.data.find((entry) => entry.id === cartId);
                if (cart) {
                  updateCart(cart, itemProductId, quantity);
                }
              }}
              pendingAction={pendingAction}
              previewCartIds={previewCartIds}
              products={data.catalog.data}
              t={translate}
            />
          );
          break;
        case 'requests':
          rendered = (
            <MarketplaceRequests
              {...(transactionAccess?.actionLabel ? { buyerAccessActionLabel: transactionAccess.actionLabel } : {})}
              {...(transactionAccess?.hint ? { buyerAccessHint: transactionAccess.hint } : {})}
              isVerified={isVerified}
              locale={locale}
              myRequests={data.myRequests}
              navigate={navigate}
              offersByRequest={data.offersByRequest}
              {...(transactionAccess?.path
                ? {
                    onBuyerAccessAction: () => {
                      navigate(transactionAccess.path);
                    },
                  }
                : {})}
              onChoose={chooseOffer}
              onCreate={createRequest}
              onOffer={makeOffer}
              onRetry={data.refresh}
              pendingAction={pendingAction}
              requests={data.requests}
              role={data.verification.data?.role}
              {...(sellerTransactionAccess?.actionLabel
                ? { sellerAccessActionLabel: sellerTransactionAccess.actionLabel }
                : {})}
              {...(sellerTransactionAccess?.hint ? { sellerAccessHint: sellerTransactionAccess.hint } : {})}
              {...(sellerTransactionAccess?.path
                ? {
                    onSellerAccessAction: () => {
                      navigate(sellerTransactionAccess.path);
                    },
                  }
                : {})}
              t={translate}
            />
          );
          break;
        case 'verification':
          rendered = (
            <MarketplaceVerification
              navigate={navigate}
              onLinkIdentity={linkVerificationIdentity}
              onRetry={data.refresh}
              onStart={startVerification}
              onSubmit={submitVerification}
              onUploadDocument={uploadVerificationDocument}
              pendingAction={pendingAction}
              readiness={data.providerReadiness}
              t={translate}
              verification={data.verification}
            />
          );
          break;
        case 'account':
          rendered = (
            <MarketplaceAccount
              contracts={data.contracts}
              dashboard={data.dashboard}
              listingPublications={data.ownedListingPublications}
              locale={locale}
              {...(locationPathname === undefined ? {} : { locationPathname })}
              management={
                <MarketplaceUserManagement
                  {...(transactionAccess?.actionLabel ? { buyerAccessActionLabel: transactionAccess.actionLabel } : {})}
                  {...(transactionAccess?.hint ? { buyerAccessHint: transactionAccess.hint } : {})}
                  aiConsultations={data.aiConsultations}
                  canActivatePromotions={canOffer && Boolean(supplierPartner)}
                  canPublishListings={canOffer && Boolean(supplierPartner)}
                  canPublishRequests={canBuy && Boolean(buyerPartner)}
                  listingPublications={data.ownedListingPublications}
                  locale={locale}
                  myRequests={data.myRequests}
                  navigate={navigate}
                  notifications={data.notifications}
                  {...(transactionAccess?.path
                    ? {
                        onBuyerAccessAction: () => {
                          navigate(transactionAccess.path);
                        },
                      }
                    : {})}
                  onActivatePromotion={activatePromotion}
                  onLoadPromotion={loadPromotion}
                  onPublishListing={publishListing}
                  onPublishRequest={publishRequest}
                  onRetry={data.refresh}
                  onSampleFeedback={submitSampleFeedback}
                  onSampleTransition={transitionSample}
                  pendingAction={pendingAction}
                  produceListings={data.produceListings}
                  promotionDetail={promotionDetail}
                  promotionPlans={data.promotionPlans}
                  promotions={data.promotions}
                  requestPublications={data.ownedRequestPublications}
                  samples={data.samples}
                  {...(sellerTransactionAccess?.actionLabel
                    ? { sellerAccessActionLabel: sellerTransactionAccess.actionLabel }
                    : {})}
                  {...(sellerTransactionAccess?.hint ? { sellerAccessHint: sellerTransactionAccess.hint } : {})}
                  {...(sellerTransactionAccess?.path
                    ? {
                        onSellerAccessAction: () => {
                          navigate(sellerTransactionAccess.path);
                        },
                      }
                    : {})}
                  supplierProducts={data.supplierProducts}
                  t={translate}
                />
              }
              myRequests={data.myRequests}
              navigate={navigate}
              offersByRequest={data.offersByRequest}
              onRetry={data.refresh}
              onSignOut={signOut}
              publicRequests={data.requests}
              requestPublications={data.ownedRequestPublications}
              samples={data.samples}
              signOutPending={logoutModel.isPending}
              t={translate}
              verification={data.verification}
            />
          );
          break;
        case 'deals':
          rendered = (
            <MarketplaceDeals
              deals={deals}
              locale={locale}
              navigate={navigate}
              onAct={actOnDeal}
              onRetry={() => {
                deals.reload();
                data.refresh();
              }}
              {...(pendingAction === undefined ? {} : { pendingAction })}
              t={translate}
            />
          );
          break;
        case 'contract':
          rendered = (
            <MarketplaceContract
              contract={selectedContract}
              identityStatus={verificationStatusForContract(data.verification, selectedContractCanMutate)}
              lifecycle={contractLifecycle}
              locale={locale}
              navigate={navigate}
              onDownloadArtifact={downloadContractArtifact}
              onAdvanceLifecycle={advanceContractLifecycle}
              onOpenDispute={openContractDispute}
              onQuote={quoteContractDelivery}
              onRefreshArtifact={refreshContractArtifact}
              onRetry={() => {
                reloadContractLifecycle();
                data.refresh();
              }}
              onSign={signContract}
              onUploadDisputeEvidence={uploadContractDisputeEvidence}
              pendingAction={pendingAction}
              status={data.contracts.status}
              t={translate}
            />
          );
          break;
        default:
          rendered = <MarketplaceHome {...productActions} />;
      }
    }
    return rendered;
  };
  const content = renderContent();

  return (
    <div className="dh-marketplace">
      <MarketplaceHeader
        activeSection={querySection()}
        cartCount={visibleCarts.data.reduce((count, cart) => count + cart.items.length, 0)}
        dealsBadge={deals.awaitingConsent}
        favoriteCount={favoriteIds.size}
        navigate={navigate}
        onSearch={submitSearch}
        onSelectSuggestion={selectSuggestion}
        search={search}
        setSearch={setSearch}
        signedIn={data.auth === 'signed-in'}
        suggestions={searchSuggestions}
        t={translate}
        verificationStatus={data.verification.data?.status}
        view={view}
      />
      {notices.length > 0 && (
        <div className="dh-notices">
          <div aria-live="polite" className="dh-notices__region" role="status">
            {notices
              .filter((notice) => notice.kind !== 'error')
              .map((notice) => (
                <MarketplaceNotice key={notice.id} notice={notice} onDismiss={dismissNotice} t={translate} />
              ))}
          </div>
          <div aria-live="assertive" className="dh-notices__region" role="alert">
            {notices
              .filter((notice) => notice.kind === 'error')
              .map((notice) => (
                <MarketplaceNotice key={notice.id} notice={notice} onDismiss={dismissNotice} t={translate} />
              ))}
          </div>
        </div>
      )}
      <main className="dh-main" id="dh-main">
        <MarketplaceCatalogAccessNotice
          access={transactionAccess}
          catalogView={catalogView}
          loading={catalogLoading}
          navigate={navigate}
          signedIn={data.auth === 'signed-in'}
          unavailable={contentUnavailable}
        />
        {content}
      </main>
      <MarketplaceFooter navigate={navigate} t={translate} />
      {data.auth === 'signed-in' && (
        <MarketplaceAi
          canConfirmStarterCart={canBuy && Boolean(buyerPartner)}
          locale={locale}
          onAsk={askAi}
          onConfirmStarterCart={confirmAiStarterCart}
          onOpenProduct={openProduct}
          products={data.catalog.data}
          t={translate}
        />
      )}
      <MarketplaceMobileNav
        cartCount={visibleCarts.data.reduce((count, cart) => count + cart.items.length, 0)}
        navigate={navigate}
        t={translate}
        view={view}
      />
      {confirmation && (
        <MarketplaceConfirmation
          confirmation={confirmation}
          onClose={closeConfirmation}
          pending={Boolean(pendingAction)}
          t={translate}
        />
      )}
    </div>
  );
});

function MarketplaceEmbeddedPage({
  children,
  navigate = defaultNavigate,
}: Readonly<Pick<MarketplacePageProps, 'children' | 'navigate'>>) {
  const { t } = useI18n();
  const translate = useCallback(
    (key: string, params?: Record<string, number | string>) => t(key as never, params as never),
    [t],
  );
  const [search, setSearch] = useState('');
  const submitSearch = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(search.trim() ? `/catalog?q=${encodeURIComponent(search.trim())}` : '/catalog');
  };

  return (
    <div className="dh-marketplace">
      <MarketplaceHeader
        activeSection="all"
        cartCount={0}
        dealsBadge={0}
        favoriteCount={0}
        navigate={navigate}
        onSearch={submitSearch}
        onSelectSuggestion={() => undefined}
        search={search}
        setSearch={setSearch}
        signedIn={false}
        suggestions={{ data: [], status: 'idle' }}
        t={translate}
        view="embedded"
      />
      <main className="dh-main" id="dh-main">
        {children}
      </main>
      <MarketplaceFooter navigate={navigate} t={translate} />
      <MarketplaceMobileNav cartCount={0} navigate={navigate} t={translate} view="embedded" />
    </div>
  );
}

function MarketplaceNotice({
  notice,
  onDismiss,
  t,
}: Readonly<{
  notice: MarketplaceNotice;
  onDismiss: (id: string) => void;
  t: MarketplaceTranslate;
}>) {
  return (
    <div className={`dh-notice dh-notice--${notice.kind}${notice.leaving ? ' is-leaving' : ''}`}>
      <span aria-hidden="true" className="dh-notice__dot" />
      <span className="dh-notice__message">{notice.message}</span>
      <button
        aria-label={t('agritech.marketplace.close')}
        className="dh-notice__close"
        onClick={() => {
          onDismiss(notice.id);
        }}
        type="button"
      >
        <MarketplaceIcon name="close" />
      </button>
    </div>
  );
}

interface HeaderProps {
  activeSection: MarketplaceSection;
  cartCount: number;
  /** In-flight deals awaiting this actor's own consent; see `dealsAwaitingConsent`. */
  dealsBadge: number;
  favoriteCount: number;
  navigate: MarketplaceNavigate;
  onSearch: (event: SyntheticEvent<HTMLFormElement>) => void;
  onSelectSuggestion: (suggestion: MarketplacePublicSuggestionDto) => void;
  search: string;
  setSearch: (value: string) => void;
  /** The deals entry is private work, so it only exists for a signed-in visitor. */
  signedIn: boolean;
  suggestions: Resource<MarketplacePublicSuggestionDto[]>;
  t: MarketplaceTranslate;
  verificationStatus?: string;
  view: MarketplaceView;
}

function MarketplaceHeader({
  activeSection,
  cartCount,
  dealsBadge,
  favoriteCount,
  navigate,
  onSearch,
  onSelectSuggestion,
  search,
  setSearch,
  signedIn,
  suggestions,
  t,
  verificationStatus,
  view,
}: Readonly<HeaderProps>) {
  return (
    <header className="dh-header">
      <a className="dh-skip-link" href="#dh-main">
        {t('agritech.marketplace.accessibility.skipToContent')}
      </a>
      <div className="dh-header__main">
        <button
          aria-label={t('agritech.marketplace.brand')}
          className="dh-brand"
          onClick={() => {
            navigate('/');
          }}
          type="button"
        >
          <MarketplaceBrandLockup t={t} />
        </button>
        <button
          className={`dh-button dh-button--catalog${view === 'catalog' ? ' is-active' : ''}`}
          onClick={() => {
            navigate('/catalog');
          }}
          type="button"
        >
          <MarketplaceIcon name="produce" />
          {t('agritech.marketplace.catalog')}
        </button>
        <div className="dh-search-shell">
          <form className="dh-search" onSubmit={onSearch} role="search">
            <label className="dh-sr-only" htmlFor="dh-search">
              {t('agritech.marketplace.search')}
            </label>
            <input
              autoComplete="off"
              id="dh-search"
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder={t('agritech.marketplace.search')}
              type="search"
              value={search}
            />
            <button aria-label={t('agritech.marketplace.search')} type="submit">
              <MarketplaceIcon name="search" />
            </button>
          </form>
          {suggestions.status === 'loading' ? (
            <span aria-live="polite" className="dh-search-state" role="status">
              {t('agritech.marketplace.search.loading')}
            </span>
          ) : null}
          {suggestions.status === 'error' ? (
            <span aria-live="polite" className="dh-search-state dh-search-state--error" role="status">
              {t('agritech.marketplace.search.unavailable')}
            </span>
          ) : null}
          {suggestions.status === 'ready' ? (
            <ul
              aria-label={t('agritech.marketplace.search.suggestions')}
              aria-live="polite"
              className="dh-search-suggestions"
              id="dh-search-suggestions"
            >
              {suggestions.data.map((suggestion) => (
                <li key={`${suggestion.kind}:${suggestion.id}`}>
                  <button
                    onClick={() => {
                      onSelectSuggestion(suggestion);
                    }}
                    type="button"
                  >
                    <span>{suggestion.label}</span>
                    <small>{t(`agritech.marketplace.search.kind.${suggestion.kind}`)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <nav aria-label={t('agritech.marketplace.accessibility.primaryNavigation')} className="dh-header__nav">
          {signedIn ? (
            <HeaderAction
              active={view === 'deals' || view === 'contract'}
              badge={dealsBadge}
              badgeLabel={t('agritech.marketplace.deals.badge', { count: dealsBadge })}
              icon="contract"
              label={t('agritech.marketplace.deals.nav')}
              onClick={() => {
                navigate('/deals');
              }}
            />
          ) : null}
          <HeaderAction
            active={view === 'requests'}
            icon="orders"
            label={t('agritech.marketplace.orders')}
            onClick={() => {
              navigate('/requests');
            }}
          />
          <HeaderAction
            active={view === 'favorites'}
            badge={favoriteCount}
            icon="heart"
            label={t('agritech.marketplace.favorites')}
            onClick={() => {
              navigate('/favorites');
            }}
          />
          <HeaderAction
            active={view === 'cart'}
            badge={cartCount}
            icon="cart"
            label={t('agritech.marketplace.cart')}
            onClick={() => {
              navigate('/cart');
            }}
          />
          <HeaderAction
            active={view === 'account' || view === 'verification'}
            icon={verificationStatus === 'verified' ? 'shield' : 'account'}
            label={
              verificationStatus === 'verified'
                ? t('agritech.marketplace.account')
                : t('agritech.marketplace.verification')
            }
            onClick={() => {
              navigate(verificationStatus === 'verified' ? '/account' : '/verification');
            }}
          />
        </nav>
        <div className="dh-header__preferences">
          <LanguageSwitcher compact variant="menu" />
        </div>
      </div>
      <nav aria-label={t('agritech.marketplace.catalog.categories')} className="dh-header__categories">
        {(['all', 'equipment', 'seeds', 'produce'] as const).map((section) => (
          <button
            aria-current={view === 'catalog' && activeSection === section}
            key={section}
            onClick={() => {
              navigate(section === 'all' ? '/catalog' : `/catalog?section=${section}`);
            }}
            type="button"
          >
            {t(`agritech.marketplace.section.${section}`)}
          </button>
        ))}
      </nav>
      <div className="dh-header__mobile-preferences">
        <LanguageSwitcher compact variant="menu" />
      </div>
    </header>
  );
}

function HeaderAction({
  active,
  badge,
  badgeLabel,
  icon,
  label,
  onClick,
}: Readonly<{
  active: boolean;
  badge?: number;
  /** What the badge counts, said in words, because the glyph and the digit cannot. */
  badgeLabel?: string;
  icon: 'account' | 'cart' | 'contract' | 'heart' | 'orders' | 'shield';
  label: string;
  onClick: () => void;
}>) {
  const badgeAttributes = badgeLabel ? { 'aria-label': badgeLabel } : {};
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={active ? 'is-active' : ''}
      onClick={onClick}
      type="button"
    >
      <span>
        <MarketplaceIcon name={icon} />
        {badge ? <em {...badgeAttributes}>{badge}</em> : null}
      </span>
      <small>{label}</small>
    </button>
  );
}

function MarketplaceLoading({ t }: Readonly<{ t: MarketplaceTranslate }>) {
  return (
    <div aria-busy="true" aria-label={t('agritech.marketplace.loading')} className="dh-loading">
      <div className="dh-skeleton dh-skeleton--hero" />
      <MarketplaceSkeleton count={8} />
    </div>
  );
}

interface MarketplaceCatalogAccessNoticeProps {
  access: { actionLabel?: string; hint?: string; path?: string } | undefined;
  catalogView: boolean;
  loading: boolean;
  navigate: MarketplaceNavigate;
  signedIn: boolean;
  unavailable: boolean;
}

/**
 * One notice above the catalog carries the reason a signed-in actor cannot
 * transact yet, plus its recovery route. It replaced the identical hint that
 * used to repeat under every product card; a signed-out visitor is not shown a
 * reason here because the header sign-in entry, the local preview confirmation,
 * and the cart route already state that boundary.
 */
function MarketplaceCatalogAccessNotice({
  access,
  catalogView,
  loading,
  navigate,
  signedIn,
  unavailable,
}: Readonly<MarketplaceCatalogAccessNoticeProps>) {
  const hint = access?.hint;
  if (!catalogView || !signedIn || loading || unavailable || !hint) {
    return null;
  }
  const actionLabel = access.actionLabel;
  const path = access.path;

  return (
    <div className="dh-state-inline dh-access-notice" role="status">
      <MarketplaceIcon name="shield" />
      <span>{hint}</span>
      {actionLabel && path ? (
        <button
          className="dh-text-button"
          onClick={() => {
            navigate(path);
          }}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function MarketplaceSignedOut({ navigate, t }: Readonly<{ navigate: MarketplaceNavigate; t: MarketplaceTranslate }>) {
  const returnUrl =
    typeof globalThis.location === 'undefined' ? '/' : `${globalThis.location.pathname}${globalThis.location.search}`;
  return (
    <section className="dh-signed-out">
      <MarketplaceEmblem className="dh-emblem" />
      <p className="dh-eyebrow">{t('agritech.marketplace.title')}</p>
      <h1>{t('agritech.marketplace.auth.title')}</h1>
      <p>{t('agritech.marketplace.auth.description')}</p>
      <button
        className="dh-button dh-button--primary"
        onClick={() => {
          navigate(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
        }}
        type="button"
      >
        {t('agritech.marketplace.signIn')}
        <MarketplaceIcon name="arrow" />
      </button>
    </section>
  );
}

function MarketplaceConfirmation({
  confirmation,
  onClose,
  pending,
  t,
}: Readonly<{ confirmation: Confirmation; onClose: () => void; pending: boolean; t: MarketplaceTranslate }>) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();
    const backdrop = backdropRef.current;
    const siblings = backdrop?.parentElement
      ? Array.from(backdrop.parentElement.children).filter(
          (element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop,
        )
      : [];
    const siblingState = siblings.map((element) => ({
      ariaHidden: element.getAttribute('aria-hidden'),
      element,
      inert: element.inert,
    }));
    for (const element of siblings) {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      const firstIsFocused = first?.matches(':focus') ?? false;
      const lastIsFocused = last?.matches(':focus') ?? false;
      if (event.shiftKey && (firstIsFocused || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && lastIsFocused) {
        event.preventDefault();
        first?.focus();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      for (const state of siblingState) {
        state.element.inert = state.inert;
        if (state.ariaHidden === null) {
          state.element.removeAttribute('aria-hidden');
        } else {
          state.element.setAttribute('aria-hidden', state.ariaHidden);
        }
      }
      previousFocus.current?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="dh-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !pending) {
          onClose();
        }
      }}
      ref={backdropRef}
    >
      <section
        aria-describedby="dh-confirm-description"
        aria-labelledby="dh-confirm-title"
        aria-modal="true"
        className="dh-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label={t('agritech.marketplace.close')}
          className="dh-icon-button dh-dialog__close"
          disabled={pending}
          onClick={onClose}
          type="button"
        >
          <MarketplaceIcon name="close" />
        </button>
        <span className="dh-seal dh-seal--small">
          <MarketplaceIcon name="contract" />
        </span>
        <h2 id="dh-confirm-title">{confirmation.title}</h2>
        <p id="dh-confirm-description">{confirmation.description}</p>
        <div className="dh-dialog__actions">
          <button className="dh-button dh-button--secondary" disabled={pending} onClick={onClose} type="button">
            {t('agritech.marketplace.cancel')}
          </button>
          <button
            className="dh-button dh-button--primary"
            disabled={pending}
            onClick={() => void Promise.resolve(confirmation.onConfirm()).finally(onClose)}
            ref={confirmRef}
            type="button"
          >
            {pending ? t('agritech.marketplace.loading') : confirmation.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function MarketplaceFooter({ navigate, t }: Readonly<{ navigate: MarketplaceNavigate; t: MarketplaceTranslate }>) {
  return (
    <footer className="dh-footer">
      <div className="dh-footer__brand">
        <button
          aria-label={t('agritech.marketplace.brand')}
          className="dh-brand dh-brand--footer"
          onClick={() => {
            navigate('/');
          }}
          type="button"
        >
          <MarketplaceBrandLockup t={t} />
        </button>
        <p>{t('agritech.marketplace.footer.description')}</p>
      </div>
      <div>
        <strong>{t('agritech.marketplace.footer.forBuyers')}</strong>
        <button
          aria-label={`${t('agritech.marketplace.footer.forBuyers')}: ${t('agritech.marketplace.catalog')}`}
          onClick={() => {
            navigate('/catalog');
          }}
          type="button"
        >
          {t('agritech.marketplace.catalog')}
        </button>
        <button
          aria-label={`${t('agritech.marketplace.footer.forBuyers')}: ${t('agritech.marketplace.orders')}`}
          onClick={() => {
            navigate('/requests');
          }}
          type="button"
        >
          {t('agritech.marketplace.orders')}
        </button>
      </div>
      <div>
        <strong>{t('agritech.marketplace.footer.forSellers')}</strong>
        <button
          aria-label={`${t('agritech.marketplace.footer.forSellers')}: ${t('agritech.marketplace.orders.feed')}`}
          onClick={() => {
            navigate('/requests');
          }}
          type="button"
        >
          {t('agritech.marketplace.orders.feed')}
        </button>
        <button
          aria-label={`${t('agritech.marketplace.footer.forSellers')}: ${t('agritech.marketplace.verification')}`}
          onClick={() => {
            navigate('/verification');
          }}
          type="button"
        >
          {t('agritech.marketplace.verification')}
        </button>
      </div>
      <div>
        <strong>{t('agritech.marketplace.footer.help')}</strong>
        <button
          onClick={() => {
            navigate('/auth');
          }}
          type="button"
        >
          {t('user.form.login')}
        </button>
        <button
          onClick={() => {
            navigate('/account');
          }}
          type="button"
        >
          {t('agritech.marketplace.account')}
        </button>
        <button
          onClick={() => {
            navigate('/problems');
          }}
          type="button"
        >
          {t('site.problems.title')}
        </button>
        <span>{t('agritech.marketplace.footer.providerBoundary')}</span>
      </div>
      <p className="dh-footer__legal">{t('agritech.marketplace.footer.legal')}</p>
    </footer>
  );
}

function MarketplaceMobileNav({
  cartCount,
  navigate,
  t,
  view,
}: Readonly<{ cartCount: number; navigate: MarketplaceNavigate; t: MarketplaceTranslate; view: MarketplaceView }>) {
  const items: Array<{
    href: string;
    icon: 'account' | 'cart' | 'home' | 'orders' | 'produce';
    label: string;
    views: MarketplaceView[];
  }> = [
    { href: '/', icon: 'home', label: t('agritech.marketplace.home'), views: ['home'] },
    {
      href: '/catalog',
      icon: 'produce',
      label: t('agritech.marketplace.catalog'),
      views: ['catalog', 'product', 'seller'],
    },
    { href: '/requests', icon: 'orders', label: t('agritech.marketplace.orders'), views: ['requests'] },
    { href: '/cart', icon: 'cart', label: t('agritech.marketplace.cart'), views: ['cart'] },
    {
      href: '/account',
      icon: 'account',
      label: t('agritech.marketplace.account'),
      views: ['account', 'contract', 'favorites', 'verification'],
    },
  ];
  return (
    <nav aria-label={t('agritech.marketplace.accessibility.mobileNavigation')} className="dh-mobile-nav">
      {items.map((item) => (
        <button
          aria-current={item.views.includes(view) ? 'page' : undefined}
          key={item.href}
          onClick={() => {
            navigate(item.href);
          }}
          type="button"
        >
          <span>
            <MarketplaceIcon name={item.icon} />
            {item.icon === 'cart' && cartCount > 0 ? <em>{cartCount}</em> : null}
          </span>
          <small>{item.label}</small>
        </button>
      ))}
    </nav>
  );
}
