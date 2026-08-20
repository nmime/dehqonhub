// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-ROUTING-015
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Multipart } from '@fastify/multipart';
import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiParam, ApiProduces, ApiProperty, ApiTags } from '@nestjs/swagger';
import { BadRequestException, Exception, ExceptionKind } from '@app/backend-common-exception';
import { createOkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import {
  marketplaceMediaTypes,
  maximumMarketplaceListingImages,
  maximumMarketplaceMediaBytes,
  maximumMarketplaceReviewAssets,
  type AgriTechOwner,
  type MarketplaceMediaType,
} from '@app/backend-feature-agritech-shared';
import { CurrentUser, Public, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { MarketplaceMediaService } from './marketplace-media.service';

const uploadFieldName = 'photo';

class MarketplacePhotographPayloadTooLargeException extends Exception({
  kind: ExceptionKind.Client,
  name: 'MarketplacePhotographPayloadTooLargeException',
  status: HttpStatus.PAYLOAD_TOO_LARGE,
}) {}

class MarketplacePhotographDto {
  @ApiProperty({ description: 'Opaque public identifier of the stored photograph.' })
  id!: string;
  @ApiProperty({
    description: 'Root-relative same-origin path a listing image column accepts.',
    example: '/marketplace/media/AAAAAAAAAAAAAAAAAAAAAA',
  })
  path!: string;
  @ApiProperty({
    description: "Opaque handle a review's assetReferences accepts.",
    example: 'public-asset:AAAAAAAAAAAAAAAAAAAAAA',
  })
  reference!: string;
  @ApiProperty({ enum: marketplaceMediaTypes }) mediaType!: MarketplaceMediaType;
  @ApiProperty({ type: 'integer' }) byteSize!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

class MarketplacePhotographCapabilityDto {
  @ApiProperty({ description: 'Whether this deployment can store an uploaded photograph at all.' })
  configured!: boolean;
  @ApiProperty({ enum: marketplaceMediaTypes, isArray: true }) mediaTypes!: readonly MarketplaceMediaType[];
  @ApiProperty({ type: 'integer' }) maximumByteSize!: number;
  @ApiProperty({ type: 'integer' }) maximumListingImages!: number;
  @ApiProperty({ type: 'integer' }) maximumReviewAssets!: number;
}

/**
 * Uploading a photograph, and asking whether uploading is possible.
 *
 * Both are authenticated: an account uploads, and the answer to "can this
 * deployment store a photograph" is only ever needed by a screen that is about
 * to offer the control. The bare `GET` cannot collide with the public
 * `GET /marketplace/media/{id}` read, so neither route depends on the order the
 * two controllers are registered in.
 */
@ApiTags('marketplace-media')
@ApiExceptions(400, 401, 413, 500, 503)
@ApiSessionCookieAuth()
@Controller('marketplace/media')
export class MarketplaceMediaController {
  constructor(private readonly service: MarketplaceMediaService) {}

  @Get()
  @ApiOkDataResponse(MarketplacePhotographCapabilityDto)
  getCapability() {
    return createOkResponse({
      configured: this.service.configured,
      maximumByteSize: maximumMarketplaceMediaBytes,
      maximumListingImages: maximumMarketplaceListingImages,
      maximumReviewAssets: maximumMarketplaceReviewAssets,
      mediaTypes: marketplaceMediaTypes,
    });
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      additionalProperties: false,
      properties: { [uploadFieldName]: { format: 'binary', type: 'string' } },
      required: [uploadFieldName],
      type: 'object',
    },
  })
  @ApiOkDataResponse(MarketplacePhotographDto)
  async storePhotograph(@CurrentUser() principal: AuthenticatedPrincipal, @Req() request: FastifyRequest) {
    const upload = await readPhotographPart(request);

    return createOkResponse(await this.service.storePhotograph(ownerFrom(principal), upload));
  }
}

/**
 * The read side, and the reason an uploaded photograph is usable at all.
 *
 * A published listing is public and a guest holds no session, so the bytes have
 * to be readable without one. The address is the only credential: a 128-bit
 * random id nobody can enumerate, resolved server-side to a storage key the
 * response never mentions. Because the route lives under `/marketplace/*`, every
 * deployment's reverse proxy already sends it to this API from the same origin
 * the page was served from, so `img-src 'self'` is satisfied without widening
 * any content-security policy.
 */
@ApiTags('marketplace-public-media')
@ApiExceptions(404, 500, 503)
@Public()
@Controller('marketplace/media')
export class MarketplacePublicMediaController {
  constructor(private readonly service: MarketplaceMediaService) {}

  @Get(':id')
  @ApiParam({ name: 'id', schema: { pattern: '^[A-Za-z0-9_-]{22}$', type: 'string' } })
  @ApiProduces(...marketplaceMediaTypes)
  @ApiOkResponse({
    content: Object.fromEntries(
      marketplaceMediaTypes.map((mediaType) => [mediaType, { schema: { format: 'binary', type: 'string' } }]),
    ),
    description: 'The stored photograph, served from this API origin.',
  })
  async readPhotograph(@Param('id') id: string, @Res({ passthrough: true }) response: FastifyReply) {
    const photograph = await this.service.readPhotograph(id);
    response.header('Content-Type', photograph.mediaType);
    response.header('Content-Disposition', 'inline');
    response.header('X-Content-Type-Options', 'nosniff');
    // The identifier is random and an object is never rewritten under it, so the
    // bytes behind one address can never change. Anything less than immutable
    // would make every catalogue card re-fetch its photograph.
    response.header('Cache-Control', 'public, max-age=31536000, immutable');

    return Buffer.from(photograph.content);
  }
}

function ownerFrom(principal: AuthenticatedPrincipal): AgriTechOwner {
  return { tenantId: principal.tenantId, userId: principal.subject };
}

/**
 * Read exactly one file part, bounded before it is buffered.
 *
 * The limits are stated per route rather than inherited: `parts: 1` and
 * `fields: 0` mean the request is one file and nothing else, and `fileSize`
 * stops the stream at the photograph bound instead of at the framework's larger
 * default. A rejected part is still drained, because an abandoned multipart
 * stream leaves the connection unable to complete.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- multipart stream validation and draining must remain one bounded request-state machine
async function readPhotographPart(request: FastifyRequest): Promise<{ content: Uint8Array; fileName: string }> {
  let photograph: { content: Uint8Array; fileName: string } | undefined;
  let invalidPart = false;
  try {
    const multipartRequest = request as FastifyRequest & {
      parts(options?: { limits?: Record<string, number> }): AsyncIterableIterator<Multipart>;
    };
    for await (const part of multipartRequest.parts({
      limits: {
        fieldNameSize: 64,
        fieldSize: 1024,
        fields: 0,
        files: 1,
        headerPairs: 64,
        parts: 1,
        fileSize: maximumMarketplaceMediaBytes,
      },
    })) {
      if (part.type !== 'file') {
        invalidPart = true;
        continue;
      }
      if (part.fieldname !== uploadFieldName || photograph) {
        invalidPart = true;
        for await (const chunk of part.file) {
          // Drain rejected file streams so Fastify can safely complete the request.
          const drainedChunk: unknown = chunk;
          if (!(drainedChunk instanceof Uint8Array)) {
            throw new BadRequestException({ meta: { field: uploadFieldName } });
          }
        }
        continue;
      }
      const chunks: Uint8Array[] = [];
      let byteSize = 0;
      let tooLarge = false;
      for await (const chunk of part.file) {
        const unknownChunk: unknown = chunk;
        if (!(unknownChunk instanceof Uint8Array)) {
          throw new BadRequestException({ meta: { field: uploadFieldName } });
        }
        const buffer = Uint8Array.from(unknownChunk);
        byteSize += buffer.byteLength;
        if (byteSize > maximumMarketplaceMediaBytes) {
          tooLarge = true;
        } else {
          chunks.push(buffer);
        }
      }
      if (tooLarge || part.file.truncated) {
        throw new MarketplacePhotographPayloadTooLargeException();
      }
      photograph = { content: Buffer.concat(chunks, byteSize), fileName: part.filename };
    }
  } catch (error) {
    if (
      error instanceof MarketplacePhotographPayloadTooLargeException ||
      multipartErrorCode(error) === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      throw new MarketplacePhotographPayloadTooLargeException();
    }
    throw new BadRequestException({
      ...(error instanceof Error ? { cause: error } : {}),
      meta: { field: uploadFieldName },
    });
  }
  if (invalidPart || !photograph) {
    throw new BadRequestException({ meta: { field: uploadFieldName } });
  }

  return photograph;
}

function multipartErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}
