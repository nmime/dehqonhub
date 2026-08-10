// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { createHash, randomUUID } from 'node:crypto';
import { MarketplaceVerificationDomainService } from '@app/backend-feature-agritech-main-marketplace-verification-domain';
import * as agriTechSharedSource from '@app/backend-feature-agritech-shared';
import {
  type AgriTechOwner,
  type MarketplaceDocumentProvider,
  type MarketplaceDocumentProviderResult,
  type MarketplaceIdentityProvider,
  type MarketplaceIdentityProviderResult,
  type MarketplaceProviderOperationPreparation,
  type MarketplaceVerificationRepository,
  type OperationResult,
  type PreparedMarketplaceProviderOperation,
  type Verification,
  type VerificationDocumentInput,
  type VerificationRole,
} from '@app/backend-feature-agritech-shared';

const agriTechShared =
  (
    agriTechSharedSource as unknown as {
      default?: typeof agriTechSharedSource;
    }
  ).default ?? agriTechSharedSource;
const { hasRequiredVerificationDocuments } = agriTechShared;

interface StoredOperation {
  attempt: number;
  input: MarketplaceProviderOperationPreparation;
  owner: AgriTechOwner;
  id: string;
  status: 'started' | 'succeeded' | 'failed';
  replay?: Verification;
}

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });

const cloneVerification = (verification: Verification): Verification => structuredClone(verification);

const ownerKey = (owner: AgriTechOwner): string => `${owner.tenantId}:${owner.userId}`;

class AcceptanceVerificationRepository implements MarketplaceVerificationRepository {
  private readonly operations = new Map<string, StoredOperation>();
  private readonly verifications = new Map<string, Verification>();

  createVerification(owner: AgriTechOwner, role: VerificationRole): Promise<OperationResult<Verification>> {
    const key = ownerKey(owner);
    const current = this.verifications.get(key);
    if (current) {
      return Promise.resolve(ok(cloneVerification(current)));
    }
    const now = new Date('2030-01-01T00:00:00.000Z');
    const created: Verification = {
      caseRevision: 0,
      createdAt: now,
      documents: [],
      id: randomUUID(),
      identityAssurance: 'none',
      level: 'basic',
      oneIdLinked: false,
      providerMode: 'none',
      role,
      status: 'none',
      tenantId: owner.tenantId,
      updatedAt: now,
      userId: owner.userId,
      version: 0,
    };
    this.verifications.set(key, created);
    return Promise.resolve(ok(cloneVerification(created)));
  }

  getVerification(owner: AgriTechOwner): Promise<Verification | undefined> {
    const verification = this.verifications.get(ownerKey(owner));
    return Promise.resolve(verification ? cloneVerification(verification) : undefined);
  }

  prepareProviderOperation(
    owner: AgriTechOwner,
    input: MarketplaceProviderOperationPreparation,
  ): Promise<OperationResult<PreparedMarketplaceProviderOperation>> {
    const verification = this.verifications.get(ownerKey(owner));
    if (!verification || input.resourceId !== verification.id) {
      return Promise.resolve({ status: 'not_found', field: 'verification' });
    }
    const operationKey = [
      ownerKey(owner),
      input.capability,
      input.resourceType,
      input.resourceId,
      input.idempotencyKey,
    ].join(':');
    const existing = this.operations.get(operationKey);
    if (existing) {
      if (
        existing.input.requestFingerprint !== input.requestFingerprint ||
        existing.input.providerMode !== input.providerMode ||
        existing.input.providerName !== input.providerName ||
        existing.input.resourceRevision !== input.resourceRevision
      ) {
        return Promise.resolve({ status: 'conflict', field: 'idempotencyKey' });
      }
      if (existing.status === 'succeeded' && existing.replay) {
        return Promise.resolve(
          ok({
            attempt: existing.attempt,
            execute: false,
            operationId: existing.id,
            replay: cloneVerification(existing.replay),
          }),
        );
      }
      if (existing.status === 'started') {
        return Promise.resolve({ status: 'conflict', field: 'operationInProgress' });
      }
      existing.status = 'started';
      existing.attempt += 1;
      return Promise.resolve(ok({ attempt: existing.attempt, execute: true, operationId: existing.id }));
    }
    if (input.resourceRevision !== verification.caseRevision || verification.status !== 'none') {
      return Promise.resolve({ status: 'conflict', field: 'status' });
    }
    if (input.capability === 'oneid_link' && verification.oneIdLinked) {
      return Promise.resolve({ status: 'conflict', field: 'identity' });
    }
    const operation: StoredOperation = {
      attempt: 1,
      id: randomUUID(),
      input: structuredClone(input),
      owner: structuredClone(owner),
      status: 'started',
    };
    this.operations.set(operationKey, operation);
    return Promise.resolve(ok({ attempt: operation.attempt, execute: true, operationId: operation.id }));
  }

