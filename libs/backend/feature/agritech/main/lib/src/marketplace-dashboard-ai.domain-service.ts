// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import type {
  AgriTechOwner,
  AiConsultationKind,
  MarketplaceAiConsultation,
  MarketplaceAiStarterCartInput,
  MarketplaceAiStarterCartResult,
  MarketplaceDashboardAiRepository,
  MarketplaceRoleDashboard,
  OperationResult,
} from '@app/backend-feature-agritech-shared';

function unwrap<T>(result: OperationResult<T>, resourceType: string): T {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(resourceType);
  }
  if (result.status === 'forbidden') {
    throw new ForbiddenException(resourceType);
  }
  if (result.status === 'conflict') {
    throw new ConflictException(resourceType, result.field);
  }
  throw new BadRequestException({ meta: { field: result.field, resourceType } });
}

/** Framework-independent dashboard and grounded-AI application boundary. */
export class MarketplaceDashboardAiDomainService {
  constructor(protected readonly repository: MarketplaceDashboardAiRepository) {}

  async getRoleDashboard(owner: AgriTechOwner): Promise<MarketplaceRoleDashboard> {
    return unwrap(await this.repository.getRoleDashboard(owner), 'marketplace-dashboard');
  }

  async createAiConsultation(
    owner: AgriTechOwner,
    kind: AiConsultationKind,
    question: string,
    idempotencyKey: string,
  ): Promise<MarketplaceAiConsultation> {
    return unwrap(await this.repository.createAiConsultation(owner, kind, question, idempotencyKey), 'ai-consultation');
  }

  listAiConsultations(owner: AgriTechOwner): Promise<MarketplaceAiConsultation[]> {
    return this.repository.listAiConsultations(owner);
  }

  async confirmAiStarterCart(
    owner: AgriTechOwner,
    consultationId: string,
    input: MarketplaceAiStarterCartInput,
    idempotencyKey: string,
  ): Promise<MarketplaceAiStarterCartResult> {
    if (!input.confirmed) {
      throw new BadRequestException({ meta: { field: 'confirmed', resourceType: 'ai-consultation' } });
    }
    return unwrap(
      await this.repository.confirmAiStarterCart(owner, consultationId, input, idempotencyKey),
      'ai-starter-cart',
    );
  }
}
