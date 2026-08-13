// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Exception,
  ExceptionKind,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import { marketplaceProviderFingerprint } from '@app/backend-feature-agritech-shared';
import type {
  AgriTechOwner,
  MarketplaceDocumentProvider,
  MarketplaceIdentityProvider,
  MarketplaceVerificationRepository,
  OperationResult,
  Verification,
  VerificationDocumentInput,
  VerificationRole,
  MarketplaceProviderCapability,
} from '@app/backend-feature-agritech-shared';

export const MarketplaceProviderUnavailableExtensions = class {
  capability!: MarketplaceProviderCapability;
  providerMode!: 'disabled' | 'mock' | 'live';
  retryable!: boolean;
  retryAfterSeconds?: number;
};

export class MarketplaceProviderUnavailableException extends Exception({
  name: 'MarketplaceProviderUnavailableException',
  kind: ExceptionKind.Server,
  problemType: 'marketplace-provider-unavailable',
  extensionsType: MarketplaceProviderUnavailableExtensions,
}) {}

function unwrap<T>(result: OperationResult<T>, label: string): T {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(label);
  }
  if (result.status === 'conflict') {
    throw new ConflictException(label);
  }
  throw new BadRequestException({ meta: { field: result.field, resourceType: label } });
}

const maximumVerificationDocumentBytes = 10 * 1024 * 1024;
const defaultProviderTimeoutMs = 10_000;

export interface MarketplaceVerificationProviderTimeouts {
  documentsTimeoutMs: number;
  oneIdTimeoutMs: number;
}

class MarketplaceProviderTimeoutError extends Error {
  constructor() {
    super('Marketplace provider timed out.');
    this.name = 'MarketplaceProviderTimeoutError';
  }
}

