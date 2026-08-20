import { createHash, randomBytes } from 'node:crypto';
import type { AgriTechOwner, OperationResult } from './agritech.types';

export const MarketplaceMediaRepositoryInjectToken = Symbol('MarketplaceMediaRepositoryInjectToken');
export const MarketplaceMediaObjectStorageInjectToken = Symbol('MarketplaceMediaObjectStorageInjectToken');

/**
 * The photograph formats a listing or a review may carry.
 *
 * Every deployment renders these through an `<img>` element, so the list is
 * exactly the raster formats a browser decodes without a plugin and which this
 * module can parse well enough to strip camera metadata from. `image/gif` and
 * `image/svg+xml` are deliberately absent: a GIF may animate a listing card
 * against its own design, and an SVG is a script-capable document rather than a
 * photograph.
 */
export const marketplaceMediaTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MarketplaceMediaType = (typeof marketplaceMediaTypes)[number];

/**
 * What a photograph may weigh. A phone camera writes three to eight megabytes,
 * so five mebibytes accepts an ordinary picture while keeping one request, one
 * buffered object and one stored blob bounded.
 */
export const maximumMarketplaceMediaBytes = 5 * 1024 * 1024;

/**
 * Below this nothing can be a photograph: the smallest structurally complete
 * file any of the three formats can produce is larger. It exists so an empty or
 * truncated part is refused by size before its container is parsed.
 */
export const minimumMarketplaceMediaBytes = 32;

/** How many photographs one product or produce listing may carry. */
export const maximumMarketplaceListingImages = 5;

/** How many photographs one public review may carry. */
export const maximumMarketplaceReviewAssets = 3;

/**
 * The public name of one stored photograph: 128 random bits in base64url.
 *
 * It is the whole of what any public response says about a stored object. The
 * bucket, the tenant, the uploading user and the storage key stay server-side,
 * so the identifier cannot be walked back to an account or enumerated — a
 * guess has one chance in 2^128 — and it satisfies the review contract's
 * existing `[A-Za-z0-9_-]{8,100}` handle alphabet without widening it.
 */
export const marketplaceMediaPublicIdLength = 22;
export const marketplaceMediaPublicIdPattern = /^[A-Za-z0-9_-]{22}$/u;

/**
 * Where a stored photograph is read from.
 *
 * `/marketplace/*` is the DehqonHub API namespace every deployment's reverse
 * proxy already routes to the user API (REQ-AGRITECH-ROUTING-015), so this path
 * is same-origin wherever the SPA and the API share an origin, and the bytes
 * never travel as a bucket URL an `img-src` policy would refuse.
 */
export const marketplaceMediaPathPrefix = '/marketplace/media/';
export const marketplaceMediaPathPattern = /^\/marketplace\/media\/[A-Za-z0-9_-]{22}$/u;

/**
 * The one reference shape the checked-in photograph library uses.
 *
 * The create form no longer offers that library — a seller uploads their own
 * photographs — but every seeded demo listing points at it, so the API keeps
 * accepting the shape. Dropping it would invalidate the whole demo catalogue.
 */
export const marketplaceLibraryImagePattern = /^\/media\/marketplace\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/u;

/** The review contract's existing opaque asset handle. */
export const marketplaceMediaReferencePrefix = 'public-asset:';

export const marketplaceMediaPathFor = (publicId: string): string => `${marketplaceMediaPathPrefix}${publicId}`;

export const marketplaceMediaReferenceFor = (publicId: string): string =>
  `${marketplaceMediaReferencePrefix}${publicId}`;

export const isMarketplaceMediaPath = (value: unknown): value is string =>
  typeof value === 'string' && marketplaceMediaPathPattern.test(value);

export const isMarketplaceLibraryImage = (value: unknown): value is string =>
  typeof value === 'string' && marketplaceLibraryImagePattern.test(value);

/**
 * Every reference a listing image column accepts: a checked-in library
 * photograph or one uploaded object served by this API. Nothing else — not an
 * absolute URL, not a host, not a path with a traversal segment — can match
 * either pattern, both of which are anchored at both ends.
 */
export const isMarketplaceListingImageReference = (value: unknown): value is string =>
  isMarketplaceLibraryImage(value) || isMarketplaceMediaPath(value);

