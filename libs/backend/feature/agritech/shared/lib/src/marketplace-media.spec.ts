// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createMarketplaceMediaPublicId,
  detectMarketplaceMediaType,
  inspectMarketplaceMedia,
  isMarketplaceLibraryImage,
  isMarketplaceListingImageReference,
  isMarketplaceMediaPath,
  marketplaceLibraryImagePattern,
  marketplaceListingImagePattern,
  marketplaceMediaChecksum,
  marketplaceMediaPathFor,
  marketplaceMediaPublicIdFrom,
  marketplaceMediaPublicIdLength,
  marketplaceMediaPublicIdPattern,
  marketplaceMediaReferenceFor,
  marketplaceMediaStorageKey,
  maximumMarketplaceMediaBytes,
  minimumMarketplaceMediaBytes,
} from './marketplace-media';

const workspaceRoot = join(import.meta.dirname, '../../../../../../..');
/** A real photograph from the checked-in library: a lossy VP8 WebP with a VP8X header. */
const realWebp = new Uint8Array(
  readFileSync(join(workspaceRoot, 'apps/frontend/app/public/media/marketplace/wheat-grain.webp')),
);
/** A real PNG: the product emblem. */
const realPng = new Uint8Array(readFileSync(join(workspaceRoot, 'apps/frontend/app/public/dehqonhub-emblem-96.png')));

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((size, part) => size + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};
const ascii = (value: string): Uint8Array => Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
const uint32BigEndian = (value: number): Uint8Array =>
  bytes((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
const uint32LittleEndian = (value: number): Uint8Array =>
  bytes(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);

const jpegSegment = (marker: number, payload: Uint8Array): Uint8Array =>
  concat(bytes(0xff, marker), bytes(((payload.byteLength + 2) >> 8) & 0xff, (payload.byteLength + 2) & 0xff), payload);

/**
 * A JPEG whose structure is exactly what a phone writes: a JFIF header, an Exif
 * block carrying a GPS position, a comment, a frame header, and one scan.
 */
const jpegWithExif = (): Uint8Array =>
  concat(
    bytes(0xff, 0xd8),
    jpegSegment(0xe0, concat(ascii('JFIF\0'), bytes(1, 1, 0, 0, 1, 0, 1, 0, 0))),
    jpegSegment(0xe1, concat(ascii('Exif\0\0'), ascii('GPSLatitude 41.311081 GPSLongitude 69.240562'))),
    jpegSegment(0xfe, ascii('Shot on a phone in Samarkand')),
    jpegSegment(0xc0, bytes(8, 0, 16, 0, 16, 1, 1, 0x11, 0)),
    bytes(0xff, 0xd0),
    jpegSegment(0xda, bytes(1, 1, 0, 0, 63, 0)),
    ascii('entropy-coded-scan-data-that-is-not-a-segment'),
    bytes(0xff, 0xd9),
  );

const pngChunk = (type: string, payload: Uint8Array): Uint8Array =>
  concat(uint32BigEndian(payload.byteLength), ascii(type), payload, uint32BigEndian(0));

const pngWithMetadata = (): Uint8Array =>
  concat(
    bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    pngChunk('IHDR', concat(uint32BigEndian(1), uint32BigEndian(1), bytes(8, 6, 0, 0, 0))),
    pngChunk('eXIf', ascii('GPSLatitude 41.311081')),
    pngChunk('tEXt', ascii('Comment\0shot on a phone')),
    pngChunk('tIME', bytes(0x07, 0xea, 8, 20, 12, 0, 0)),
    pngChunk('IDAT', ascii('deflate-payload-bytes-here')),
    pngChunk('IEND', new Uint8Array()),
  );

const webpChunk = (type: string, payload: Uint8Array): Uint8Array =>
  concat(
    ascii(type),
    uint32LittleEndian(payload.byteLength),
    payload,
    payload.byteLength % 2 === 1 ? bytes(0) : new Uint8Array(),
  );

const webpFile = (...chunks: Uint8Array[]): Uint8Array => {
  const body = concat(...chunks);
  return concat(ascii('RIFF'), uint32LittleEndian(body.byteLength + 4), ascii('WEBP'), body);
};

/** `VP8X` with the Exif and XMP flags set, which is what an extended WebP writes. */
const vp8xWithMetadataFlags = bytes(0b0000_1100, 0, 0, 0, 15, 0, 0, 15, 0, 0);

const webpWithMetadata = (): Uint8Array =>
  webpFile(
    webpChunk('VP8X', vp8xWithMetadataFlags),
    webpChunk('VP8 ', ascii('vp8-lossy-bitstream-payload-bytes')),
    webpChunk('EXIF', ascii('GPSLatitude 41.311081 GPSLongitude 69.240562')),
    webpChunk('XMP ', ascii('<x:xmpmeta>Samarkand</x:xmpmeta>')),
  );

const accepted = (content: Uint8Array) => {
  const inspection = inspectMarketplaceMedia(content);
  if (inspection.status !== 'ok') {
    throw new Error(`expected acceptance, got ${inspection.reason}`);
  }
  return inspection.value;
};

const text = (content: Uint8Array): string => Buffer.from(content).toString('latin1');

describe('marketplace photograph reference shapes', () => {
  it('accepts exactly the library path and the uploaded path, and nothing that names a host', () => {
    const id = 'AbCdEf0123456789_-xyzQ';
    expect(id).toHaveLength(marketplaceMediaPublicIdLength);
    const uploaded = marketplaceMediaPathFor(id);
    expect(uploaded).toBe('/marketplace/media/AbCdEf0123456789_-xyzQ');
    expect(marketplaceMediaReferenceFor(id)).toBe('public-asset:AbCdEf0123456789_-xyzQ');

    for (const value of [uploaded, '/media/marketplace/wheat-grain.webp']) {
      expect(marketplaceListingImagePattern.test(value)).toBe(true);
      expect(isMarketplaceListingImageReference(value)).toBe(true);
    }

    // A remote host, a scheme-relative host, a traversal segment, a nested path,
    // a query string, the wrong extension, and an identifier of the wrong length
    // are each refused by both the predicate pair and the DTO alternation.
    for (const value of [
      'https://cdn.example.test/media/marketplace/wheat-grain.webp',
      '//cdn.example.test/media/marketplace/wheat-grain.webp',
      '/media/marketplace/../../etc/passwd',
      '/marketplace/media/AbCdEf0123456789_-xyzQ/../secret',
      '/marketplace/media/AbCdEf0123456789_-xyzQ?raw=1',
      '/media/marketplace/wheat-grain.svg',
      '/marketplace/media/tooshort',
      '/media/marketplace/Wheat-Grain.webp',
      'data:image/webp;base64,AAAA',
      42,
      undefined,
    ]) {
      expect(isMarketplaceListingImageReference(value)).toBe(false);
      if (typeof value === 'string') {
        expect(marketplaceListingImagePattern.test(value)).toBe(false);
      }
    }

    expect(isMarketplaceMediaPath(uploaded)).toBe(true);
    expect(isMarketplaceMediaPath(7)).toBe(false);
    expect(isMarketplaceLibraryImage('/media/marketplace/wheat-grain.webp')).toBe(true);
    expect(isMarketplaceLibraryImage(null)).toBe(false);
    expect(marketplaceLibraryImagePattern.test('/media/marketplace/cotton-bolls.webp')).toBe(true);
  });

  it('reads a public identifier out of either carrying shape and out of nothing else', () => {
    const id = 'AbCdEf0123456789_-xyzQ';
    expect(marketplaceMediaPublicIdFrom(marketplaceMediaPathFor(id))).toBe(id);
    expect(marketplaceMediaPublicIdFrom(marketplaceMediaReferenceFor(id))).toBe(id);
    expect(marketplaceMediaPublicIdFrom('/media/marketplace/wheat-grain.webp')).toBeUndefined();
    expect(marketplaceMediaPublicIdFrom('public-asset:short')).toBeUndefined();
    expect(marketplaceMediaPublicIdFrom(123)).toBeUndefined();
  });

  it('mints an unguessable identifier and a key that hides the account behind an opaque address', () => {
    const first = createMarketplaceMediaPublicId();
    const second = createMarketplaceMediaPublicId();
    expect(first).toMatch(marketplaceMediaPublicIdPattern);
    expect(first).toHaveLength(marketplaceMediaPublicIdLength);
    expect(first).not.toBe(second);

    // The bucket key names the tenant and the account so an operator can attribute
    // an object; the public path names neither.
    const key = marketplaceMediaStorageKey({ tenantId: 'tenant-1', userId: 'user-9' }, first);
    expect(key).toBe(`marketplace/media/tenant-1/user-9/${first}`);
    expect(marketplaceMediaPathFor(first)).not.toContain('tenant-1');
    expect(marketplaceMediaPathFor(first)).not.toContain('user-9');
  });

  it('digests the stored bytes so a row and its object cannot silently disagree', () => {
    expect(marketplaceMediaChecksum(ascii('ready'))).toMatch(/^[0-9a-f]{64}$/u);
    expect(marketplaceMediaChecksum(ascii('ready'))).toBe(marketplaceMediaChecksum(ascii('ready')));
    expect(marketplaceMediaChecksum(ascii('ready'))).not.toBe(marketplaceMediaChecksum(ascii('ready!')));
  });
});

describe('marketplace photograph media-type detection', () => {
  it('reads the container rather than believing a name or a declared type', () => {
    expect(detectMarketplaceMediaType(realWebp)).toBe('image/webp');
    expect(detectMarketplaceMediaType(realPng)).toBe('image/png');
    expect(detectMarketplaceMediaType(jpegWithExif())).toBe('image/jpeg');

    // A PDF, a ZIP, an SVG, a GIF, a RIFF container that is not WebP, and a
    // truncated RIFF header: an extension claiming otherwise changes nothing.
    for (const content of [
      ascii('%PDF-1.7\nnot an image at all, whatever the file is called'),
      concat(bytes(0x50, 0x4b, 0x03, 0x04), ascii('zip-central-directory-follows-here')),
      ascii('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
      concat(ascii('GIF89a'), ascii('animated-payload-bytes-that-are-long-enough')),
      concat(ascii('RIFF'), uint32LittleEndian(64), ascii('WAVE'), ascii('audio-payload-bytes-here')),
      ascii('RIFF12345678'),
    ]) {
      expect(detectMarketplaceMediaType(content)).toBeUndefined();
    }
  });
});

describe('marketplace photograph acceptance', () => {
  it('accepts a real WebP and a real PNG unchanged in type and still readable as themselves', () => {
    for (const [content, mediaType] of [
      [realWebp, 'image/webp'],
      [realPng, 'image/png'],
    ] as const) {
      const value = accepted(content);
      expect(value.mediaType).toBe(mediaType);
      expect(detectMarketplaceMediaType(value.content)).toBe(mediaType);
      expect(value.content.byteLength).toBeLessThanOrEqual(content.byteLength);
    }
  });

  it('refuses an empty, oversized, unknown, or structurally broken part by naming which', () => {
    expect(inspectMarketplaceMedia(new Uint8Array())).toEqual({ reason: 'too_small', status: 'rejected' });
    expect(inspectMarketplaceMedia(new Uint8Array(minimumMarketplaceMediaBytes - 1))).toEqual({
      reason: 'too_small',
      status: 'rejected',
    });
    expect(inspectMarketplaceMedia(new Uint8Array(maximumMarketplaceMediaBytes + 1))).toEqual({
      reason: 'too_large',
      status: 'rejected',
    });
    expect(inspectMarketplaceMedia(ascii('%PDF-1.7 a document dressed as a photograph'))).toEqual({
      reason: 'unsupported_media_type',
      status: 'rejected',
    });

    // Every one of these has a valid signature and an invalid body, which is
    // exactly the case a magic-byte check alone would wave through.
    for (const content of [
      // JPEG: a segment length shorter than its own header.
      concat(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01), new Uint8Array(40)),
      // JPEG: a segment that runs past the end of the file.
      concat(bytes(0xff, 0xd8, 0xff, 0xe0, 0x7f, 0xff), new Uint8Array(40)),
      // JPEG: no scan at all, so the walk reaches the end without a picture.
      concat(bytes(0xff, 0xd8), jpegSegment(0xc0, new Uint8Array(40))),
      // JPEG: a byte where a marker prefix must be.
      concat(bytes(0xff, 0xd8), jpegSegment(0xc0, new Uint8Array(40)), ascii('trailing bytes with no marker prefix')),
      // JPEG: a trailing fill byte with no marker after it.
      concat(bytes(0xff, 0xd8), jpegSegment(0xc0, new Uint8Array(40)), bytes(0xff)),
      // JPEG: a final marker whose two length bytes are past the end of the file.
      concat(bytes(0xff, 0xd8), jpegSegment(0xc0, new Uint8Array(24)), bytes(0xff, 0xc0)),
      // PNG: a chunk whose declared length exceeds the file.
      concat(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        uint32BigEndian(0x7fffffff),
        ascii('IDAT'),
        new Uint8Array(40),
      ),
      // PNG: a chunk that overruns the end by a few bytes.
      concat(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        uint32BigEndian(64),
        ascii('IDAT'),
        new Uint8Array(40),
      ),
      // PNG: truncated before IEND.
      concat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), pngChunk('IDAT', new Uint8Array(40))),
      // PNG: trailing bytes after IEND.
      concat(pngWithMetadata(), ascii('appended-payload')),
      // WebP: a RIFF length that disagrees with the file length.
      concat(ascii('RIFF'), uint32LittleEndian(9999), ascii('WEBP'), new Uint8Array(40)),
      // WebP: a RIFF length that agrees with the file, holding a chunk that does not.
      concat(
        ascii('RIFF'),
        uint32LittleEndian(48),
        ascii('WEBP'),
        ascii('VP8 '),
        uint32LittleEndian(9999),
        new Uint8Array(36),
      ),
      // WebP: header only, so nothing survives sanitizing.
      webpFile(webpChunk('EXIF', new Uint8Array(40))),
      // WebP: a trailing partial chunk header.
      concat(webpFile(webpChunk('VP8 ', new Uint8Array(40))), bytes(0, 0, 0)),
      // WebP: everything but metadata removed leaves a file too small to be one.
      webpFile(webpChunk('VP8 ', bytes(1, 2, 3, 4)), webpChunk('EXIF', new Uint8Array(8))),
    ]) {
      expect(inspectMarketplaceMedia(content)).toEqual({ reason: 'malformed_media', status: 'rejected' });
    }
  });
});

