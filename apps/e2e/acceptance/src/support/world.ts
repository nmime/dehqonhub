import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';

export class AcceptanceWorld extends World {
  claim: unknown;
  normalizedRoles: string[] = [];
  permissions: string[] = [];
  requestId: string | undefined;
  occurrenceUri: string | undefined;
  occurrenceError: unknown;
  notificationChannel: string | undefined;
  externalDelivery: boolean | undefined;
  assuranceExitCode: number | null | undefined;
  releaseWorkflow: string | undefined;
  agriTechPartnerStatus: 'pending' | 'approved' | undefined;
  agriTechAvailableQuantityKg: number | undefined;
  agriTechRequestedQuantityKg: number | undefined;
  agriTechReservationAllowed: boolean | undefined;
  agriTechDeliveryProof: string | undefined;
  agriTechDeliveryAllowed: boolean | undefined;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(AcceptanceWorld);