/**
 * The same rule as one anchored alternation, for the request DTOs.
 *
 * `class-validator`'s `@Matches` takes a single expression, and a listing may
 * mix a library photograph with an uploaded one, so the two shapes are spelled
 * once here rather than as two decorators that could drift apart. Both
 * alternatives are fully anchored, so no absolute URL, no host and no `..`
 * segment can satisfy either.
 */
export const marketplaceListingImagePattern =
  /^(?:\/media\/marketplace\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp|\/marketplace\/media\/[A-Za-z0-9_-]{22})$/u;

/**
 * The public id inside a stored-photograph reference, in either of the two
 * shapes that carry one, or `undefined` for a library path that carries none.
 */
export const marketplaceMediaPublicIdFrom = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (marketplaceMediaPathPattern.test(value)) {
    return value.slice(marketplaceMediaPathPrefix.length);
  }
  if (!value.startsWith(marketplaceMediaReferencePrefix)) {
    return undefined;
  }
  const candidate = value.slice(marketplaceMediaReferencePrefix.length);

  return marketplaceMediaPublicIdPattern.test(candidate) ? candidate : undefined;
};

export const createMarketplaceMediaPublicId = (): string => randomBytes(16).toString('base64url');

/**
 * What one uploaded photograph is, once its bytes are accepted.
 *
 * `publicId` is the only member a public response may carry; `storageKey` is
 * the object-storage location and never leaves the server.
 */
export interface MarketplaceMediaAsset {
  publicId: string;
  mediaType: MarketplaceMediaType;
  byteSize: number;
  checksumSha256: string;
  createdAt: Date;
}

export interface MarketplaceMediaAssetRecord extends MarketplaceMediaAsset {
  storageKey: string;
}

export interface StoreMarketplaceMediaInput {
  publicId: string;
  storageKey: string;
  mediaType: MarketplaceMediaType;
  byteSize: number;
  checksumSha256: string;
}

/**
 * The persisted index from an opaque public id to a stored object.
 *
 * It exists so a public read can resolve a photograph without the caller ever
 * naming a bucket or a key, and so an attachment command can prove the actor
 * uploaded what they are attaching.
 */
export interface MarketplaceMediaRepository {
  recordAsset(owner: AgriTechOwner, input: StoreMarketplaceMediaInput): Promise<OperationResult<MarketplaceMediaAsset>>;
  /** The stored object behind a public id, for the public read path. */
  findAsset(publicId: string): Promise<MarketplaceMediaAssetRecord | undefined>;
  /** Which of these public ids this exact owner uploaded. Order is not significant. */
  findOwnedPublicIds(owner: AgriTechOwner, publicIds: readonly string[]): Promise<string[]>;
}

/**
 * The object-storage capability behind uploads, in the same explicit
 * mode/readiness shape every other marketplace connector uses.
 *
 * `configured: false` is the whole of what an unconfigured deployment can do:
 * the upload command refuses with a typed problem instead of accepting bytes it
 * would drop, and the client never offers an action it cannot complete.
 */
export interface MarketplaceMediaObjectStorage {
  readonly configured: boolean;
  put(key: string, body: Uint8Array, contentType: MarketplaceMediaType): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
}

/**
 * Where one object lives inside the bucket.
 *
 * The tenant and the uploading account are path segments so an operator reading
 * the bucket can attribute and delete an object, while the browser only ever
 * sees the trailing opaque id through a different, server-resolved path.
 */
export const marketplaceMediaStorageKey = (owner: AgriTechOwner, publicId: string): string =>
  `marketplace/media/${owner.tenantId}/${owner.userId}/${publicId}`;

export const marketplaceMediaChecksum = (content: Uint8Array): string =>
  createHash('sha256').update(content).digest('hex');

export type MarketplaceMediaRejection = 'too_small' | 'too_large' | 'unsupported_media_type' | 'malformed_media';

export interface MarketplaceMediaContent {
  mediaType: MarketplaceMediaType;
  /** The stored bytes: the upload with camera and comment metadata removed. */
  content: Uint8Array;
}

