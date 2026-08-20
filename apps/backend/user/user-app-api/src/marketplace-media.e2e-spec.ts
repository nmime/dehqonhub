// @requirements REQ-AGRITECH-PUBLIC-018
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyMultipart from '@fastify/multipart';
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import {
  MarketplaceMediaController,
  MarketplaceMediaService,
  MarketplacePublicMediaController,
  maximumMarketplaceMediaBytes,
} from '@app/backend-feature-agritech-main';
import {
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';

const tenantId = '44444444-4444-4444-8444-444444444444';
const userId = 'seller-media-user';
const publicId = 'AbCdEf0123456789_-xyzQ';
const workspaceRoot = join(import.meta.dirname, '../../../../..');
const photograph = new Uint8Array(
  readFileSync(join(workspaceRoot, 'apps/frontend/app/public/media/marketplace/wheat-grain.webp')),
);

const authenticatedHeaders = { 'x-test-subject': userId, 'x-test-tenant': tenantId };

const storePhotograph = vi.fn<MarketplaceMediaService['storePhotograph']>();
const readPhotograph = vi.fn<MarketplaceMediaService['readPhotograph']>();

interface MultipartPartInput {
  content: Buffer;
  fieldName?: string;
  fileName?: string;
  mediaType?: string;
}

function multipartBody(boundary: string, parts: MultipartPartInput[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.fieldName ?? 'photo'}"`));
    if (part.fileName) {
      chunks.push(
        Buffer.from(`; filename="${part.fileName}"\r\nContent-Type: ${part.mediaType ?? 'application/octet-stream'}`),
      );
    }
    chunks.push(Buffer.from('\r\n\r\n'));
    chunks.push(part.content);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return Buffer.concat(chunks);
}

describe('marketplace photograph HTTP boundary', () => {
  let app: NestFastifyApplication;
  let openApi: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceMediaController, MarketplacePublicMediaController],
      providers: [
        { provide: MarketplaceMediaService, useValue: { configured: true, readPhotograph, storePhotograph } },
        SessionAuthGuard,
        { provide: APP_GUARD, useExisting: SessionAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new ExceptionsFilter());
    app.useGlobalPipes(createValidationPipe());
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (request, _reply, done) => {
        const subject = request.headers['x-test-subject'];
        const requestTenantId = request.headers['x-test-tenant'];
        if (typeof subject === 'string' && typeof requestTenantId === 'string') {
          const principal: AuthenticatedPrincipal = {
            permissions: [],
            roles: [],
            subject,
            tenantId: requestTenantId,
          };
          (request as unknown as AuthenticatedRequest).session = { user: principal };
        }
        done();
      });
    await app
      .getHttpAdapter()
      .getInstance()
      .register(fastifyMultipart, {
        limits: {
          fieldNameSize: 64,
          fieldSize: 1024,
          fields: 0,
          fileSize: maximumMarketplaceMediaBytes,
          files: 1,
          headerPairs: 64,
          parts: 1,
        },
        throwFileSizeLimit: true,
      });
    await app.init();
    openApi = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Marketplace photograph test').setVersion('1').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    storePhotograph.mockResolvedValue({
      byteSize: photograph.byteLength,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      id: publicId,
      mediaType: 'image/webp',
      path: `/marketplace/media/${publicId}`,
      reference: `public-asset:${publicId}`,
    });
    readPhotograph.mockResolvedValue({
      byteSize: photograph.byteLength,
      content: photograph,
      mediaType: 'image/webp',
    });
  });

  const upload = (parts: MultipartPartInput[], headers: Record<string, string> = authenticatedHeaders) => {
    const boundary = 'dehqonhub-photo-boundary';
    return app.inject({
      headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
      method: 'POST',
      payload: multipartBody(boundary, parts),
      url: '/marketplace/media',
    });
  };

  it('stores one authenticated photograph and returns only its opaque public members', async () => {
    const response = await upload([
      { content: Buffer.from(photograph), fileName: 'bugdoy.webp', mediaType: 'image/webp' },
    ]);

    expect(response.statusCode).toBe(200);
    expect(storePhotograph).toHaveBeenCalledWith(
      { tenantId, userId },
      expect.objectContaining({ fileName: 'bugdoy.webp' }),
    );
    expect(response.json()).toEqual({
      data: {
        byteSize: photograph.byteLength,
        createdAt: '2026-08-20T00:00:00.000Z',
        id: publicId,
        mediaType: 'image/webp',
        path: `/marketplace/media/${publicId}`,
        reference: `public-asset:${publicId}`,
      },
    });
    // No storage key, bucket, tenant or account reaches the wire.
    expect(response.body).not.toMatch(/tenant|owner|bucket|storageKey|checksum/iu);
  });

  it('answers the capability read so a client never offers an upload it cannot complete', async () => {
    const response = await app.inject({ headers: authenticatedHeaders, method: 'GET', url: '/marketplace/media' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        configured: true,
        maximumByteSize: maximumMarketplaceMediaBytes,
        maximumListingImages: 5,
        maximumReviewAssets: 3,
        mediaTypes: ['image/jpeg', 'image/png', 'image/webp'],
      },
    });
  });

  it('requires a session to upload and never reads the part without one', async () => {
    const response = await upload(
      [{ content: Buffer.from(photograph), fileName: 'bugdoy.webp', mediaType: 'image/webp' }],
      {},
    );

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toEqual(expect.stringContaining('application/problem+json'));
    expect(storePhotograph).not.toHaveBeenCalled();
  });

  it('refuses a request that is not one file part named photo', async () => {
    for (const parts of [
      [],
      [{ content: Buffer.from('a value'), fieldName: 'photo' }],
      [{ content: Buffer.from(photograph), fieldName: 'evidence', fileName: 'bugdoy.webp' }],
    ] satisfies MultipartPartInput[][]) {
      const response = await upload(parts);
      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toEqual(expect.stringContaining('application/problem+json'));
    }
    expect(storePhotograph).not.toHaveBeenCalled();
  });

  it('stops an oversized stream at the bound rather than buffering it', async () => {
    const response = await upload([
      {
        content: Buffer.concat([Buffer.from(photograph), Buffer.alloc(maximumMarketplaceMediaBytes, 0x41)]),
        fileName: 'huge.webp',
        mediaType: 'image/webp',
      },
    ]);

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ status: 413 });
    expect(storePhotograph).not.toHaveBeenCalled();
  });

  it('serves the bytes to a guest with the container media type and immutable caching', async () => {
    const response = await app.inject({ method: 'GET', url: `/marketplace/media/${publicId}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.headers['content-disposition']).toBe('inline');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.rawPayload.byteLength).toBe(photograph.byteLength);
    expect(readPhotograph).toHaveBeenCalledWith(publicId);
  });

  it('publishes one strict binary multipart request schema and a same-origin read path', () => {
    const upload = openApi.paths?.['/marketplace/media']?.post;
    expect(upload?.requestBody).toMatchObject({
      content: {
        'multipart/form-data': {
          schema: {
            additionalProperties: false,
            properties: { photo: { format: 'binary', type: 'string' } },
            required: ['photo'],
            type: 'object',
          },
        },
      },
    });
    const read = openApi.paths?.['/marketplace/media/{id}']?.get;
    expect(Object.keys(read?.responses?.['200']?.content ?? {})).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    // The read is public: no security requirement is attached to it.
    expect(read?.security).toBeUndefined();
  });
});
