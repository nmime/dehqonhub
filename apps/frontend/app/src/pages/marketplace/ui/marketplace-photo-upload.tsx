// @requirements REQ-AGRITECH-EXPERIENCE-026 REQ-AGRITECH-WEB-006
import { useId, useState } from 'react';
import type { MarketplaceTranslate } from './marketplace-ui';

/**
 * What the deployment says it can do with an uploaded photograph.
 *
 * `undefined` means the answer has not arrived yet, which is a third state the
 * screen has to render: offering the control before the answer is offering an
 * action that may be impossible, and hiding it forever is worse.
 */
export interface MarketplacePhotoCapability {
  readonly configured: boolean;
  readonly maximumByteSize: number;
  readonly mediaTypes: readonly string[];
}

/**
 * Why one file was not stored, in terms the screen can name.
 *
 * Every value means the same thing about the outcome — nothing was stored — so
 * no message can imply a photograph is on its way.
 */
export type MarketplacePhotoRefusal = 'limit' | 'rejected' | 'storage' | 'tooLarge' | 'type' | 'unauthorized';

export type MarketplacePhotoUploadOutcome =
  | { readonly status: 'stored'; readonly path: string; readonly reference: string }
  | { readonly status: 'refused'; readonly reason: MarketplacePhotoRefusal };

export interface MarketplacePhotoUploadProps {
  readonly capability: MarketplacePhotoCapability | undefined;
  /** True while another part of the form owns the actor's attention. */
  readonly disabled?: boolean;
  /** Distinct per form, so two upload fields on one page keep separate labels. */
  readonly idPrefix: string;
  /** How many photographs this field may hold in total. */
  readonly limit: number;
  readonly onChange: (next: readonly string[]) => void;
  readonly onUpload: (file: File) => Promise<MarketplacePhotoUploadOutcome>;
  /** The references currently attached, in publication order. */
  readonly selected: readonly string[];
  readonly t: MarketplaceTranslate;
}

const keyPrefix = 'agritech.marketplace.photos.';

/** One decimal place, because "5.2 MB" is a limit and "5242880" is a number. */
export const formatByteLimit = (bytes: number): string => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

const uploadedPathPrefix = '/marketplace/media/';
const assetReferencePrefix = 'public-asset:';
const publicIdPattern = /^[A-Za-z0-9_-]{22}$/u;

/**
 * The same stored photograph has two names, and each side of the API uses one.
 *
 * A listing image column holds the root-relative path, because that is what an
 * `<img src>` needs. A review's `assetReferences` holds the `public-asset:`
 * handle, because that contract predates uploading and its column already
 * refuses anything else. Both carry the same opaque identifier, so these two
 * functions are the whole of the translation between them — no other module
 * builds either string by hand.
 */
export const marketplacePhotoReferenceFor = (path: string): string | undefined => {
  if (!path.startsWith(uploadedPathPrefix)) {
    return undefined;
  }
  const publicId = path.slice(uploadedPathPrefix.length);

  return publicIdPattern.test(publicId) ? `${assetReferencePrefix}${publicId}` : undefined;
};

export const marketplacePhotoSourceFor = (reference: string): string | undefined => {
  if (!reference.startsWith(assetReferencePrefix)) {
    return undefined;
  }
  const publicId = reference.slice(assetReferencePrefix.length);

  return publicIdPattern.test(publicId) ? `${uploadedPathPrefix}${publicId}` : undefined;
};

/**
 * The photographs a published review carries.
 *
 * A stored photograph nobody displays is not delivered, so every reference the
 * API returns is rendered here — and a reference that cannot be resolved to a
 * source, or whose bytes are gone, renders nothing rather than a broken frame.
 * The strip is a list because a review may carry up to three, and each image
 * carries its position so the alternative text is never just "photograph".
 */
export function MarketplaceReviewPhotos({
  references,
  t,
}: Readonly<{ references: readonly string[]; t: MarketplaceTranslate }>) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const sources = references
    .map((reference) => ({ reference, source: marketplacePhotoSourceFor(reference) }))
    .filter((entry): entry is { reference: string; source: string } => entry.source !== undefined)
    .filter((entry) => !failed.includes(entry.reference));
  if (sources.length === 0) {
    return null;
  }
  return (
    <ul aria-label={t(`${keyPrefix}reviewPhotos`)} className="dh-review-photos">
      {sources.map((entry, position) => (
        <li key={entry.reference}>
          <img
            alt={t(`${keyPrefix}reviewAlt`, { position: position + 1, total: sources.length })}
            loading="lazy"
            onError={() => {
              setFailed((current) => [...current, entry.reference]);
            }}
            src={entry.source}
          />
        </li>
      ))}
    </ul>
  );
}

interface UploadFailure {
  readonly name: string;
  readonly reason: MarketplacePhotoRefusal;
}

const refusalKey: Readonly<Record<MarketplacePhotoRefusal, string>> = {
  limit: `${keyPrefix}error.limit`,
  rejected: `${keyPrefix}error.rejected`,
  storage: `${keyPrefix}error.storage`,
  tooLarge: `${keyPrefix}error.tooLarge`,
  type: `${keyPrefix}error.type`,
  unauthorized: `${keyPrefix}error.unauthorized`,
};