  completeIdentityLink(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    result: MarketplaceIdentityProviderResult,
  ): Promise<OperationResult<Verification>> {
    const verification = this.verifications.get(ownerKey(owner));
    const operation = this.findOperation(owner, operationId);
    if (!verification || !operation) {
      return Promise.resolve({ status: 'not_found' });
    }
    if (operation.attempt !== operationAttempt) {
      return Promise.resolve({ status: 'conflict', field: 'operationAttempt' });
    }
    if (operation.status === 'succeeded' && operation.replay) {
      return Promise.resolve(ok(cloneVerification(operation.replay)));
    }
    if (verification.status !== 'none' || verification.oneIdLinked) {
      return Promise.resolve({ status: 'conflict', field: 'status' });
    }
    Object.assign(verification, {
      identityAssurance: result.identityAssurance,
      oneIdLinked: true,
      oneIdLinkedAt: result.linkedAt,
      providerMode: result.providerMode,
      providerName: result.providerName,
      providerReceiptId: result.receiptId,
      providerSubjectKey: result.subjectKey,
      updatedAt: result.linkedAt,
      version: verification.version + 1,
    });
    operation.status = 'succeeded';
    operation.replay = cloneVerification(verification);
    return Promise.resolve(ok(cloneVerification(verification)));
  }

  completeVerificationDocuments(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    result: MarketplaceDocumentProviderResult,
  ): Promise<OperationResult<Verification>> {
    const verification = this.verifications.get(ownerKey(owner));
    const operation = this.findOperation(owner, operationId);
    if (!verification || !operation) {
      return Promise.resolve({ status: 'not_found' });
    }
    if (operation.attempt !== operationAttempt) {
      return Promise.resolve({ status: 'conflict', field: 'operationAttempt' });
    }
    if (operation.status === 'succeeded' && operation.replay) {
      return Promise.resolve(ok(cloneVerification(operation.replay)));
    }
    if (verification.status !== 'none' || !verification.oneIdLinked) {
      return Promise.resolve({ status: 'conflict', field: 'status' });
    }
    const byKind = new Map(verification.documents.map((document) => [document.kind, document]));
    for (const item of result.evidence) {
      byKind.set(item.document.kind, {
        ...item.document,
        evidenceId: randomUUID(),
        storageKey: `acceptance-evidence:${item.document.sha256}`,
      });
    }
    verification.documents = [...byKind.values()];
    verification.updatedAt = result.storedAt;
    verification.version += 1;
    operation.status = 'succeeded';
    operation.replay = cloneVerification(verification);
    return Promise.resolve(ok(cloneVerification(verification)));
  }

  failProviderOperation(owner: AgriTechOwner, operationId: string, operationAttempt: number): Promise<void> {
    const operation = this.findOperation(owner, operationId);
    if (operation?.attempt === operationAttempt && operation.status !== 'succeeded') {
      operation.status = 'failed';
    }
    return Promise.resolve();
  }

