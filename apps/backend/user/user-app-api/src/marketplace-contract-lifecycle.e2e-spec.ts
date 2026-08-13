// @requirements REQ-AGRITECH-LIFECYCLE-020
import fastifyMultipart from '@fastify/multipart';
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import {
  maximumMarketplaceDisputeEvidenceBytes,
  MarketplaceContractLifecycleController,
  MarketplaceContractLifecycleService,
  type MarketplaceContractDisputeEvidence,
} from '@app/backend-feature-agritech-main';
import {
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';

const contractId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';
const disputeId = '33333333-3333-4333-8333-333333333333';
const tenantId = '44444444-4444-4444-8444-444444444444';
const userId = 'buyer-lifecycle-user';
const timestamp = new Date('2030-01-01T00:00:00.000Z');
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const storeDisputeEvidence = vi.fn<MarketplaceContractLifecycleService['storeDisputeEvidence']>();

const authenticatedHeaders = {
  'x-test-subject': userId,
  'x-test-tenant': tenantId,
};

describe('marketplace contract lifecycle multipart HTTP boundary', () => {
  let app: NestFastifyApplication;
  let openApi: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceContractLifecycleController],
      providers: [
        { provide: MarketplaceContractLifecycleService, useValue: { storeDisputeEvidence } },
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
          fileSize: maximumMarketplaceDisputeEvidenceBytes,
          files: 1,
          headerPairs: 64,
          parts: 1,
        },
        throwFileSizeLimit: true,
      });
    await app.init();
    openApi = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Contract lifecycle test').setVersion('1').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    storeDisputeEvidence.mockImplementation((owner, storedContractId, input) =>
      Promise.resolve(evidenceFixture(owner, storedContractId, input)),
    );
  });

  it('streams one authenticated evidence file and returns an explicit redacted projection', async () => {
    const boundary = 'dehqonhub-evidence-boundary';
    const response = await app.inject({
      headers: {
        ...authenticatedHeaders,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'idempotency-key': 'dispute-evidence-key-0001',
      },
      method: 'POST',
      payload: multipartBody(boundary, [
        {
          content: Buffer.concat([pngSignature, Buffer.from('safe-evidence')]),
          fileName: 'dalil.png',
          mediaType: 'image/png',
        },
      ]),
      url: `/marketplace/contracts/${contractId}/dispute-evidence`,
    });

    expect(response.statusCode).toBe(200);
    expect(storeDisputeEvidence).toHaveBeenCalledWith(
      { tenantId, userId },
      contractId,
      expect.objectContaining({ fileName: 'dalil.png', mediaType: 'image/png' }),
      'dispute-evidence-key-0001',
    );
    expect(response.json()).toMatchObject({
      data: {
        fileName: 'dalil.png',
        id: evidenceId,
        mediaType: 'image/png',
        providerMode: 'mock',
        revision: 1,
        simulation: true,
        uploadedByParty: 'buyer',
      },
    });
    expect(JSON.stringify(response.json())).not.toMatch(
      /contractId|disputeId|storageReference|uploadedByTenantId|uploadedByUserId|operationId|providerReference|safeReceipt/u,
    );
  });

  it('rejects anonymous, absent, unknown, extra, and unsupported parts as typed problems', async () => {
    const cases = [
      { headers: {}, parts: [filePart('proof.png', 'image/png', pngSignature)], status: 401 },
      { headers: authenticatedHeaders, parts: [], status: 400 },
      {
        headers: authenticatedHeaders,
        parts: [{ content: Buffer.from('note'), fieldName: 'note' }],
        status: 400,
      },
      {
        headers: authenticatedHeaders,
        parts: [filePart('proof.txt', 'text/plain', Buffer.from('not evidence'))],
        status: 400,
      },
      {
        headers: authenticatedHeaders,
        parts: [filePart('one.png', 'image/png', pngSignature), filePart('two.png', 'image/png', pngSignature)],
        status: 400,
      },
    ];

    const responses = await Promise.all(
      cases.map((testCase, index) => {
        const boundary = `dehqonhub-invalid-${index}`;
        return app.inject({
          headers: {
            ...testCase.headers,
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'idempotency-key': 'dispute-evidence-key-0002',
          },
          method: 'POST',
          payload: multipartBody(boundary, testCase.parts),
          url: `/marketplace/contracts/${contractId}/dispute-evidence`,
        });
      }),
    );
    for (const [index, response] of responses.entries()) {
      const testCase = cases[index];
      if (!testCase) {
        throw new Error('Missing multipart test case.');
      }
      expectProblem(response, testCase.status);
    }
    expect(storeDisputeEvidence).not.toHaveBeenCalled();
  });

  it('returns a typed 413 and never calls the provider when the file is truncated at 10 MiB', async () => {
    const boundary = 'dehqonhub-oversized-evidence';
    const response = await app.inject({
      headers: {
        ...authenticatedHeaders,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'idempotency-key': 'dispute-evidence-key-0003',
      },
      method: 'POST',
      payload: multipartBody(boundary, [
        filePart(
          'large.png',
          'image/png',
          Buffer.concat([pngSignature, Buffer.alloc(maximumMarketplaceDisputeEvidenceBytes, 0x61)]),
        ),
      ]),
      url: `/marketplace/contracts/${contractId}/dispute-evidence`,
    });

    expectProblem(response, 413);
    expect(storeDisputeEvidence).not.toHaveBeenCalled();
  });

  it('publishes one strict binary multipart request schema', () => {
    expect(openApi.paths['/marketplace/contracts/{id}/dispute-evidence']?.post).toMatchObject({
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              additionalProperties: false,
              properties: { evidence: { format: 'binary', type: 'string' } },
              required: ['evidence'],
              type: 'object',
            },
          },
        },
      },
    });
  });

  it('publishes string contracts for the artifact watermark and settlement event type', () => {
    expect(openApi.components?.schemas?.['ContractArtifactDto']).toMatchObject({
      properties: {
        watermark: {
          enum: ['MOCK PROVIDER — NOT A LEGAL CONTRACT'],
          nullable: true,
          type: 'string',
        },
      },
    });
    expect(openApi.components?.schemas?.['ContractSettlementEventDto']).toMatchObject({
      properties: {
        eventType: {
          enum: [
            'buyer_consented',
            'seller_consented',
            'buyer_payment_confirmed',
            'seller_receipt_confirmed',
            'factoring_requested',
            'factoring_approved',
            'factoring_rejected',
            'seller_paid',
            'buyer_repaid',
            'factoring_closed',
          ],
          type: 'string',
        },
      },
    });
  });
});

