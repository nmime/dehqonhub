// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-WEB-006
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceData } from '../model/use-marketplace-data';
import {
  MarketplaceListingCreate,
  marketplaceListingImageLimit,
  type MarketplaceListingOutcome,
  type MarketplaceListingSubmission,
} from './marketplace-listing-create';
import type { MarketplacePhotoCapability, MarketplacePhotoUploadOutcome } from './marketplace-photo-upload';
import { marketplaceListingKindForRole, marketplaceListingSectionFor, type MarketplaceListing } from './marketplace-ui';

const testState = vi.hoisted(() => {
  const createProduce = vi.fn();
  const createSupplierProduct = vi.fn();
  const getPhotoCapability = vi.fn();
  const listSuggestions = vi.fn();
  const publishListing = vi.fn();
  return {
    // One stable client object for the whole file. A fresh object per render
    // would change the identity every effect depends on and spin the page.
    api: {
      agriTechOperationsControllerCreateProduce: createProduce,
      agriTechOperationsControllerCreateSupplierProduct: createSupplierProduct,
      marketplacePublicControllerListSuggestions: listSuggestions,
      marketplaceMediaControllerGetCapability: getPhotoCapability,
      marketplacePublicationControllerPublishListing: publishListing,
    },
    createProduce,
    createSupplierProduct,
    listSuggestions,
    marketplaceData: undefined as MarketplaceData | undefined,
    publishListing,
    refresh: vi.fn(),
    requestOptions: {},
    translate: (key: string, params?: Record<string, number | string>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  };
});

vi.mock('@app/frontend-runtime', () => ({
  observer: <T,>(component: T): T => component,
  useI18n: () => ({ locale: 'en', t: testState.translate }),
}));

vi.mock('@app/frontend-feature-user-logout', () => ({
  useLogout: () => ({ model: { isPending: false }, signOut: () => undefined }),
}));

vi.mock('@app/frontend-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-api-client')>();
  return {
    ...actual,
    useUserApiClient: () => ({ api: testState.api, requestOptions: testState.requestOptions }),
  };
});

vi.mock('../model/use-marketplace-data', () => ({
  useMarketplaceData: () => testState.marketplaceData,
}));

vi.mock('../../../shared/ui', () => ({
  LanguageSwitcher: () => null,
  ThemeSwitcher: () => null,
}));

const t = testState.translate;
const emptyList = { data: [], status: 'empty' as const };
const now = '2026-08-20T10:00:00.000Z';

const catalogListing: MarketplaceListing = {
  category: 'seed',
  description: 'Certified corn seed',
  id: 'listing-1',
  images: [],
  kind: 'product',
  name: 'Corn seed',
  priceUzs: 1_250_000,
  promoted: false,
  provenance: 'live',
  publishedAt: now,
  rating: { average: null, count: 0 },
  region: 'Samarqand',
  sampleAvailable: true,
  section: 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId: 'seller-1',
  supplierName: 'Seed cooperative',
  transactional: true,
  unit: 't',
};

const catalog = { data: [catalogListing], status: 'ready' as const };