/**
 * An ordinary file field for photographs, with the limits stated and every
 * refusal named against the file that caused it.
 *
 * It is deliberately a plain `<input type="file" multiple>` with no `capture`
 * attribute. A phone offers its camera and its gallery from exactly this
 * control; a desktop offers the file picker. Adding `capture` would have made
 * the camera the only source, which is the mistake this screen used to make in
 * words.
 *
 * Files are sent one at a time and appended as each one is stored, so a batch
 * that fails halfway leaves the photographs that did succeed attached rather
 * than discarding them, and the actor is told exactly which files did not make
 * it. Nothing is ever attached that the server did not confirm.
 */
export function MarketplacePhotoUpload({
  capability,
  disabled = false,
  idPrefix,
  limit,
  onChange,
  onUpload,
  selected,
  t,
}: Readonly<MarketplacePhotoUploadProps>) {
  const generatedId = useId();
  const inputId = `${idPrefix}-${generatedId}-photo-upload`;
  const hintId = `${inputId}-hint`;
  const [busyName, setBusyName] = useState<string | undefined>(undefined);
  const [failures, setFailures] = useState<readonly UploadFailure[]>([]);
  /** File names for the uploads made in this session, for the remove control. */
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});

  if (capability && !capability.configured) {
    return (
      <p className="dh-muted" data-photo-upload="unconfigured">
        {t(`${keyPrefix}unavailable`)}
      </p>
    );
  }

  const accept = capability?.mediaTypes.join(',') ?? 'image/jpeg,image/png,image/webp';
  const maximumByteSize = capability?.maximumByteSize ?? 0;
  const busy = busyName !== undefined;
  const blocked = disabled || busy || !capability || selected.length >= limit;

  const send = async (files: readonly File[]) => {
    const rejected: UploadFailure[] = [];
    let attached = [...selected];
    for (const file of files) {
      if (attached.length >= limit) {
        rejected.push({ name: file.name, reason: 'limit' });
        continue;
      }
      if (capability && !capability.mediaTypes.includes(file.type)) {
        rejected.push({ name: file.name, reason: 'type' });
        continue;
      }
      if (maximumByteSize > 0 && file.size > maximumByteSize) {
        rejected.push({ name: file.name, reason: 'tooLarge' });
        continue;
      }
      setBusyName(file.name);
      // One request at a time: the field states a total, and a parallel batch
      // could only discover it had exceeded that total after the fact.
      // eslint-disable-next-line no-await-in-loop -- sequential uploads keep the stated total enforceable
      const outcome = await onUpload(file);
      if (outcome.status === 'refused') {
        rejected.push({ name: file.name, reason: outcome.reason });
        continue;
      }
      attached = [...attached, outcome.path];
      setNames((current) => ({ ...current, [outcome.path]: file.name }));
      onChange(attached);
    }
    setBusyName(undefined);
    setFailures(rejected);
  };

  return (
    <div className="dh-photo-upload">
      <label className="dh-photo-upload__control" htmlFor={inputId}>
        <span>{t(`${keyPrefix}uploadLabel`)}</span>
        <input
          accept={accept}
          aria-describedby={hintId}
          disabled={blocked}
          id={inputId}
          multiple
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = '';
            if (files.length > 0) {
              void send(files);
            }
          }}
          type="file"
        />
      </label>
      <small className="dh-photo-upload__hint" id={hintId}>
        {t(`${keyPrefix}uploadHint`, { limit: formatByteLimit(maximumByteSize), max: limit })}
      </small>
      {/* The busy line names the file, because a batch reports one file at a
          time and "Uploading…" alone would not say which. */}
      <p aria-live="polite" className="dh-photo-upload__status" role="status">
        {busy
          ? t(`${keyPrefix}uploadingOne`, { name: busyName })
          : t(`${keyPrefix}selected`, { max: limit, used: selected.length })}
      </p>
      {failures.length > 0 ? (
        <ul className="dh-photo-upload__errors">
          {failures.map((failure) => (
            <li key={`${failure.name}:${failure.reason}`}>
              <strong className="dh-listing-field__error">
                {t(refusalKey[failure.reason], {
                  limit: formatByteLimit(maximumByteSize),
                  max: limit,
                  name: failure.name,
                })}
              </strong>
            </li>
          ))}
        </ul>
      ) : null}
      {selected.length > 0 ? (
        <ul className="dh-photo-upload__list">
          {selected.map((reference, position) => {
            const name = names[reference];
            return (
              <li key={reference}>
                <img
                  alt={t(`${keyPrefix}reviewAlt`, { position: position + 1, total: selected.length })}
                  height={72}
                  loading="lazy"
                  src={reference}
                  width={108}
                />
                <span>{name ?? t(`${keyPrefix}uploadedOne`)}</span>
                <button
                  className="dh-text-button"
                  disabled={disabled || busy}
                  onClick={() => {
                    setFailures([]);
                    onChange(selected.filter((current) => current !== reference));
                  }}
                  type="button"
                >
                  {t(`${keyPrefix}remove`, { name: name ?? t(`${keyPrefix}uploadedOne`) })}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
