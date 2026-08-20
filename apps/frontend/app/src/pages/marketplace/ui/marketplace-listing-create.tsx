// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-WEB-006
import { useId, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import type { Locale } from '@app/frontend-runtime';
import type { Resource } from '../model/use-marketplace-data';
import { MarketplaceBusyButton } from './marketplace-loading';
import { MarketplaceIcon } from './marketplace-icon';
import {
  MarketplacePhotoUpload,
  type MarketplacePhotoCapability,
  type MarketplacePhotoUploadOutcome,
} from './marketplace-photo-upload';
import {
  formatMoney,
  marketplaceListingSectionFor,
  type MarketplaceListing,
  type MarketplaceListingKind,
  type MarketplaceNavigate,
  type MarketplaceTranslate,
} from './marketplace-ui';

/**
 * The catalog's own input taxonomy, minus `other`.
 *
 * `other` is a valid column value, but no catalog facet offers it —
 * `categoriesBySection` in `marketplace-discovery.tsx` lists exactly these five
 * — so a listing created as `other` would be unreachable by category. The
 * create screen therefore offers only categories a shopper can filter down to.
 */
export const marketplaceListingCategories = ['equipment', 'irrigation', 'seed', 'fertilizer', 'pesticide'] as const;
export type MarketplaceListingCategory = (typeof marketplaceListingCategories)[number];

/** The harvest grades the produce facets filter on. */
const produceGrades = ['A', 'B', 'C'] as const;
type ProduceGrade = (typeof produceGrades)[number];

/**
 * How many photographs one listing may carry.
 *
 * The database refuses a published snapshot holding more than five
 * (`ck__marketplace_listing_publications__content`), and the publication
 * projection slices the source array to the same bound. Refusing the sixth here
 * names the field instead of letting the photograph vanish at publication time.
 */
export const marketplaceListingImageLimit = 5;

/**
 * The one reference a listing photograph may be: an object this account
 * uploaded, read back through the API on the page's own origin. Anchored at both
 * ends, so a host or a traversal segment cannot pass as one.
 *
 * The server also accepts the checked-in `/media/marketplace/*.webp` library
 * paths, because the seeded demo catalogue is built from them. This form cannot
 * produce one, so the guard here is narrower than the API's on purpose: a draft
 * carrying anything but an upload is a draft this screen did not compose.
 */
const uploadedPhotoPattern = /^\/marketplace\/media\/[A-Za-z0-9_-]{22}$/u;

/** Server-side bounds, restated so the form refuses before the request is made. */
const maximumTitleLength = 200;
const maximumPriceUzs = 9_999_999_999_999;
const maximumQuantity = 2_147_483_647;

/** What the create screen hands the page to send. The kind is never the actor's choice. */
export type MarketplaceListingSubmission =
  | {
      readonly kind: 'product';
      readonly category: MarketplaceListingCategory;
      readonly description: string;
      readonly images: readonly string[];
      readonly name: string;
      readonly nameRu: string;
      readonly nameUz: string;
      readonly nameUzCyrl: string;
      readonly priceUzs: number;
      readonly region: string;
      readonly sampleAvailable: boolean;
      readonly stockQuantity: number;
      readonly unit: string;
    }
  | {
      readonly kind: 'produce';
      readonly availableFrom: string;
      readonly availableUntil: string;
      readonly crop: string;
      readonly grade: ProduceGrade;
      readonly images: readonly string[];
      readonly pricePerKgUzs: number;
      readonly quantityKg: number;
      readonly region: string;
      readonly sampleAvailable: boolean;
    };

/**
 * What the server did, in the actor's terms.
 *
 * Creating a row and publishing it are two commands with two outcomes, and the
 * screen has to say which one happened. `unpublished` means the listing exists
 * but no shopper can reach it yet, which is a different state from `published`
 * (submitted, awaiting moderation) and from `refused` (nothing was created).
 * `field` carries the API member a typed refusal named, so the message can land
 * on the control that caused it.
 */
export type MarketplaceListingOutcome =
  | { readonly status: 'published' }
  | { readonly status: 'unpublished'; readonly reason: string }
  | { readonly status: 'refused'; readonly field?: string; readonly message: string };

export interface MarketplaceListingCreateProps {
  /** Label of the one step still missing before anything can be created. */
  readonly accessActionLabel?: string;
  /**
   * What this deployment can store, read from the API before the control is
   * offered. `undefined` while the answer is in flight; a deployment that
   * answers `configured: false` gets a statement instead of a file field.
   */
  readonly photoCapability?: MarketplacePhotoCapability;
  readonly accessHint?: string;
  /** Current catalog, read only for the region, crop and unit suggestions. */
  readonly catalog: Resource<MarketplaceListing[]>;
  /**
   * Which listing this actor creates, or `undefined` when the role creates none.
   * Always derived from `marketplaceListingKindForRole`; never chosen here.
   */
  readonly kind: MarketplaceListingKind | undefined;
  readonly locale: Locale;
  readonly navigate: MarketplaceNavigate;
  readonly onAccessAction?: () => void;
  readonly onSubmit: (submission: MarketplaceListingSubmission) => Promise<MarketplaceListingOutcome>;
  /** Sends one file and reports what the server did with it. */
  readonly onUploadPhoto?: (file: File) => Promise<MarketplacePhotoUploadOutcome>;
  readonly t: MarketplaceTranslate;
  /**
   * Why there is no form, when `kind` is absent. `role` is a settled role that
   * creates nothing — a buyer — which verification cannot change. `verification`
   * is an account whose role is not settled yet, where the missing step is real
   * and offerable. Telling a buyer to verify would be a dead end, and telling an
   * unverified account that its role forbids listing would be untrue.
   */
  readonly unavailableReason?: 'role' | 'verification';
}

interface ListingDraft {
  availableFrom: string;
  availableUntil: string;
  category: MarketplaceListingCategory;
  crop: string;
  description: string;
  grade: ProduceGrade;
  images: readonly string[];
  price: string;
  quantity: string;
  region: string;
  sampleAvailable: boolean;
  titleEn: string;
  titleRu: string;
  titleUz: string;
  titleUzCyrl: string;
  unit: string;
}

type DraftField = keyof ListingDraft;
type DraftErrors = Partial<Record<DraftField, string>>;

const emptyDraft: ListingDraft = {
  availableFrom: '',
  availableUntil: '',
  category: 'seed',
  crop: '',
  description: '',
  grade: 'A',
  images: [],
  price: '',
  quantity: '',
  region: '',
  sampleAvailable: false,
  titleEn: '',
  titleRu: '',
  titleUz: '',
  titleUzCyrl: '',
  unit: '',
};

const keyPrefix = 'agritech.marketplace.newListing.';

/**
 * The label each field is named by — in its own validation message, in the
 * summary, and in a refusal the server raised against it. One table means the
 * message and the control can never name the field differently.
 */
const fieldLabelKeys = {
  availableFrom: `${keyPrefix}field.availableFrom`,
  availableUntil: `${keyPrefix}field.availableUntil`,
  category: 'agritech.marketplace.filter.category',
  crop: `${keyPrefix}field.cropTitle`,
  description: `${keyPrefix}field.description`,
  grade: 'agritech.marketplace.filter.grade',
  images: `${keyPrefix}group.photos`,
  price: `${keyPrefix}field.price`,
  quantity: `${keyPrefix}field.quantityKg`,
  region: 'agritech.marketplace.filter.region',
  sampleAvailable: 'agritech.marketplace.filter.sampleAvailable',
  titleEn: `${keyPrefix}field.titleEn`,
  titleRu: `${keyPrefix}field.titleRu`,
  titleUz: `${keyPrefix}field.titleUz`,
  titleUzCyrl: `${keyPrefix}field.titleUzCyrl`,
  unit: 'agritech.marketplace.product.unit',
} as const satisfies Record<DraftField, string>;

/**
 * Which control a server-named API member belongs to.
 *
 * A validation problem points at the DTO member (`#/priceUzs`), while the form
 * holds one price control for both kinds. Mapping the two vocabularies here lets
 * a typed refusal be shown exactly where a local validation message would be,
 * instead of as a toast that names a field the screen does not have.
 */
const draftFieldByApiMember: Readonly<Record<string, DraftField>> = {
  availableFrom: 'availableFrom',
  availableUntil: 'availableUntil',
  category: 'category',
  crop: 'crop',
  description: 'description',
  grade: 'grade',
  images: 'images',
  name: 'titleEn',
  nameRu: 'titleRu',
  nameUz: 'titleUz',
  nameUzCyrl: 'titleUzCyrl',
  pricePerKgUzs: 'price',
  priceUzs: 'price',
  quantityKg: 'quantity',
  region: 'region',
  sampleAvailable: 'sampleAvailable',
  stockQuantity: 'quantity',
  unit: 'unit',
};

const requiredKey = `${keyPrefix}error.required`;
const tooLongKey = `${keyPrefix}error.tooLong`;
const wholeNumberKey = `${keyPrefix}error.wholeNumber`;
const aboveMaximumKey = `${keyPrefix}error.aboveMaximum`;
const pricePerKgKey = `${keyPrefix}field.pricePerKg`;
const errorSuffix = '-error';

/** Reads a whole number, refusing everything a bare `Number()` would accept loosely. */
const wholeNumber = (value: string): number | undefined => {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)$/u.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const validateTitles = (draft: ListingDraft, t: MarketplaceTranslate): DraftErrors => {
  const errors: DraftErrors = {};
  for (const field of ['titleEn', 'titleRu', 'titleUz', 'titleUzCyrl'] as const) {
    const value = draft[field].trim();
    const label = t(fieldLabelKeys[field]);
    if (!value) {
      errors[field] = t(requiredKey, { field: label });
    } else if (value.length > maximumTitleLength) {
      errors[field] = t(tooLongKey, { field: label, limit: maximumTitleLength });
    }
  }
  return errors;
};

const validateAmount = (
  value: string,
  field: 'price' | 'quantity',
  labelKey: string,
  minimum: number,
  maximum: number,
  t: MarketplaceTranslate,
): DraftErrors => {
  const label = t(labelKey);
  const parsed = wholeNumber(value);
  if (parsed === undefined || parsed < minimum) {
    return { [field]: t(wholeNumberKey, { field: label, minimum }) };
  }
  return parsed > maximum ? { [field]: t(aboveMaximumKey, { field: label, maximum }) } : {};
};

const validatePhotos = (draft: ListingDraft, t: MarketplaceTranslate): DraftErrors => {
  const label = t(fieldLabelKeys.images);
  if (draft.images.length > marketplaceListingImageLimit) {
    return { images: t(`${keyPrefix}error.photoLimit`, { field: label, limit: marketplaceListingImageLimit }) };
  }
  return draft.images.some((image) => !uploadedPhotoPattern.test(image))
    ? { images: t(`${keyPrefix}error.photoUnknown`, { field: label }) }
    : {};
};

const validateProduct = (draft: ListingDraft, t: MarketplaceTranslate): DraftErrors => {
  const errors: DraftErrors = {
    ...validateTitles(draft, t),
    ...validateAmount(draft.price, 'price', fieldLabelKeys.price, 1, maximumPriceUzs, t),
    ...validateAmount(draft.quantity, 'quantity', 'agritech.marketplace.product.stock', 0, maximumQuantity, t),
    ...validatePhotos(draft, t),
  };
  for (const field of ['description', 'region', 'unit'] as const) {
    if (!draft[field].trim()) {
      errors[field] = t(requiredKey, { field: t(fieldLabelKeys[field]) });
    }
  }
  return errors;
};

const validateProduce = (draft: ListingDraft, t: MarketplaceTranslate): DraftErrors => {
  const errors: DraftErrors = {
    ...validateAmount(draft.price, 'price', pricePerKgKey, 1, maximumPriceUzs, t),
    ...validateAmount(draft.quantity, 'quantity', fieldLabelKeys.quantity, 1, maximumQuantity, t),
    ...validatePhotos(draft, t),
  };
  for (const field of ['crop', 'region', 'availableFrom', 'availableUntil'] as const) {
    if (!draft[field].trim()) {
      errors[field] = t(requiredKey, { field: t(fieldLabelKeys[field]) });
    }
  }
  if (draft.availableFrom && draft.availableUntil && draft.availableUntil <= draft.availableFrom) {
    errors.availableUntil = t(`${keyPrefix}error.dateOrder`, {
      field: t(fieldLabelKeys.availableUntil),
      other: t(fieldLabelKeys.availableFrom),
    });
  }
  return errors;
};

const validateDraft = (kind: MarketplaceListingKind, draft: ListingDraft, t: MarketplaceTranslate): DraftErrors =>
  kind === 'product' ? validateProduct(draft, t) : validateProduce(draft, t);

const submissionFor = (kind: MarketplaceListingKind, draft: ListingDraft): MarketplaceListingSubmission =>
  kind === 'product'
    ? {
        category: draft.category,
        description: draft.description.trim(),
        images: [...draft.images],
        kind: 'product',
        name: draft.titleEn.trim(),
        nameRu: draft.titleRu.trim(),
        nameUz: draft.titleUz.trim(),
        nameUzCyrl: draft.titleUzCyrl.trim(),
        priceUzs: Number(draft.price.trim()),
        region: draft.region.trim(),
        sampleAvailable: draft.sampleAvailable,
        stockQuantity: Number(draft.quantity.trim()),
        unit: draft.unit.trim(),
      }
    : {
        availableFrom: draft.availableFrom,
        availableUntil: draft.availableUntil,
        crop: draft.crop.trim(),
        grade: draft.grade,
        images: [...draft.images],
        kind: 'produce',
        pricePerKgUzs: Number(draft.price.trim()),
        quantityKg: Number(draft.quantity.trim()),
        region: draft.region.trim(),
        sampleAvailable: draft.sampleAvailable,
      };

/** Distinct free-text values already in the catalog, so a new listing joins an existing facet. */
const suggestionsFrom = (values: readonly (string | undefined)[], locale: Locale): readonly string[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) =>
    left.localeCompare(right, locale),
  );