const photoCapability: MarketplacePhotoCapability = {
  configured: true,
  maximumByteSize: 5 * 1024 * 1024,
  mediaTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

/** Distinct 22-character identifiers, so each accepted upload has its own path. */
const storedPhotoIds = ['AAAAAAAAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBBBBBBBB', 'CCCCCCCCCCCCCCCCCCCCCC'];

const storingUploader = () => {
  let index = 0;
  return vi.fn((): Promise<MarketplacePhotoUploadOutcome> => {
    const id = storedPhotoIds[index % storedPhotoIds.length] ?? storedPhotoIds[0]!;
    index += 1;
    return Promise.resolve({
      path: `/marketplace/media/${id}`,
      reference: `public-asset:${id}`,
      status: 'stored',
    });
  });
};

const photoFile = (name: string, type = 'image/webp', size = 1024) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const fileField = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

const choose = (files: readonly File[]) => {
  fireEvent.change(fileField(), { target: { files } });
};

const renderCreate = (
  overrides: Partial<Parameters<typeof MarketplaceListingCreate>[0]> = {},
  onSubmit: (submission: MarketplaceListingSubmission) => Promise<MarketplaceListingOutcome> = () =>
    Promise.resolve({ status: 'published' }),
) =>
  render(
    <MarketplaceListingCreate
      catalog={catalog}
      kind="product"
      locale="en"
      navigate={vi.fn()}
      onSubmit={onSubmit}
      t={t}
      {...overrides}
    />,
  );

/** Fills every field the seller-side form requires, so only the case under test fails. */
const fillProductForm = () => {
  for (const label of [
    'agritech.marketplace.newListing.field.titleEn',
    'agritech.marketplace.newListing.field.titleRu',
    'agritech.marketplace.newListing.field.titleUz',
    'agritech.marketplace.newListing.field.titleUzCyrl',
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'Corn seed' } });
  }
  fireEvent.change(screen.getByLabelText('agritech.marketplace.newListing.field.description'), {
    target: { value: 'Certified hybrid corn seed, 2026 harvest.' },
  });
  fireEvent.change(screen.getByLabelText('agritech.marketplace.filter.region'), {
    target: { value: 'Samarqand' },
  });
  fireEvent.change(screen.getByLabelText('agritech.marketplace.newListing.field.price'), {
    target: { value: '1250000' },
  });
  fireEvent.change(screen.getByLabelText('agritech.marketplace.product.unit'), { target: { value: 't' } });
  fireEvent.change(screen.getByLabelText('agritech.marketplace.product.stock'), { target: { value: '20' } });
};