interface MultipartPartInput {
  content: Buffer;
  fieldName?: string;
  fileName?: string;
  mediaType?: string;
}

function filePart(fileName: string, mediaType: string, content: Buffer): MultipartPartInput {
  return { content, fieldName: 'evidence', fileName, mediaType };
}

function multipartBody(boundary: string, parts: MultipartPartInput[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.fieldName ?? 'evidence'}"`));
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

function evidenceFixture(
  owner: { tenantId: string; userId: string },
  storedContractId: string,
  input: { content: Uint8Array; fileName: string; mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' },
): MarketplaceContractDisputeEvidence {
  return {
    byteSize: input.content.byteLength,
    checksumSha256: 'a'.repeat(64),
    contractId: storedContractId,
    createdAt: timestamp,
    disputeId,
    fileName: input.fileName,
    id: evidenceId,
    mediaType: input.mediaType,
    providerMode: 'mock',
    providerName: 'mock-dispute-evidence-storage',
    revision: 1,
    simulation: true,
    storageReference: 'private-storage-key-not-for-user-response',
    uploadedByParty: 'buyer',
    uploadedByTenantId: owner.tenantId,
    uploadedByUserId: owner.userId,
  };
}

function expectProblem(
  response: { headers: Record<string, unknown>; json(): unknown; statusCode: number },
  status: number,
): void {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toEqual(expect.stringContaining('application/problem+json'));
  expect(response.json()).toMatchObject({ status });
}