/**
 * One labelled control with its own validation message.
 *
 * The message sits beside the control it belongs to, and the control references
 * it through `aria-describedby`, so the field that is wrong is named where the
 * actor is looking rather than only in a summary at the top of the form.
 */
function Field({
  children,
  error,
  hint,
  id,
  label,
  wide,
}: Readonly<{
  children: ReactNode;
  error?: string;
  hint?: string;
  id: string;
  label: string;
  wide?: boolean;
}>) {
  return (
    <div className={wide ? 'dh-listing-field dh-listing-field--wide' : 'dh-listing-field'}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <small className="dh-listing-field__hint" id={`${id}-hint`}>
          {hint}
        </small>
      ) : null}
      {error ? (
        <strong className="dh-listing-field__error" id={`${id}${errorSuffix}`}>
          {error}
        </strong>
      ) : null}
    </div>
  );
}

/**
 * The stub a role that creates nothing reaches.
 *
 * A buyer has no listing to create, so this is neither a step they can complete
 * nor a page that failed: it states what the role does, states that creating is
 * outside it, and offers what they can do instead. It is deliberately not a 404
 * — the address is real, the capability is not theirs.
 */
function ListingCreateUnavailable({
  navigate,
  reason,
  t,
}: Readonly<{ navigate: MarketplaceNavigate; reason: 'role' | 'verification'; t: MarketplaceTranslate }>) {
  const pending = reason === 'verification';
  return (
    <div className="dh-page-stack">
      <div className="dh-empty" data-listing-create={reason}>
        <span>
          <MarketplaceIcon name="alert" />
        </span>
        <h1>{t(pending ? `${keyPrefix}blocked.verificationTitle` : `${keyPrefix}blocked.title`)}</h1>
        <p>{t(pending ? 'agritech.marketplace.access.verify' : `${keyPrefix}blocked.description`)}</p>
        <button
          className="dh-button dh-button--secondary"
          onClick={() => {
            navigate(pending ? '/verification' : '/catalog');
          }}
          type="button"
        >
          {t(pending ? 'agritech.marketplace.access.action.verify' : `${keyPrefix}blocked.action`)}
        </button>
      </div>
    </div>
  );
}