const submitForm = () => {
  fireEvent.click(screen.getByRole('button', { name: /agritech\.marketplace\.newListing\.submit$/u }));
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('listing creation capability', () => {
  it('gives a seller the producer-side kind, a farmer produce, and a buyer none', () => {
    // The one home of the creation rule. Selling is broader than creating — a
    // farmer both buys and sells — so this is asserted on its own predicate.
    expect(marketplaceListingKindForRole('seller')).toBe('product');
    expect(marketplaceListingKindForRole('farmer')).toBe('produce');
    expect(marketplaceListingKindForRole('buyer')).toBeUndefined();
    expect(marketplaceListingKindForRole(undefined)).toBeUndefined();
  });

  it('derives the catalog section from the listing rather than from a choice', () => {
    expect(marketplaceListingSectionFor('product', 'equipment')).toBe('equipment');
    expect(marketplaceListingSectionFor('product', 'irrigation')).toBe('equipment');
    expect(marketplaceListingSectionFor('product', 'seed')).toBe('seeds');
    expect(marketplaceListingSectionFor('produce', undefined)).toBe('produce');
  });
});

describe('MarketplaceListingCreate', () => {
  it('offers the seller the product fields and never the produce fields', () => {
    renderCreate();

    expect(screen.getByLabelText('agritech.marketplace.newListing.field.titleRu')).toBeTruthy();
    expect(screen.getByLabelText('agritech.marketplace.filter.category')).toBeTruthy();
    expect(screen.getByLabelText('agritech.marketplace.product.unit')).toBeTruthy();
    // A seller does not grade a harvest and has no availability window.
    expect(screen.queryByLabelText('agritech.marketplace.filter.grade')).toBeNull();
    expect(screen.queryByLabelText('agritech.marketplace.newListing.field.availableFrom')).toBeNull();
    expect(screen.queryByLabelText('agritech.marketplace.newListing.field.cropTitle')).toBeNull();
  });

  it('offers the farmer the produce fields, no per-locale titles and its own photographs', () => {
    renderCreate({ kind: 'produce', onUploadPhoto: storingUploader(), photoCapability });

    expect(screen.getByLabelText('agritech.marketplace.newListing.field.cropTitle')).toBeTruthy();
    expect(screen.getByLabelText('agritech.marketplace.filter.grade')).toBeTruthy();
    expect(screen.getByLabelText('agritech.marketplace.newListing.field.availableUntil')).toBeTruthy();
    expect(screen.queryByLabelText('agritech.marketplace.newListing.field.titleRu')).toBeNull();
    expect(screen.queryByLabelText('agritech.marketplace.filter.category')).toBeNull();
    // A harvest now carries its own photographs, so the field is the same one a
    // seller gets rather than an explanation of why there is none.
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });

  it('offers an ordinary file field accepting exactly the photograph types the API stores', () => {
    renderCreate({ onUploadPhoto: storingUploader(), photoCapability });

    const field = fileField();
    expect(field.accept).toBe('image/jpeg,image/png,image/webp');
    expect(field.multiple).toBe(true);
    // No `capture`: a phone must be free to offer its gallery, and a desktop its
    // file picker, from this one control.
    expect(field.getAttribute('capture')).toBeNull();
    expect(field.disabled).toBe(false);
    // The library picker is gone; nothing here offers someone else's photograph.
    expect(document.querySelector('.dh-listing-photos')).toBeNull();
    expect(screen.queryAllByRole('checkbox', { name: /wheat-grain/u })).toHaveLength(0);
  });

  it('says a deployment without object storage cannot keep a photograph, and offers no control', () => {
    renderCreate({
      onUploadPhoto: storingUploader(),
      photoCapability: { ...photoCapability, configured: false },
    });

    expect(document.querySelector('[data-photo-upload="unconfigured"]')?.textContent).toBe(
      'agritech.marketplace.photos.unavailable',
    );
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('refuses a file whose type or size the API would reject, naming the file and storing nothing', async () => {
    const onUploadPhoto = storingUploader();
    renderCreate({ onUploadPhoto, photoCapability });

    choose([photoFile('scan.pdf', 'application/pdf'), photoFile('huge.webp', 'image/webp', 6 * 1024 * 1024)]);

    await waitFor(() => {
      expect(document.querySelectorAll('.dh-photo-upload__errors li')).toHaveLength(2);
    });
    const messages = [...document.querySelectorAll('.dh-photo-upload__errors li')].map((node) => node.textContent);
    expect(messages[0]).toContain('agritech.marketplace.photos.error.type');
    expect(messages[0]).toContain('scan.pdf');
    expect(messages[1]).toContain('agritech.marketplace.photos.error.tooLarge');
    expect(messages[1]).toContain('huge.webp');
    expect(onUploadPhoto).not.toHaveBeenCalled();
  });

  it('reports a refused upload against the file that caused it and attaches nothing', async () => {
    const onUploadPhoto = vi.fn((): Promise<MarketplacePhotoUploadOutcome> =>
      Promise.resolve({ reason: 'storage', status: 'refused' }),
    );
    renderCreate({ onUploadPhoto, photoCapability });

    choose([photoFile('bugdoy.webp')]);

    await waitFor(() => {
      expect(document.querySelector('.dh-photo-upload__errors li')?.textContent).toContain(
        'agritech.marketplace.photos.error.storage',
      );
    });
    expect(document.querySelector('.dh-photo-upload__errors li')?.textContent).toContain('bugdoy.webp');
    expect(document.querySelectorAll('.dh-photo-upload__list li')).toHaveLength(0);
  });

  it('removes one uploaded photograph before the listing is submitted', async () => {
    renderCreate({ onUploadPhoto: storingUploader(), photoCapability });

    choose([photoFile('first.webp'), photoFile('second.webp')]);
    await waitFor(() => {
      expect(document.querySelectorAll('.dh-photo-upload__list li')).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: /photos\.remove.*first\.webp/u }));

    await waitFor(() => {
      expect(document.querySelectorAll('.dh-photo-upload__list li')).toHaveLength(1);
    });
    expect(document.querySelector('.dh-photo-upload__list li img')?.getAttribute('src')).toBe(
      `/marketplace/media/${storedPhotoIds[1]}`,
    );
  });

  it('names every required field it refuses and does not call the server', () => {
    const onSubmit = vi.fn(() => Promise.resolve<MarketplaceListingOutcome>({ status: 'published' }));
    renderCreate({}, onSubmit);

    submitForm();

    expect(onSubmit).not.toHaveBeenCalled();
    const messages = [...document.querySelectorAll('.dh-listing-field__error')].map((node) => node.textContent);
    // Each message carries the field's own label, not a generic "invalid input".
    expect(messages).toContain(
      'agritech.marketplace.newListing.error.required:{"field":"agritech.marketplace.newListing.field.titleEn"}',
    );
    expect(messages).toContain(
      'agritech.marketplace.newListing.error.required:{"field":"agritech.marketplace.newListing.field.titleUzCyrl"}',
    );
    expect(messages).toContain(
      'agritech.marketplace.newListing.error.required:{"field":"agritech.marketplace.filter.region"}',
    );
    expect(document.querySelector('[data-listing-errors="summary"]')).toBeTruthy();
    expect(screen.getByLabelText('agritech.marketplace.newListing.field.titleEn').getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  it('refuses a price that is not a whole number and clears the message on edit', () => {
    const onSubmit = vi.fn(() => Promise.resolve<MarketplaceListingOutcome>({ status: 'published' }));
    renderCreate({}, onSubmit);
    fillProductForm();
    fireEvent.change(screen.getByLabelText('agritech.marketplace.newListing.field.price'), {
      target: { value: '1 250 000,5' },
    });

    submitForm();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('agritech.marketplace.newListing.field.price').getAttribute('aria-invalid')).toBe(
      'true',
    );

    fireEvent.change(screen.getByLabelText('agritech.marketplace.newListing.field.price'), {
      target: { value: '1250000' },
    });
    expect(
      screen.getByLabelText('agritech.marketplace.newListing.field.price').getAttribute('aria-invalid'),
    ).toBeNull();
  });

  it('refuses the availability window when it ends before it starts', () => {
    const onSubmit = vi.fn(() => Promise.resolve<MarketplaceListingOutcome>({ status: 'published' }));
    renderCreate({ kind: 'produce' }, onSubmit);
    fireEvent.change(screen.getByLabelText('agritech.marketplace.newListing.field.cropTitle'), {
      target: { value: 'Wheat' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.filter.region'), { target: { value: 'Jizzax' } });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.newListing.field.pricePerKg'), {
      target: { value: '5200' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.newListing.field.quantityKg'), {
      target: { value: '40000' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.newListing.field.availableFrom'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(screen.getByLabelText('agritech.marketplace.newListing.field.availableUntil'), {
      target: { value: '2026-09-01' },
    });

    submitForm();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText('agritech.marketplace.newListing.field.availableUntil').getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('submits the whole listing once and reports that moderation is next', async () => {
    const submissions: MarketplaceListingSubmission[] = [];
    const onSubmit = vi.fn((submission: MarketplaceListingSubmission) => {
      submissions.push(submission);
      return Promise.resolve<MarketplaceListingOutcome>({ status: 'published' });
    });
    renderCreate({ onUploadPhoto: storingUploader(), photoCapability }, onSubmit);
    fillProductForm();
    fireEvent.click(screen.getByLabelText('agritech.marketplace.filter.sampleAvailable'));
    choose([photoFile('bugdoy.webp')]);
    await waitFor(() => {
      expect(document.querySelectorAll('.dh-photo-upload__list li')).toHaveLength(1);
    });

    submitForm();
    submitForm();

    await waitFor(() => {
      expect(document.querySelector('[data-listing-outcome="published"]')).toBeTruthy();
    });
    // The busy control is disabled while the command is in flight, so the second
    // click cannot produce a second listing.
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submissions[0]).toEqual({
      category: 'seed',
      description: 'Certified hybrid corn seed, 2026 harvest.',
      images: [`/marketplace/media/${storedPhotoIds[0]}`],
      kind: 'product',
      name: 'Corn seed',
      nameRu: 'Corn seed',
      nameUz: 'Corn seed',
      nameUzCyrl: 'Corn seed',
      priceUzs: 1_250_000,
      region: 'Samarqand',
      sampleAvailable: true,
      stockQuantity: 20,
      unit: 't',
    });
  });

  it('stops at the photograph limit rather than uploading a sixth', async () => {
    let minted = 0;
    const onUploadPhoto = vi.fn((): Promise<MarketplacePhotoUploadOutcome> => {
      minted += 1;
      const id = `${minted}`.padStart(22, 'Z');
      return Promise.resolve({
        path: `/marketplace/media/${id}`,
        reference: `public-asset:${id}`,
        status: 'stored',
      });
    });
    renderCreate({ onUploadPhoto, photoCapability });

    choose(Array.from({ length: marketplaceListingImageLimit + 1 }, (_, index) => photoFile(`photo-${index}.webp`)));

    await waitFor(() => {
      expect(document.querySelectorAll('.dh-photo-upload__list li')).toHaveLength(marketplaceListingImageLimit);
    });
    // The sixth file is never sent, and the actor is told which one was refused.
    expect(onUploadPhoto).toHaveBeenCalledTimes(marketplaceListingImageLimit);
    const refusal = document.querySelector('.dh-photo-upload__errors li')?.textContent;
    expect(refusal).toContain('agritech.marketplace.photos.error.limit');
    expect(refusal).toContain(`photo-${marketplaceListingImageLimit}.webp`);
    expect(fileField().disabled).toBe(true);
  });

  it('shows a typed server refusal on the field the server named', async () => {
    const onSubmit = vi.fn(() =>
      Promise.resolve<MarketplaceListingOutcome>({
        field: 'priceUzs',
        message: 'priceUzs must not be greater than 9999999999999',
        status: 'refused',
      }),
    );
    renderCreate({}, onSubmit);
    fillProductForm();

    submitForm();

    await waitFor(() => {
      expect(document.querySelector('[data-listing-outcome="refused"]')?.textContent).toBe(
        'priceUzs must not be greater than 9999999999999',
      );
    });
    // The refusal lands on the price control, which is the form's own name for
    // the DTO member the server rejected.
    const price = screen.getByLabelText('agritech.marketplace.newListing.field.price');
    expect(price.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(`${price.getAttribute('id') ?? ''}-error`)?.textContent).toBe(
      'priceUzs must not be greater than 9999999999999',
    );
    // Nothing was created, so the draft is kept for a second attempt.
    expect((price as HTMLInputElement).value).toBe('1250000');
  });

  it('separates a created listing from a published one', async () => {
    renderCreate({}, () => Promise.resolve({ reason: 'source already published', status: 'unpublished' }));
    fillProductForm();

    submitForm();

    await waitFor(() => {
      expect(document.querySelector('[data-listing-outcome="unpublished"]')?.textContent).toBe(
        'agritech.marketplace.newListing.successUnpublished:{"reason":"source already published"}',
      );
    });
    expect(document.querySelector('[data-listing-outcome="published"]')).toBeNull();
  });

  it('shows a buyer an honest stub instead of a form, a blank page or a 404', () => {
    renderCreate({ kind: undefined });

    expect(document.querySelector('[data-listing-create="role"]')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('agritech.marketplace.newListing.blocked.title');
    expect(screen.getByText('agritech.marketplace.newListing.blocked.description')).toBeTruthy();
    expect(document.querySelector('form')).toBeNull();
  });

  it('tells an account with no settled role to verify rather than that its role forbids listing', () => {
    renderCreate({ kind: undefined, unavailableReason: 'verification' });

    expect(document.querySelector('[data-listing-create="verification"]')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'agritech.marketplace.newListing.blocked.verificationTitle',
    );
    expect(screen.queryByText('agritech.marketplace.newListing.blocked.description')).toBeNull();
  });

  it('names the one missing step and refuses to submit while it stands', () => {
    const onSubmit = vi.fn(() => Promise.resolve<MarketplaceListingOutcome>({ status: 'published' }));
    renderCreate({ accessHint: 'agritech.marketplace.access.sellerOrganization' }, onSubmit);
    fillProductForm();

    submitForm();

    expect(document.querySelector('[data-listing-access="blocked"]')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('the header entry for a new listing', () => {
  const marketplaceData = (role: 'buyer' | 'farmer' | 'seller' | undefined): MarketplaceData => ({
    aiConsultations: emptyList,
    auth: 'signed-in',
    carts: emptyList,
    catalog,
    contracts: emptyList,
    dashboard: { data: null, status: 'empty' },
    favorites: emptyList,
    myRequests: emptyList,
    notifications: emptyList,
    offersByRequest: { data: {}, status: 'empty' },
    ownedListingPublications: emptyList,
    ownedRequestPublications: emptyList,
    partners: emptyList,
    produceListings: emptyList,
    promotionPlans: emptyList,
    promotions: emptyList,
    providerReadiness: { data: null, status: 'empty' },
    refresh: testState.refresh,
    requests: emptyList,
    sampleUsage: { data: { limit: 5, period: 'current', policyVersion: 1, remaining: 5, used: 0 }, status: 'idle' },
    samples: emptyList,
    selectedListing: { data: null, status: 'idle' },
    seller: { data: null, status: 'idle' },
    sellerCatalog: emptyList,
    supplierProducts: emptyList,
    verification: role
      ? {
          data: {
            createdAt: now,
            documents: [],
            id: 'verification-1',
            identityAssurance: 'mock',
            level: 'verified',
            oneIdLinked: true,
            providerMode: 'mock',
            revision: 1,
            role,
            simulation: true,
            status: 'verified',
            step: 'complete',
            updatedAt: now,
          },
          status: 'ready',
        }
      : { data: null, status: 'empty' },
  });

  const entry = () => screen.queryByRole('button', { name: /agritech\.marketplace\.newListing\.nav/u });

  beforeEach(() => {
    testState.listSuggestions.mockResolvedValue({ data: { data: { items: [] } }, response: new Response() });
  });

  it('is offered to a seller and a farmer, immediately before the deals entry', async () => {
    const { MarketplacePage } = await import('./marketplace-page');
    for (const role of ['seller', 'farmer'] as const) {
      testState.marketplaceData = marketplaceData(role);
      const view = render(<MarketplacePage navigate={vi.fn()} view="catalog" />);
      const buttons = [...document.querySelectorAll('.dh-header__nav > button')];
      // The entry carries both wordings and a media query prints one of them: the
      // complete name from 64rem up, the short form below it. jsdom applies no
      // stylesheet, so both are in the box here - what this asserts is that the
      // pair exists and that the entry sits immediately before the deals one.
      expect(buttons[0]?.querySelector('.dh-header__nav-label--full')?.textContent).toBe(
        'agritech.marketplace.newListing.title',
      );
      expect(buttons[0]?.querySelector('.dh-header__nav-label--short')?.textContent).toBe(
        'agritech.marketplace.newListing.nav',
      );
      expect(buttons[1]?.querySelector('small')?.textContent).toBe('agritech.marketplace.deals.nav');
      view.unmount();
    }
  });

  it('is absent for a buyer and for an account with no verification', async () => {
    const { MarketplacePage } = await import('./marketplace-page');
    for (const role of ['buyer', undefined] as const) {
      testState.marketplaceData = marketplaceData(role);
      const view = render(<MarketplacePage navigate={vi.fn()} view="catalog" />);
      expect(entry()).toBeNull();
      view.unmount();
    }
  });

  it('answers the route with the honest stub for a buyer who reaches it directly', async () => {
    const { MarketplacePage } = await import('./marketplace-page');
    testState.marketplaceData = marketplaceData('buyer');

    render(<MarketplacePage navigate={vi.fn()} view="newListing" />);

    expect(document.querySelector('[data-listing-create="role"]')).toBeTruthy();
    expect(entry()).toBeNull();
  });

  it('answers the route with the create form for a seller', async () => {
    const { MarketplacePage } = await import('./marketplace-page');
    testState.marketplaceData = marketplaceData('seller');

    render(<MarketplacePage navigate={vi.fn()} view="newListing" />);

    expect(document.querySelector('[data-listing-kind="product"]')).toBeTruthy();
    // Verification is settled but no approved seller organization exists, so the
    // screen names that one step instead of failing at submit time.
    expect(document.querySelector('[data-listing-access="blocked"]')?.textContent).toContain(
      'agritech.marketplace.access.sellerOrganization',
    );
  });
});