export type MarketplaceMediaInspection =
  { status: 'ok'; value: MarketplaceMediaContent } | { status: 'rejected'; reason: MarketplaceMediaRejection };

const jpegSignature = [0xff, 0xd8, 0xff];
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (content: Uint8Array, signature: readonly number[]): boolean =>
  content.length >= signature.length && signature.every((byte, index) => content[index] === byte);

const asciiAt = (content: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...content.subarray(offset, offset + length));

/**
 * The declared media type of these bytes, read from the container itself.
 *
 * A file name and a browser-supplied `Content-Type` are both caller-authored,
 * so neither is consulted: `photo.webp` holding a PDF and `image/webp` on a
 * ZIP both fail here.
 */
export const detectMarketplaceMediaType = (content: Uint8Array): MarketplaceMediaType | undefined => {
  if (startsWith(content, jpegSignature)) {
    return 'image/jpeg';
  }
  if (startsWith(content, pngSignature)) {
    return 'image/png';
  }
  if (content.length >= 12 && asciiAt(content, 0, 4) === 'RIFF' && asciiAt(content, 8, 4) === 'WEBP') {
    return 'image/webp';
  }

  return undefined;
};

/**
 * JPEG APPn and comment segments carry Exif — including the GPS position a
 * phone writes by default — plus XMP and maker notes. Dropping every APPn
 * except APP0/JFIF and every COM leaves the frame and its entropy-coded scan
 * untouched, so the picture is unchanged and its provenance is gone.
 */
const isDroppedJpegMarker = (marker: number): boolean => (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;

const isStandaloneJpegMarker = (marker: number): boolean => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);

// eslint-disable-next-line sonarjs/cognitive-complexity -- one bounded marker walk; splitting it would hide the single position cursor every branch advances
const sanitizeJpeg = (content: Uint8Array): Uint8Array | undefined => {
  const kept: Uint8Array[] = [content.subarray(0, 2)];
  let position = 2;
  while (position < content.length) {
    if (content[position] !== 0xff) {
      return undefined;
    }
    let markerPosition = position;
    while (markerPosition < content.length && content[markerPosition] === 0xff) {
      markerPosition += 1;
    }
    const marker = content[markerPosition];
    if (marker === undefined) {
      return undefined;
    }
    if (marker === 0xda) {
      // The scan header is followed by entropy-coded data no segment walk can
      // step over, and no metadata can hide inside it. Copy the remainder.
      kept.push(content.subarray(markerPosition - 1));
      return concat(kept);
    }
    if (isStandaloneJpegMarker(marker)) {
      kept.push(content.subarray(markerPosition - 1, markerPosition + 1));
      position = markerPosition + 1;
      continue;
    }
    const lengthPosition = markerPosition + 1;
    if (lengthPosition + 1 >= content.length) {
      return undefined;
    }
    const length = view(content).getUint16(lengthPosition);
    if (length < 2 || lengthPosition + length > content.length) {
      return undefined;
    }
    if (!isDroppedJpegMarker(marker)) {
      kept.push(content.subarray(markerPosition - 1, lengthPosition + length));
    }
    position = lengthPosition + length;
  }

  return undefined;
};

/**
 * PNG stores Exif in `eXIf` and free text in `tEXt`/`zTXt`/`iTXt`; `tIME`
 * carries a capture timestamp. Every other chunk is either required to decode
 * the image or a colour/rendering hint, so the deny list is exact and a chunk
 * this build has never heard of is kept rather than silently discarded.
 */
const droppedPngChunks = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

const sanitizePng = (content: Uint8Array): Uint8Array | undefined => {
  const kept: Uint8Array[] = [content.subarray(0, 8)];
  let position = 8;
  let sawEnd = false;
  while (position + 8 <= content.length && !sawEnd) {
    const length = readUint32BigEndian(content, position);
    const type = asciiAt(content, position + 4, 4);
    const end = position + 12 + length;
    if (length > content.length || end > content.length) {
      return undefined;
    }
    if (!droppedPngChunks.has(type)) {
      kept.push(content.subarray(position, end));
    }
    sawEnd = type === 'IEND';
    position = end;
  }

  return sawEnd && position === content.length ? concat(kept) : undefined;
};