function ListingOutcomeReport({
  outcome,
  t,
}: Readonly<{ outcome: MarketplaceListingOutcome | undefined; t: MarketplaceTranslate }>) {
  if (!outcome) {
    return null;
  }
  if (outcome.status === 'published') {
    return (
      <p className="dh-state-inline dh-state-inline--success" data-listing-outcome="published" role="status">
        {t(`${keyPrefix}success`)}
      </p>
    );
  }
  if (outcome.status === 'unpublished') {
    return (
      <p className="dh-state-inline" data-listing-outcome="unpublished" role="status">
        {t(`${keyPrefix}successUnpublished`, { reason: outcome.reason })}
      </p>
    );
  }
  return (
    <p className="dh-state-inline dh-state-inline--error" data-listing-outcome="refused" role="alert">
      {outcome.message}
    </p>
  );
}

/**
 * Where a seller or a farmer posts a listing.
 *
 * Before this screen the product had no creation surface at all: the cabinet
 * could only *publish* a product or produce row something else had already
 * written, so an actor with an empty catalog had nowhere to start. This route is
 * that start, and it finishes the job — it creates the row and submits it for
 * publication in one action, then reports which of the two commands succeeded.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- one form, one validation table and one outcome report belong in a single auditable boundary
export function MarketplaceListingCreate({
  accessActionLabel,
  accessHint,
  catalog,
  kind,
  locale,
  navigate,
  onAccessAction,
  onSubmit,
  onUploadPhoto,
  photoCapability,
  t,
  unavailableReason = 'role',
}: Readonly<MarketplaceListingCreateProps>) {
  const fieldId = useId();
  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<MarketplaceListingOutcome | undefined>(undefined);

  const listings = catalog.data;
  const regions = useMemo(
    () =>
      suggestionsFrom(
        listings.map((listing) => listing.region),
        locale,
      ),
    [listings, locale],
  );
  const crops = useMemo(
    () =>
      suggestionsFrom(
        listings.map((listing) => listing.crop),
        locale,
      ),
    [listings, locale],
  );
  const units = useMemo(
    () =>
      suggestionsFrom(
        listings.map((listing) => listing.unit),
        locale,
      ),
    [listings, locale],
  );

  if (!kind) {
    return <ListingCreateUnavailable navigate={navigate} reason={unavailableReason} t={t} />;
  }

  const isProduct = kind === 'product';
  const id = (field: string) => `${fieldId}-${field}`;
  const describedBy = (field: DraftField) => (errors[field] ? `${id(field)}${errorSuffix}` : undefined);
  /** A control that carries a hint references the hint and, when present, the message. */
  const describedByWithHint = (field: DraftField) => {
    const hint = `${id(field)}-hint`;
    const error = describedBy(field);
    return error ? `${hint} ${error}` : hint;
  };
  /** Only the English name explains the four-name rule; the rest need no hint. */
  const titleHints: Partial<Record<DraftField, string>> = { titleEn: t(`${keyPrefix}hint.titles`) };
  const invalid = (field: DraftField) => (errors[field] ? 'true' : undefined);

  const update = <TField extends DraftField>(field: TField, value: ListingDraft[TField]) => {
    setDraft((current) => {
      const next: ListingDraft = { ...current };
      next[field] = value;
      return next;
    });
    setErrors((current) => {
      if (current[field] === undefined) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const section = marketplaceListingSectionFor(kind, draft.category);
  const priceValue = wholeNumber(draft.price);
  const blocked = Boolean(accessHint);
  const errorCount = Object.values(errors).filter((message) => Boolean(message)).length;

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || blocked) {
      return;
    }
    const found = validateDraft(kind, draft, t);
    setOutcome(undefined);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    setBusy(true);
    try {
      const result = await onSubmit(submissionFor(kind, draft));
      setOutcome(result);
      if (result.status === 'refused') {
        const field = result.field === undefined ? undefined : draftFieldByApiMember[result.field];
        setErrors(field ? { [field]: result.message } : {});
        return;
      }
      setDraft(emptyDraft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dh-page-stack">
      <div className="dh-page-heading">
        <div>
          <p className="dh-eyebrow">{t(`${keyPrefix}kind.${kind}`)}</p>
          <h1>{t(`${keyPrefix}title`)}</h1>
          <p>{t(`${keyPrefix}description`)}</p>
        </div>
      </div>

      <p className="dh-state-inline" data-listing-kind={kind}>
        {t(`${keyPrefix}kindFixed`)}
      </p>

      {blocked ? (
        <div className="dh-state-inline dh-state-inline--error" data-listing-access="blocked">
          <span>{accessHint}</span>
          {accessActionLabel && onAccessAction ? (
            <button className="dh-text-button" onClick={onAccessAction} type="button">
              {accessActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <ListingOutcomeReport outcome={outcome} t={t} />

      <form
        className="dh-panel dh-form dh-listing-form"
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {errorCount > 0 ? (
          <p className="dh-state-inline dh-state-inline--error" data-listing-errors="summary" role="alert">
            {t(`${keyPrefix}errors.summary`, { count: errorCount })}
          </p>
        ) : null}

        <fieldset className="dh-listing-group">
          <legend>{t(`${keyPrefix}group.identity`)}</legend>
          {isProduct ? (
            <>
              {(['titleEn', 'titleRu', 'titleUz', 'titleUzCyrl'] as const).map((field) => (
                <Field
                  error={errors[field]}
                  hint={titleHints[field]}
                  id={id(field)}
                  key={field}
                  label={t(fieldLabelKeys[field])}
                >
                  <input
                    aria-describedby={titleHints[field] ? describedByWithHint(field) : describedBy(field)}
                    aria-invalid={invalid(field)}
                    id={id(field)}
                    maxLength={maximumTitleLength}
                    onChange={(event) => {
                      update(field, event.target.value);
                    }}
                    value={draft[field]}
                  />
                </Field>
              ))}
              <Field error={errors.description} id={id('description')} label={t(fieldLabelKeys.description)} wide>
                <textarea
                  aria-describedby={describedBy('description')}
                  aria-invalid={invalid('description')}
                  id={id('description')}
                  onChange={(event) => {
                    update('description', event.target.value);
                  }}
                  rows={4}
                  value={draft.description}
                />
              </Field>
            </>
          ) : (
            <Field
              error={errors.crop}
              hint={t(`${keyPrefix}hint.produceTitle`)}
              id={id('crop')}
              label={t(fieldLabelKeys.crop)}
              wide
            >
              <input
                aria-describedby={describedByWithHint('crop')}
                aria-invalid={invalid('crop')}
                id={id('crop')}
                list={`${id('crop')}-options`}
                onChange={(event) => {
                  update('crop', event.target.value);
                }}
                value={draft.crop}
              />
              <datalist id={`${id('crop')}-options`}>
                {crops.map((crop) => (
                  <option key={crop} value={crop} />
                ))}
              </datalist>
            </Field>
          )}
        </fieldset>

        <fieldset className="dh-listing-group">
          <legend>{t(`${keyPrefix}group.classification`)}</legend>
          {isProduct ? (
            <Field id={id('category')} label={t(fieldLabelKeys.category)}>
              <select
                id={id('category')}
                onChange={(event) => {
                  update('category', event.target.value as MarketplaceListingCategory);
                }}
                value={draft.category}
              >
                {marketplaceListingCategories.map((category) => (
                  <option key={category} value={category}>
                    {t(`agritech.marketplace.category.${category}`)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field id={id('grade')} label={t(fieldLabelKeys.grade)}>
              <select
                id={id('grade')}
                onChange={(event) => {
                  update('grade', event.target.value as ProduceGrade);
                }}
                value={draft.grade}
              >
                {produceGrades.map((grade) => (
                  <option key={grade} value={grade}>
                    {t('agritech.marketplace.filter.gradeValue', { grade })}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            error={errors.region}
            hint={t(`${keyPrefix}hint.region`)}
            id={id('region')}
            label={t(fieldLabelKeys.region)}
          >
            <input
              aria-describedby={describedByWithHint('region')}
              aria-invalid={invalid('region')}
              id={id('region')}
              list={`${id('region')}-options`}
              onChange={(event) => {
                update('region', event.target.value);
              }}
              value={draft.region}
            />
            <datalist id={`${id('region')}-options`}>
              {regions.map((region) => (
                <option key={region} value={region} />
              ))}
            </datalist>
          </Field>
        </fieldset>

        <fieldset className="dh-listing-group">
          <legend>{t(`${keyPrefix}group.pricing`)}</legend>
          <Field error={errors.price} id={id('price')} label={t(isProduct ? fieldLabelKeys.price : pricePerKgKey)}>
            <input
              aria-describedby={describedBy('price')}
              aria-invalid={invalid('price')}
              id={id('price')}
              inputMode="numeric"
              onChange={(event) => {
                update('price', event.target.value);
              }}
              value={draft.price}
            />
          </Field>
          {isProduct ? (
            <Field error={errors.unit} id={id('unit')} label={t(fieldLabelKeys.unit)}>
              <input
                aria-describedby={describedBy('unit')}
                aria-invalid={invalid('unit')}
                id={id('unit')}
                list={`${id('unit')}-options`}
                onChange={(event) => {
                  update('unit', event.target.value);
                }}
                value={draft.unit}
              />
              <datalist id={`${id('unit')}-options`}>
                {units.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </Field>
          ) : null}
          <Field
            error={errors.quantity}
            id={id('quantity')}
            label={t(isProduct ? 'agritech.marketplace.product.stock' : fieldLabelKeys.quantity)}
          >
            <input
              aria-describedby={describedBy('quantity')}
              aria-invalid={invalid('quantity')}
              id={id('quantity')}
              inputMode="numeric"
              onChange={(event) => {
                update('quantity', event.target.value);
              }}
              value={draft.quantity}
            />
          </Field>
          <div className="dh-listing-field dh-listing-field--check">
            <label htmlFor={id('sample')}>
              <input
                checked={draft.sampleAvailable}
                id={id('sample')}
                onChange={(event) => {
                  update('sampleAvailable', event.target.checked);
                }}
                type="checkbox"
              />
              {t(fieldLabelKeys.sampleAvailable)}
            </label>
          </div>
        </fieldset>

        {isProduct ? null : (
          <fieldset className="dh-listing-group">
            <legend>{t(`${keyPrefix}group.availability`)}</legend>
            {/* The catalog withholds a harvest outside its window, so the window
                is a publication condition rather than a decorative date pair. */}
            <p className="dh-listing-field--wide dh-listing-field__hint">{t(`${keyPrefix}hint.availability`)}</p>
            {(['availableFrom', 'availableUntil'] as const).map((field) => (
              <Field error={errors[field]} id={id(field)} key={field} label={t(fieldLabelKeys[field])}>
                <input
                  aria-describedby={describedBy(field)}
                  aria-invalid={invalid(field)}
                  id={id(field)}
                  onChange={(event) => {
                    update(field, event.target.value);
                  }}
                  type="date"
                  value={draft[field]}
                />
              </Field>
            ))}
          </fieldset>
        )}

        <fieldset className="dh-listing-group dh-listing-group--photos">
          <legend>{t(`${keyPrefix}group.photos`)}</legend>
          <p className="dh-muted">{t(`${keyPrefix}photos.hint`, { limit: marketplaceListingImageLimit })}</p>
          {errors.images ? (
            <strong className="dh-listing-field__error" role="alert">
              {errors.images}
            </strong>
          ) : null}
          {onUploadPhoto ? (
            <MarketplacePhotoUpload
              capability={photoCapability}
              idPrefix="listing"
              limit={marketplaceListingImageLimit}
              onChange={(next) => {
                update('images', next);
              }}
              onUpload={onUploadPhoto}
              selected={draft.images}
              t={t}
            />
          ) : null}
        </fieldset>

        <section className="dh-listing-summary">
          <h2>{t(`${keyPrefix}summary.title`)}</h2>
          <dl>
            <div>
              <dt>{t(`${keyPrefix}summary.section`)}</dt>
              <dd>{t(`agritech.marketplace.section.${section}`)}</dd>
            </div>
            <div>
              <dt>{t(isProduct ? fieldLabelKeys.titleEn : fieldLabelKeys.crop)}</dt>
              <dd>{(isProduct ? draft.titleEn.trim() : draft.crop.trim()) || '—'}</dd>
            </div>
            <div>
              <dt>{t(isProduct ? fieldLabelKeys.price : pricePerKgKey)}</dt>
              <dd>{priceValue === undefined ? '—' : formatMoney(priceValue, locale)}</dd>
            </div>
            <div>
              <dt>{t(fieldLabelKeys.region)}</dt>
              <dd>{draft.region.trim() || '—'}</dd>
            </div>
            <div>
              <dt>{t(fieldLabelKeys.images)}</dt>
              <dd>{draft.images.length > 0 ? String(draft.images.length) : t(`${keyPrefix}photos.none`)}</dd>
            </div>
          </dl>
          <p className="dh-muted">{t(`${keyPrefix}summary.moderation`)}</p>
        </section>

        <div className="dh-form__actions">
          <button
            className="dh-button dh-button--secondary"
            onClick={() => {
              navigate('/account/publications');
            }}
            type="button"
          >
            {t(`${keyPrefix}openCabinet`)}
          </button>
          <MarketplaceBusyButton
            busy={busy}
            busyLabel={t(`${keyPrefix}submitBusy`)}
            className="dh-button dh-button--primary"
            disabled={blocked}
            icon="plus"
            type="submit"
          >
            {t(`${keyPrefix}submit`)}
          </MarketplaceBusyButton>
        </div>
      </form>
    </div>
  );
}