async function callProvider<T>(timeoutMs: number, invoke: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new MarketplaceProviderTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([invoke(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function hasExpectedMagic(document: VerificationDocumentInput): boolean {
  const { content, mimeType } = document;
  if (mimeType === 'application/pdf') {
    return Buffer.from(content.subarray(0, 5)).toString('ascii') === '%PDF-';
  }
  if (mimeType === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => content[index] === byte);
  }
  return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
}

/** Framework-independent verification orchestration used by Nest and executable acceptance. */
export class MarketplaceVerificationDomainService {
  constructor(
    protected readonly repository: MarketplaceVerificationRepository,
    protected readonly identityProvider: MarketplaceIdentityProvider,
    protected readonly documentProvider: MarketplaceDocumentProvider,
    protected readonly providerTimeouts: MarketplaceVerificationProviderTimeouts = {
      documentsTimeoutMs: defaultProviderTimeoutMs,
      oneIdTimeoutMs: defaultProviderTimeoutMs,
    },
  ) {}

  async createVerification(
    owner: AgriTechOwner,
    role: VerificationRole,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<Verification> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new BadRequestException({ meta: { field: 'expectedRevision', resourceType: 'verification' } });
    }
    return unwrap(
      await this.repository.createVerification(owner, role, expectedRevision, idempotencyKey),
      'verification',
    );
  }

  async linkOneId(owner: AgriTechOwner, idempotencyKey: string): Promise<Verification> {
    this.requireProvider(this.identityProvider, 'oneid_link');
    const verification = await this.requireVerification(owner);
    const scope = {
      resourceId: verification.id,
      resourceRevision: verification.caseRevision,
      resourceType: 'verification' as const,
    };
    const requestDescriptor = { action: 'link-oneid' as const, ...scope };
    const prepared = unwrap(
      await this.repository.prepareProviderOperation(owner, {
        actorType: 'verification_subject',
        capability: 'oneid_link',
        idempotencyKey,
        providerMode: this.identityProvider.mode as 'mock' | 'live',
        providerName: this.identityProvider.name,
        requestDescriptor,
        ...scope,
        requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
      }),
      'verification-provider-operation',
    );
    if (!prepared.execute) {
      return this.requireReplay(prepared.replay);
    }
    try {
      const result = await callProvider(this.providerTimeouts.oneIdTimeoutMs, (signal) =>
        this.identityProvider.linkIdentity({
          operationAttempt: prepared.attempt,
          operationId: prepared.operationId,
          owner,
          signal,
        }),
      );
      return unwrap(
        await this.repository.completeIdentityLink(owner, prepared.operationId, prepared.attempt, result),
        'verification',
      );
    } catch (error) {
      await this.repository
        .failProviderOperation(
          owner,
          prepared.operationId,
          prepared.attempt,
          error instanceof MarketplaceProviderTimeoutError ? 'identity_provider_timeout' : 'identity_provider_failed',
        )
        .catch(() => undefined);
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      throw new MarketplaceProviderUnavailableException({
        cause: error instanceof Error ? error : new Error('Identity provider failed.'),
        extensions: {
          capability: 'oneid_link',
          providerMode: this.identityProvider.mode,
          retryAfterSeconds: 30,
          retryable: true,
        },
      });
    }
  }

  async storeDocuments(
    owner: AgriTechOwner,
    documents: VerificationDocumentInput[],
    idempotencyKey: string,
  ): Promise<Verification> {
    this.requireProvider(this.documentProvider, 'verification_documents');
    const document = documents.length === 1 ? documents[0] : undefined;
    if (
      !document ||
      document.content.byteLength === 0 ||
      document.content.byteLength > maximumVerificationDocumentBytes ||
      !hasExpectedMagic(document)
    ) {
      throw new BadRequestException({ meta: { field: 'documents', resourceType: 'verification' } });
    }
    const verification = await this.requireVerification(owner);
    const scope = {
      resourceId: verification.id,
      resourceRevision: verification.caseRevision,
      resourceType: 'verification' as const,
    };
    const requestDescriptor = {
      action: 'store-verification-document' as const,
      document: {
        fileName: document.fileName,
        kind: document.kind,
        mimeType: document.mimeType,
        sha256: createHash('sha256').update(document.content).digest('hex'),
        sizeBytes: document.content.byteLength,
      },
      ...scope,
    };
    const prepared = unwrap(
      await this.repository.prepareProviderOperation(owner, {
        actorType: 'verification_subject',
        capability: 'verification_documents',
        idempotencyKey,
        providerMode: this.documentProvider.mode as 'mock' | 'live',
        providerName: this.documentProvider.name,
        requestDescriptor,
        ...scope,
        requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
      }),
      'verification-provider-operation',
    );
    if (!prepared.execute) {
      return this.requireReplay(prepared.replay);
    }
    try {
      const result = await callProvider(this.providerTimeouts.documentsTimeoutMs, (signal) =>
        this.documentProvider.storeVerificationDocuments({
          documents: [document],
          operationAttempt: prepared.attempt,
          operationId: prepared.operationId,
          signal,
        }),
      );
      return unwrap(
        await this.repository.completeVerificationDocuments(owner, prepared.operationId, prepared.attempt, result),
        'verification',
      );
    } catch (error) {
      await this.repository
        .failProviderOperation(
          owner,
          prepared.operationId,
          prepared.attempt,
          error instanceof MarketplaceProviderTimeoutError ? 'document_provider_timeout' : 'document_provider_failed',
        )
        .catch(() => undefined);
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      throw new MarketplaceProviderUnavailableException({
        cause: error instanceof Error ? error : new Error('Document provider failed.'),
        extensions: {
          capability: 'verification_documents',
          providerMode: this.documentProvider.mode,
          retryAfterSeconds: 30,
          retryable: true,
        },
      });
    }
  }

  async submitVerification(
    owner: AgriTechOwner,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<Verification> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new BadRequestException({ meta: { field: 'expectedRevision', resourceType: 'verification' } });
    }
    return unwrap(await this.repository.submitVerification(owner, expectedRevision, idempotencyKey), 'verification');
  }

  private requireProvider(
    provider: MarketplaceIdentityProvider | MarketplaceDocumentProvider,
    capability: MarketplaceProviderCapability,
  ): void {
    if (provider.mode === 'disabled') {
      throw new MarketplaceProviderUnavailableException({
        extensions: { capability, providerMode: 'disabled', retryable: false },
        meta: { provider: provider.name },
      });
    }
  }

  private requireReplay(verification: Verification | undefined): Verification {
    if (!verification) {
      throw new BadRequestException({
        meta: { field: 'resultSnapshot', resourceType: 'verification-provider-operation' },
      });
    }
    return verification;
  }

  private async requireVerification(owner: AgriTechOwner): Promise<Verification> {
    const verification = await this.repository.getVerification(owner);
    if (!verification) {
      throw new ResourceNotFoundException('verification');
    }
    return verification;
  }
}