  submitVerification(owner: AgriTechOwner): Promise<OperationResult<Verification>> {
    const verification = this.verifications.get(ownerKey(owner));
    if (!verification) {
      return Promise.resolve({ status: 'not_found' });
    }
    if (
      verification.status !== 'none' ||
      !verification.oneIdLinked ||
      !hasRequiredVerificationDocuments(verification.role, verification.documents)
    ) {
      return Promise.resolve({ status: 'invalid_state', field: 'evidence' });
    }
    verification.status = 'pending';
    verification.updatedAt = new Date('2030-01-01T00:03:00.000Z');
    verification.version += 1;
    return Promise.resolve(ok(cloneVerification(verification)));
  }

  private findOperation(owner: AgriTechOwner, operationId: string): StoredOperation | undefined {
    return [...this.operations.values()].find(
      (operation) => operation.id === operationId && ownerKey(operation.owner) === ownerKey(owner),
    );
  }
}

class AcceptanceIdentityProvider implements MarketplaceIdentityProvider {
  readonly mode = 'mock' as const;
  readonly name = 'acceptance-mock-oneid';
  executions = 0;

  linkIdentity(input: {
    owner: AgriTechOwner;
    operationAttempt: number;
    operationId: string;
  }): Promise<MarketplaceIdentityProviderResult> {
    this.executions += 1;
    return Promise.resolve({
      identityAssurance: 'mock',
      linkedAt: new Date('2030-01-01T00:01:00.000Z'),
      providerMode: 'mock',
      providerName: this.name,
      receiptId: `mock-oneid:${input.operationId}`,
      subjectKey: createHash('sha256').update(`acceptance:${input.owner.userId}`).digest('hex'),
    });
  }
}

class AcceptanceDocumentProvider implements MarketplaceDocumentProvider {
  readonly mode = 'mock' as const;
  readonly name = 'acceptance-mock-storage';
  executions = 0;

  storeVerificationDocuments(input: {
    documents: VerificationDocumentInput[];
    operationAttempt: number;
    operationId: string;
  }): Promise<MarketplaceDocumentProviderResult> {
    this.executions += 1;
    const storedAt = new Date('2030-01-01T00:02:00.000Z');
    const receiptId = `mock-document:${input.operationId}`;
    return Promise.resolve({
      evidence: input.documents.map((document) => ({
        document: {
          fileName: document.fileName,
          kind: document.kind,
          mimeType: document.mimeType,
          providerMode: 'mock',
          providerName: this.name,
          providerReceiptId: receiptId,
          sha256: createHash('sha256').update(document.content).digest('hex'),
          sizeBytes: document.content.byteLength,
          storedAt: storedAt.toISOString(),
        },
      })),
      providerMode: 'mock',
      providerName: this.name,
      receiptId,
      storedAt,
    });
  }
}

export class MarketplaceVerificationAcceptanceAdapter {
  private readonly documentProvider = new AcceptanceDocumentProvider();
  private readonly identityProvider = new AcceptanceIdentityProvider();
  private readonly repository = new AcceptanceVerificationRepository();
  private readonly service = new MarketplaceVerificationDomainService(
    this.repository,
    this.identityProvider,
    this.documentProvider,
  );

  create(owner: AgriTechOwner, role: VerificationRole): Promise<Verification> {
    return this.service.createVerification(owner, role, 0, `acceptance-verification-create:${owner.userId}`);
  }

  linkOneId(owner: AgriTechOwner, idempotencyKey: string): Promise<Verification> {
    return this.service.linkOneId(owner, idempotencyKey);
  }

  storeDocument(
    owner: AgriTechOwner,
    document: VerificationDocumentInput,
    idempotencyKey: string,
  ): Promise<Verification> {
    return this.service.storeDocuments(owner, [document], idempotencyKey);
  }

  async submit(owner: AgriTechOwner): Promise<Verification> {
    const verification = await this.repository.getVerification(owner);
    if (!verification) {
      throw new Error('Acceptance verification fixture is missing.');
    }
    return this.service.submitVerification(
      owner,
      verification.version,
      `acceptance-verification-submit:${owner.userId}`,
    );
  }

  executionCounts(): { documents: number; identity: number } {
    return { documents: this.documentProvider.executions, identity: this.identityProvider.executions };
  }
}
