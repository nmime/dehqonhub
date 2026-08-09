// @requirements REQ-AGRITECH-MARKETPLACE-016
import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import { ReviewVerificationDto } from '@app/backend-feature-agritech-admin';

const verificationId = '11111111-1111-4111-8111-111111111111';
const shadowReviewService = { review: vi.fn() };

@Controller('admin/verifications')
class VerificationReviewValidationController {
  @Patch(':id')
  review(@Param('id', ParseUUIDPipe) id: string, @Body() input: ReviewVerificationDto) {
    shadowReviewService.review(id, input);
    return { data: input };
  }
}

describe('admin verification review HTTP validation', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VerificationReviewValidationController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new ExceptionsFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [{ decision: 'rejected' }, 400],
    [{ decision: 'verified', reason: 'criteria_not_met' }, 400],
    [{ decision: 'rejected', reason: 'documents_unreadable' }, 200],
    [{ decision: 'verified' }, 200],
  ] as const)('validates %j with HTTP %s', async (payload, expectedStatus) => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/verifications/${verificationId}`,
      headers: { 'x-request-id': '33333333-3333-4333-8333-333333333333' },
      payload,
    });

    expect(response.statusCode).toBe(expectedStatus);
    if (expectedStatus === 400) {
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({
        errors: [expect.objectContaining({ pointer: '#/reason' })],
        status: 400,
      });
    } else {
      expect(response.json()).toEqual({ data: payload });
    }
  });

  it('rejects a malformed verification id before invoking the shadow service', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/verifications/not-a-uuid',
      headers: { 'x-request-id': '33333333-3333-4333-8333-333333333333' },
      payload: { decision: 'verified' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 400 });
    expect(shadowReviewService.review).not.toHaveBeenCalled();
  });
});