/**
 * WebP keeps Exif and XMP in their own RIFF chunks, and the extended-format
 * `VP8X` header advertises them in two flag bits. Both chunks are dropped, both
 * flags are cleared, and the RIFF length is rewritten, so the result is a file
 * whose header agrees with its contents rather than one that claims metadata it
 * no longer has.
 */
const droppedWebpChunks = new Set(['EXIF', 'XMP ']);
const webpExifFlag = 0x08;
const webpXmpFlag = 0x04;

const sanitizeWebp = (content: Uint8Array): Uint8Array | undefined => {
  const declared = readUint32LittleEndian(content, 4);
  if (declared + 8 !== content.length) {
    return undefined;
  }
  const kept: Uint8Array[] = [];
  let position = 12;
  while (position + 8 <= content.length) {
    const type = asciiAt(content, position, 4);
    const size = readUint32LittleEndian(content, position + 4);
    const padded = size + (size % 2);
    const end = position + 8 + padded;
    if (end > content.length) {
      return undefined;
    }
    if (!droppedWebpChunks.has(type)) {
      const chunk = Uint8Array.from(content.subarray(position, end));
      if (type === 'VP8X' && size >= 1) {
        const flags = view(chunk);
        flags.setUint8(8, flags.getUint8(8) & ~(webpExifFlag | webpXmpFlag));
      }
      kept.push(chunk);
    }
    position = end;
  }
  if (position !== content.length || kept.length === 0) {
    return undefined;
  }
  const body = concat(kept);
  const header = Uint8Array.from(content.subarray(0, 12));
  writeUint32LittleEndian(header, 4, body.length + 4);

  return concat([header, body]);
};

const sanitizers: Readonly<Record<MarketplaceMediaType, (content: Uint8Array) => Uint8Array | undefined>> = {
  'image/jpeg': sanitizeJpeg,
  'image/png': sanitizePng,
  'image/webp': sanitizeWebp,
};

/**
 * Decide what an uploaded part actually is, and reduce it to the bytes worth
 * storing.
 *
 * The container is parsed rather than sniffed at the first three bytes alone: a
 * file whose structure this build cannot walk to its end is refused as
 * malformed instead of being stored and served as an image later. That is the
 * same fail-closed posture the rest of the marketplace uses, and it is what
 * makes stripping metadata safe — nothing is guessed about a layout that did
 * not parse.
 */
export const inspectMarketplaceMedia = (content: Uint8Array): MarketplaceMediaInspection => {
  if (content.length > maximumMarketplaceMediaBytes) {
    return { reason: 'too_large', status: 'rejected' };
  }
  if (content.length < minimumMarketplaceMediaBytes) {
    return { reason: 'too_small', status: 'rejected' };
  }
  const mediaType = detectMarketplaceMediaType(content);
  if (!mediaType) {
    return { reason: 'unsupported_media_type', status: 'rejected' };
  }
  // Each sanitizer preserves its container's leading signature bytes verbatim,
  // so the accepted type never changes underneath the caller. What can change is
  // the size: a file that was almost entirely metadata is refused on the way out
  // for the same reason an empty part is refused on the way in.
  const sanitized = sanitizers[mediaType](content);
  if (!sanitized || sanitized.length < minimumMarketplaceMediaBytes) {
    return { reason: 'malformed_media', status: 'rejected' };
  }

  return { status: 'ok', value: { content: sanitized, mediaType } };
};

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((size, part) => size + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return result;
}

/**
 * A view over exactly these bytes.
 *
 * Every caller has already proved the offset it is about to read is inside the
 * file, so a `DataView` states the width and the byte order once instead of
 * each site shifting indexed reads the compiler has to be told cannot be
 * `undefined`.
 */
function view(content: Uint8Array): DataView {
  return new DataView(content.buffer, content.byteOffset, content.byteLength);
}

function readUint32BigEndian(content: Uint8Array, offset: number): number {
  return view(content).getUint32(offset);
}

function readUint32LittleEndian(content: Uint8Array, offset: number): number {
  return view(content).getUint32(offset, true);
}

function writeUint32LittleEndian(content: Uint8Array, offset: number, value: number): void {
  view(content).setUint32(offset, value, true);
}