describe('marketplace photograph metadata stripping', () => {
  it('removes the GPS position and the comment a phone writes into a JPEG, and keeps the picture', () => {
    const original = jpegWithExif();
    expect(text(original)).toContain('GPSLatitude');
    expect(text(original)).toContain('Samarkand');

    const value = accepted(original);
    expect(value.mediaType).toBe('image/jpeg');
    expect(text(value.content)).not.toContain('GPSLatitude');
    expect(text(value.content)).not.toContain('GPSLongitude');
    expect(text(value.content)).not.toContain('Samarkand');
    // The JFIF header, the frame, the restart marker and the whole scan survive.
    expect(text(value.content)).toContain('JFIF');
    expect(text(value.content)).toContain('entropy-coded-scan-data-that-is-not-a-segment');
    expect([...value.content.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect([...value.content.subarray(-2)]).toEqual([0xff, 0xd9]);
  });

  it('removes the eXIf, tEXt and tIME chunks from a PNG and leaves the image data addressable', () => {
    const value = accepted(pngWithMetadata());
    expect(value.mediaType).toBe('image/png');
    expect(text(value.content)).not.toContain('eXIf');
    expect(text(value.content)).not.toContain('tEXt');
    expect(text(value.content)).not.toContain('tIME');
    expect(text(value.content)).not.toContain('GPSLatitude');
    expect(text(value.content)).toContain('IHDR');
    expect(text(value.content)).toContain('deflate-payload-bytes-here');
    expect(text(value.content)).toContain('IEND');
  });

  it('removes the EXIF and XMP chunks from a WebP, clears their VP8X flags, and rewrites the RIFF length', () => {
    const original = webpWithMetadata();
    expect(text(original)).toContain('GPSLatitude');

    const value = accepted(original);
    expect(value.mediaType).toBe('image/webp');
    expect(text(value.content)).not.toContain('EXIF');
    expect(text(value.content)).not.toContain('XMP ');
    expect(text(value.content)).not.toContain('GPSLatitude');
    expect(text(value.content)).toContain('vp8-lossy-bitstream-payload-bytes');

    // A header that still advertised metadata it no longer carries would be a
    // file that lies about itself, so the two flag bits are cleared.
    expect(value.content[20]! & 0b0000_1100).toBe(0);
    // The remaining flags are untouched, and the declared size matches the file.
    expect(value.content[20]! & 0b0011_0000).toBe(vp8xWithMetadataFlags[0]! & 0b0011_0000);
    const declared =
      value.content[4]! | (value.content[5]! << 8) | (value.content[6]! << 16) | (value.content[7]! << 24);
    expect(declared + 8).toBe(value.content.byteLength);
  });

  it('leaves a VP8X-less WebP and a zero-length chunk alone rather than guessing at them', () => {
    // A simple lossy WebP has no VP8X header at all, and an empty chunk is legal.
    const value = accepted(
      webpFile(webpChunk('ALPH', new Uint8Array()), webpChunk('VP8 ', ascii('vp8-lossy-bitstream-payload-bytes-here'))),
    );
    expect(value.mediaType).toBe('image/webp');
    expect(text(value.content)).toContain('ALPH');
    expect(text(value.content)).toContain('vp8-lossy-bitstream-payload-bytes-here');
  });

  it('keeps a truncated VP8X header verbatim instead of writing a flag byte that is not there', () => {
    const value = accepted(
      webpFile(webpChunk('VP8X', new Uint8Array()), webpChunk('VP8 ', ascii('a-lossy-bitstream-payload-here'))),
    );
    expect(value.mediaType).toBe('image/webp');
    expect(text(value.content)).toContain('VP8X');
  });
});
