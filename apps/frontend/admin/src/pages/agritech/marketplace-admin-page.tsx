// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-NOTIFICATION-022 REQ-AGRITECH-ROUTING-015
import { useCallback, useEffect, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import {
  UiButton,
  UiCard,
  UiEmptyState,
  UiForm,
  UiLoading,
  UiNotification,
  UiResourceError,
  UiSection,
  UiSelect,
  UiStatCard,
  UiStatusTag,
  UiTextareaField,
  UiTextField,
} from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import type { Translate } from '../../shared';
import { useResource, type ResourceState } from './marketplace-admin-resource';

export type MarketplaceAdminView = 'commerce' | 'engagement' | 'moderation' | 'overview';

type Notice = { message: string; tone: 'success' | 'warning' };

const idempotencyKey = (): string => `admin-${globalThis.crypto.randomUUID()}`;

const statusLabel = (t: Translate, status: string): string => {
  switch (status) {
    case 'active':
      return t('admin.marketplace.status.active');
    case 'awaiting_buyer_confirmation':
      return t('admin.marketplace.status.awaitingBuyerConfirmation');
    case 'awaiting_consents':
      return t('admin.marketplace.status.awaitingConsents');
    case 'awaiting_settlement':
      return t('admin.marketplace.status.awaitingSettlement');
    case 'approved':
      return t('admin.marketplace.status.approved');
    case 'buyer_confirmed':
      return t('admin.marketplace.status.buyerConfirmed');
    case 'buyer_repaid':
      return t('admin.marketplace.status.buyerRepaid');
    case 'cancelled':
      return t('admin.marketplace.status.cancelled');
    case 'completed':
      return t('admin.marketplace.status.completed');
    case 'closed':
      return t('admin.marketplace.status.closed');
    case 'delivered':
      return t('admin.marketplace.status.delivered');
    case 'dismissed':
      return t('admin.marketplace.status.dismissed');
    case 'disputed':
      return t('admin.marketplace.status.disputed');
    case 'failed':
      return t('admin.marketplace.status.failed');
    case 'hidden':
      return t('admin.marketplace.status.hidden');
    case 'live':
      return t('admin.marketplace.status.live');
    case 'open':
      return t('admin.marketplace.status.open');
    case 'pending':
      return t('admin.marketplace.status.pending');
    case 'in_progress':
      return t('admin.marketplace.status.inProgress');
    case 'ready':
      return t('admin.marketplace.status.ready');
    case 'ready_to_request':
      return t('admin.marketplace.status.readyToRequest');
    case 'reconciliation_required':
      return t('admin.marketplace.status.reconciliation');
    case 'rejected':
      return t('admin.marketplace.status.rejected');
    case 'resolved':
      return t('admin.marketplace.status.resolved');
    case 'retired':
      return t('admin.marketplace.status.retired');
    case 'simulated':
      return t('admin.marketplace.status.simulated');
    case 'seller_paid':
      return t('admin.marketplace.status.sellerPaid');
    case 'seller_received':
      return t('admin.marketplace.status.sellerReceived');
    case 'verified':
      return t('admin.marketplace.status.verified');
    default:
      return status.replaceAll('_', ' ');
  }
};

const settlementKindLabel = (t: Translate, kind: adminApi.ContractLifecycleDto['settlement']['kind']): string =>
  kind === 'factoring'
    ? t('admin.marketplace.commerce.settlementFactoring')
    : t('admin.marketplace.commerce.settlementDirect');

const partyLabel = (t: Translate, party: 'buyer' | 'seller'): string =>
  party === 'buyer' ? t('admin.marketplace.commerce.partyBuyer') : t('admin.marketplace.commerce.partySeller');

const disputeReasonLabel = (
  t: Translate,
  reason: NonNullable<adminApi.ContractLifecycleDto['dispute']>['reason'],
): string => {
  switch (reason) {
    case 'delivery_issue':
      return t('admin.marketplace.commerce.reasonDelivery');
    case 'quality_issue':
      return t('admin.marketplace.commerce.reasonQuality');
    case 'quantity_issue':
      return t('admin.marketplace.commerce.reasonQuantity');
    default:
      return t('admin.marketplace.commerce.reasonOther');
  }
};

const statusTone = (status: string): 'info' | 'success' | 'warning' => {
  if (['active', 'approved', 'completed', 'delivered', 'live', 'resolved', 'verified'].includes(status)) {
    return 'success';
  }
  if (['failed', 'reconciliation_required', 'rejected'].includes(status)) {
    return 'warning';
  }
  if (['open', 'pending', 'simulated'].includes(status)) {
    return 'warning';
  }
  return 'info';
};

const ResourceFrame = ({
  children,
  onRetry,
  state,
  t,
}: Readonly<{
  children: ReactNode;
  onRetry: () => void;
  state: ResourceState<unknown>;
  t: Translate;
}>) => {
  if (state.status === 'loading') {
    return <UiLoading label={t('admin.marketplace.common.loading')} />;
  }
  if (state.status === 'error') {
    return (
      <UiResourceError
        action={
          <UiButton onClick={onRetry} variant="secondary">
            {t('admin.marketplace.common.retry')}
          </UiButton>
        }
        description={t('admin.marketplace.common.errorDescription')}
        title={t('admin.marketplace.common.errorTitle')}
      />
    );
  }
  return <>{children}</>;
};

function useAdminCommand(reload: () => void, t: Translate) {
  const keys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice>();

  const run = useCallback(
    async (identity: string, operation: (key: string) => Promise<unknown>) => {
      const key = keys.current.get(identity) ?? idempotencyKey();
      keys.current.set(identity, key);
      setBusy(identity);
      setNotice(undefined);
      try {
        await operation(key);
        keys.current.delete(identity);
        setNotice({ message: t('admin.marketplace.common.saved'), tone: 'success' });
        reload();
      } catch (error) {
        const response = (error as { response?: Response }).response;
        if (response?.status === 409) {
          reload();
        }
        setNotice({
          message:
            response?.status === 409
              ? t('admin.marketplace.common.conflict')
              : t('admin.marketplace.common.actionError'),
          tone: 'warning',
        });
      } finally {
        setBusy('');
      }
    },
    [reload, t],
  );

  return { busy, notice, run };
}

const EmptyQueue = ({ t }: Readonly<{ t: Translate }>) => (
  <UiEmptyState
    description={t('admin.marketplace.common.emptyDescription')}
    title={t('admin.marketplace.common.empty')}
  />
);

function MarketplaceOverview({
  access,
  requestOptions,
}: Readonly<{ access: AdminAccess; requestOptions: ApiClientRequestOptions }>) {
  const { t } = useI18n();
  const loader = useCallback(async () => {
    const [verifications, moderation, contracts, notifications, policies, reports] = await Promise.all([
      throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListVerifications(requestOptions)),
      throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListPendingMarketplacePublications(requestOptions)),
      throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListContracts(requestOptions)),
      throwOnOpenApiErrorData(adminApi.marketplaceContractNotificationAdminControllerList(requestOptions)),
      throwOnOpenApiErrorData(
        adminApi.marketplaceContractLifecycleAdminControllerListCommissionPolicies(requestOptions),
      ),
      throwOnOpenApiErrorData(adminApi.marketplaceEngagementAdminControllerListReviewReports(requestOptions)),
    ]);
    return { contracts, moderation, notifications, policies, reports, verifications };
  }, [requestOptions]);
  const [state, reload] = useResource(loader);

  const data = state.status === 'ready' ? state.data : undefined;
  const pendingPublications = data
    ? data.moderation.sellerProfiles.length + data.moderation.listings.length + data.moderation.requests.length
    : 0;
  const openContracts = data?.contracts.items.filter(
    (contract) => !['cancelled', 'completed'].includes(contract.status),
  );
  const attentionNotifications = data?.notifications.items.filter((item) =>
    ['failed', 'reconciliation_required'].includes(item.status),
  );

  return (
    <UiSection
      className="admin-page admin-marketplace-page"
      eyebrow={t('admin.marketplace.overview.eyebrow')}
      headingLevel={1}
      title={t('admin.marketplace.overview.title')}
    >
      <p className="admin-page-description">{t('admin.marketplace.overview.description')}</p>
      <ResourceFrame onRetry={reload} state={state} t={t}>
        <div className="admin-stat-grid admin-marketplace-stat-grid">
          <UiStatCard
            className="admin-stat-card"
            detail={t('admin.marketplace.overview.verificationsDetail')}
            label={t('admin.marketplace.overview.verifications')}
            value={`${data?.verifications.items.filter((item) => item.status === 'pending').length ?? 0}`}
          />
          <UiStatCard
            className="admin-stat-card"
            detail={t('admin.marketplace.overview.publicationsDetail')}
            label={t('admin.marketplace.overview.publications')}
            value={`${pendingPublications}`}
          />
          <UiStatCard
            className="admin-stat-card"
            detail={t('admin.marketplace.overview.contractsDetail')}
            label={t('admin.marketplace.overview.contracts')}
            value={`${openContracts?.length ?? 0}`}
          />
          <UiStatCard
            className="admin-stat-card"
            detail={t('admin.marketplace.overview.notificationsDetail')}
            label={t('admin.marketplace.overview.notifications')}
            value={`${attentionNotifications?.length ?? 0}`}
          />
          <UiStatCard
            className="admin-stat-card"
            detail={t('admin.marketplace.overview.reportsDetail')}
            label={t('admin.marketplace.overview.reports')}
            value={`${data?.reports.items.length ?? 0}`}
          />
          <UiStatCard
            className="admin-stat-card"
            detail={t('admin.marketplace.overview.policyDetail')}
            label={t('admin.marketplace.overview.policy')}
            value={data?.policies.items.find((policy) => policy.status === 'active')?.version ?? '—'}
          />
        </div>
        <div className="admin-marketplace-link-grid">
          <UiCard title={t('admin.marketplace.nav.moderation')}>
            <p>{t('admin.marketplace.overview.moderationAction')}</p>
            <UiButton href="/admin/marketplace/moderation">{t('admin.marketplace.common.open')}</UiButton>
          </UiCard>
          <UiCard title={t('admin.marketplace.nav.commerce')}>
            <p>{t('admin.marketplace.overview.commerceAction')}</p>
            <UiButton href="/admin/marketplace/commerce">{t('admin.marketplace.common.open')}</UiButton>
          </UiCard>
          <UiCard title={t('admin.marketplace.nav.engagement')}>
            <p>{t('admin.marketplace.overview.engagementAction')}</p>
            <UiButton href="/admin/marketplace/engagement">{t('admin.marketplace.common.open')}</UiButton>
          </UiCard>
          {access.canReadFeatureFlags ? (
            <UiCard title={t('admin.marketplace.overview.demoGovernance')}>
              <p>{t('admin.marketplace.overview.demoGovernanceDetail')}</p>
              <UiButton href="/admin/settings/feature-flags" variant="secondary">
                {t('admin.marketplace.overview.featureFlags')}
              </UiButton>
            </UiCard>
          ) : null}
        </div>
      </ResourceFrame>
    </UiSection>
  );
}

function VerificationItem({
  access,
  item,
  mutation,
  requestOptions,
  t,
}: Readonly<{
  access: AdminAccess;
  item: adminApi.AdminVerificationViewDto;
  mutation: ReturnType<typeof useAdminCommand>;
  requestOptions: ApiClientRequestOptions;
  t: Translate;
}>) {
  const [reason, setReason] = useState<'criteria_not_met' | 'documents_unreadable' | 'identity_mismatch'>(
    'documents_unreadable',
  );
  const approveIdentity = `verify:${item.id}:${item.revision}:approved`;
  const rejectIdentity = `verify:${item.id}:${item.revision}:rejected:${reason}`;

  return (
    <article className="admin-marketplace-queue-item">
      <div className="admin-marketplace-queue-heading">
        <div>
          <strong>{item.role}</strong>
          <span>{item.userId}</span>
        </div>
        <UiStatusTag label={statusLabel(t, item.status)} tone={statusTone(item.status)} />
      </div>
      <dl className="admin-marketplace-meta">
        <div>
          <dt>{t('admin.marketplace.moderation.revision')}</dt>
          <dd>{item.revision}</dd>
        </div>
        <div>
          <dt>{t('admin.marketplace.moderation.provider')}</dt>
          <dd>{item.providerName ?? item.providerMode}</dd>
        </div>
        <div>
          <dt>{t('admin.marketplace.moderation.documents')}</dt>
          <dd>{item.documents.length}</dd>
        </div>
      </dl>
      {item.simulation ? <UiNotification message={t('admin.marketplace.common.simulation')} tone="warning" /> : null}
      {access.canApproveAgriTech && item.status === 'pending' ? (
        <div className="admin-marketplace-actions">
          <UiSelect
            label={t('admin.marketplace.moderation.rejectionReason')}
            onValueChange={(value) => {
              setReason(value as typeof reason);
            }}
            options={[
              { label: t('admin.marketplace.moderation.reason.criteria'), value: 'criteria_not_met' },
              { label: t('admin.marketplace.moderation.reason.documents'), value: 'documents_unreadable' },
              { label: t('admin.marketplace.moderation.reason.identity'), value: 'identity_mismatch' },
            ]}
            value={reason}
          />
          <UiButton
            disabled={mutation.busy === approveIdentity}
            onClick={() => {
              void mutation.run(approveIdentity, (key) =>
                throwOnOpenApiErrorData(
                  adminApi.agriTechAdminControllerReviewVerification(
                    item.id,
                    { decision: 'verified', expectedRevision: item.revision },
                    key,
                    requestOptions,
                  ),
                ),
              );
            }}
          >
            {t('admin.agritech.approve')}
          </UiButton>
          <UiButton
            disabled={mutation.busy === rejectIdentity}
            onClick={() => {
              void mutation.run(rejectIdentity, (key) =>
                throwOnOpenApiErrorData(
                  adminApi.agriTechAdminControllerReviewVerification(
                    item.id,
                    { decision: 'rejected', expectedRevision: item.revision, reason },
                    key,
                    requestOptions,
                  ),
                ),
              );
            }}
            variant="secondary"
          >
            {t('admin.agritech.reject')}
          </UiButton>
        </div>
      ) : null}
    </article>
  );
}

function PublicationActions({
  access,
  approve,
  busy,
  reject,
  t,
}: Readonly<{
  access: AdminAccess;
  approve: () => void;
  busy: boolean;
  reject: () => void;
  t: Translate;
}>) {
  return access.canApproveAgriTech ? (
    <div className="admin-marketplace-actions">
      <UiButton disabled={busy} onClick={approve}>
        {t('admin.agritech.approve')}
      </UiButton>
      <UiButton disabled={busy} onClick={reject} variant="secondary">
        {t('admin.agritech.reject')}
      </UiButton>
    </div>
  ) : null;
}

function MarketplaceModeration({
  access,
  requestOptions,
}: Readonly<{ access: AdminAccess; requestOptions: ApiClientRequestOptions }>) {
  const { t } = useI18n();
  const loader = useCallback(async () => {
    const [verifications, publications] = await Promise.all([
      throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListVerifications(requestOptions)),
      throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListPendingMarketplacePublications(requestOptions)),
    ]);
    return { publications, verifications };
  }, [requestOptions]);
  const [state, reload] = useResource(loader);
  const mutation = useAdminCommand(reload, t);
  const data = state.status === 'ready' ? state.data : undefined;

  const reviewSeller = (
    item: adminApi.MarketplaceSellerProfileModerationItemDto,
    decision: 'approved' | 'rejected',
  ) => {
    const identity = `seller:${item.sellerPublicId}:${item.contentRevision}:${decision}`;
    void mutation.run(identity, (key) =>
      throwOnOpenApiErrorData(
        adminApi.agriTechAdminControllerReviewMarketplaceSellerProfile(
          item.sellerPublicId,
          {
            decision,
            expectedContentFingerprint: item.contentFingerprint,
            expectedContentRevision: item.contentRevision,
          },
          key,
          requestOptions,
        ),
      ),
    );
  };

  const reviewListing = (item: adminApi.MarketplaceListingModerationItemDto, decision: 'approved' | 'rejected') => {
    const identity = `listing:${item.publication.id}:${item.publication.revision}:${decision}`;
    void mutation.run(identity, (key) =>
      throwOnOpenApiErrorData(
        adminApi.agriTechAdminControllerReviewMarketplaceListingPublication(
          item.publication.id,
          {
            decision,
            expectedRevision: item.publication.revision,
            expectedSellerContentFingerprint: item.seller.contentFingerprint,
            expectedSellerContentRevision: item.seller.contentRevision,
          },
          key,
          requestOptions,
        ),
      ),
    );
  };

  const reviewRequest = (item: adminApi.MarketplaceRequestModerationItemDto, decision: 'approved' | 'rejected') => {
    const identity = `request:${item.publication.id}:${item.publication.revision}:${decision}`;
    void mutation.run(identity, (key) =>
      throwOnOpenApiErrorData(
        adminApi.agriTechAdminControllerReviewMarketplaceRequestPublication(
          item.publication.id,
          { decision, expectedRevision: item.publication.revision },
          key,
          requestOptions,
        ),
      ),
    );
  };

  const queueSize = data
    ? data.verifications.items.filter((item) => item.status === 'pending').length +
      data.publications.sellerProfiles.length +
      data.publications.listings.length +
      data.publications.requests.length
    : 0;

  return (
    <UiSection
      className="admin-page admin-marketplace-page"
      eyebrow={t('admin.marketplace.moderation.eyebrow')}
      headingLevel={1}
      title={t('admin.marketplace.moderation.title')}
    >
      <p className="admin-page-description">{t('admin.marketplace.moderation.description')}</p>
      {mutation.notice ? <UiNotification message={mutation.notice.message} tone={mutation.notice.tone} /> : null}
      <ResourceFrame onRetry={reload} state={state} t={t}>
        {queueSize === 0 ? <EmptyQueue t={t} /> : null}
        {data?.verifications.items.some((item) => item.status === 'pending') ? (
          <UiCard title={t('admin.marketplace.moderation.verifications')}>
            <div className="admin-marketplace-queue">
              {data.verifications.items
                .filter((item) => item.status === 'pending')
                .map((item) => (
                  <VerificationItem
                    access={access}
                    item={item}
                    key={item.id}
                    mutation={mutation}
                    requestOptions={requestOptions}
                    t={t}
                  />
                ))}
            </div>
          </UiCard>
        ) : null}
        {data?.publications.sellerProfiles.length ? (
          <UiCard title={t('admin.marketplace.moderation.sellers')}>
            <div className="admin-marketplace-queue">
              {data.publications.sellerProfiles.map((item) => (
                <article className="admin-marketplace-queue-item" key={item.sellerPublicId}>
                  <div className="admin-marketplace-queue-heading">
                    <div>
                      <strong>{item.displayName}</strong>
                      <span>{item.region}</span>
                    </div>
                    <UiStatusTag
                      label={statusLabel(t, item.moderationStatus)}
                      tone={statusTone(item.moderationStatus)}
                    />
                  </div>
                  {item.description ? <p>{item.description}</p> : null}
                  <PublicationActions
                    access={access}
                    approve={() => {
                      reviewSeller(item, 'approved');
                    }}
                    busy={mutation.busy.startsWith(`seller:${item.sellerPublicId}:`)}
                    reject={() => {
                      reviewSeller(item, 'rejected');
                    }}
                    t={t}
                  />
                </article>
              ))}
            </div>
          </UiCard>
        ) : null}
        {data?.publications.listings.length ? (
          <UiCard title={t('admin.marketplace.moderation.listings')}>
            <div className="admin-marketplace-queue">
              {data.publications.listings.map((item) => (
                <article className="admin-marketplace-queue-item" key={item.publication.id}>
                  <div className="admin-marketplace-queue-heading">
                    <div>
                      <strong>{item.content.title}</strong>
                      <span>{`${item.seller.displayName} · ${item.content.region}`}</span>
                    </div>
                    <UiStatusTag
                      label={statusLabel(t, item.publication.moderationStatus)}
                      tone={statusTone(item.publication.moderationStatus)}
                    />
                  </div>
                  <p>{item.content.description ?? `${item.content.unit} · ${item.publication.section}`}</p>
                  <PublicationActions
                    access={access}
                    approve={() => {
                      reviewListing(item, 'approved');
                    }}
                    busy={mutation.busy.startsWith(`listing:${item.publication.id}:`)}
                    reject={() => {
                      reviewListing(item, 'rejected');
                    }}
                    t={t}
                  />
                </article>
              ))}
            </div>
          </UiCard>
        ) : null}
        {data?.publications.requests.length ? (
          <UiCard title={t('admin.marketplace.moderation.requests')}>
            <div className="admin-marketplace-queue">
              {data.publications.requests.map((item) => (
                <article className="admin-marketplace-queue-item" key={item.publication.id}>
                  <div className="admin-marketplace-queue-heading">
                    <div>
                      <strong>{item.content.title}</strong>
                      <span>{`${item.content.buyerDisplayName} · ${item.content.region}`}</span>
                    </div>
                    <UiStatusTag
                      label={statusLabel(t, item.publication.moderationStatus)}
                      tone={statusTone(item.publication.moderationStatus)}
                    />
                  </div>
                  <p>{item.content.requirements ?? item.content.volume ?? '—'}</p>
                  <PublicationActions
                    access={access}
                    approve={() => {
                      reviewRequest(item, 'approved');
                    }}
                    busy={mutation.busy.startsWith(`request:${item.publication.id}:`)}
                    reject={() => {
                      reviewRequest(item, 'rejected');
                    }}
                    t={t}
                  />
                </article>
              ))}
            </div>
          </UiCard>
        ) : null}
      </ResourceFrame>
    </UiSection>
  );
}

function ContractLifecyclePanel({
  access,
  contract,
  lifecycle,
  mutation,
  requestOptions,
  t,
}: Readonly<{
  access: AdminAccess;
  contract: adminApi.ContractViewDto;
  lifecycle: adminApi.ContractLifecycleDto;
  mutation: ReturnType<typeof useAdminCommand>;
  requestOptions: ApiClientRequestOptions;
  t: Translate;
}>) {
  const [decision, setDecision] = useState<'dismissed' | 'upheld_cancelled'>('dismissed');
  const [note, setNote] = useState('');
  const evidenceRevision = Math.max(0, ...lifecycle.disputeEvidence.map((item) => item.revision));
  const identity = `dispute:${contract.id}:${decision}:${evidenceRevision}:${note}`;

  return (
    <UiCard className="admin-marketplace-lifecycle" title={t('admin.marketplace.commerce.lifecycle')}>
      <div className="admin-marketplace-queue-heading">
        <div>
          <strong>{contract.subject}</strong>
          <span>{contract.id}</span>
        </div>
        <UiStatusTag label={statusLabel(t, contract.status)} tone={statusTone(contract.status)} />
      </div>
      <dl className="admin-marketplace-meta admin-marketplace-meta--wide">
        <div>
          <dt>{t('admin.marketplace.commerce.fulfillment')}</dt>
          <dd>{statusLabel(t, lifecycle.fulfillment.status)}</dd>
        </div>
        <div>
          <dt>{t('admin.marketplace.commerce.settlement')}</dt>
          <dd>{`${settlementKindLabel(t, lifecycle.settlement.kind)} · ${statusLabel(t, lifecycle.settlement.status)}`}</dd>
        </div>
        <div>
          <dt>{t('admin.marketplace.commerce.signatures')}</dt>
          <dd>{lifecycle.signatures.length}</dd>
        </div>
        <div>
          <dt>{t('admin.marketplace.commerce.timeline')}</dt>
          <dd>{lifecycle.timeline.length}</dd>
        </div>
      </dl>
      {lifecycle.settlement.simulation || lifecycle.disputeEvidence.some((item) => item.simulation) ? (
        <UiNotification message={t('admin.marketplace.common.simulation')} tone="warning" />
      ) : null}
      {lifecycle.dispute ? (
        <div className="admin-marketplace-dispute">
          <div className="admin-marketplace-queue-heading">
            <strong>{t('admin.marketplace.commerce.dispute')}</strong>
            <UiStatusTag label={statusLabel(t, lifecycle.dispute.status)} tone={statusTone(lifecycle.dispute.status)} />
          </div>
          <p>{`${disputeReasonLabel(t, lifecycle.dispute.reason)} · ${partyLabel(t, lifecycle.dispute.openedByParty)}`}</p>
          <ul className="admin-marketplace-evidence">
            {lifecycle.disputeEvidence.map((item) => (
              <li key={item.id}>
                <strong>{item.fileName}</strong>
                <span>{`${item.mediaType} · r${item.revision}`}</span>
                {item.simulation ? (
                  <UiStatusTag label={t('admin.marketplace.status.simulated')} tone="warning" />
                ) : null}
              </li>
            ))}
          </ul>
          {access.canApproveAgriTech && lifecycle.dispute.status === 'open' && evidenceRevision > 0 ? (
            <UiForm
              className="admin-marketplace-form"
              onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
                event.preventDefault();
                void mutation.run(identity, (key) =>
                  throwOnOpenApiErrorData(
                    adminApi.marketplaceContractLifecycleAdminControllerResolveDispute(
                      contract.id,
                      {
                        decision,
                        evidenceIds: lifecycle.disputeEvidence
                          .filter((item) => item.revision === evidenceRevision)
                          .map((item) => item.id),
                        evidenceRevision,
                        outcomeNote: note,
                      },
                      key,
                      requestOptions,
                    ),
                  ),
                );
              }}
            >
              <UiSelect
                label={t('admin.marketplace.commerce.decision')}
                onValueChange={(value) => {
                  setDecision(value as typeof decision);
                }}
                options={[
                  { label: t('admin.marketplace.commerce.dismiss'), value: 'dismissed' },
                  { label: t('admin.marketplace.commerce.uphold'), value: 'upheld_cancelled' },
                ]}
                value={decision}
              />
              <UiTextareaField
                label={t('admin.marketplace.commerce.outcomeNote')}
                maxLength={1000}
                onChange={(event) => {
                  setNote(event.currentTarget.value);
                }}
                required
                value={note}
              />
              <UiButton disabled={!note.trim() || mutation.busy === identity} type="submit">
                {t('admin.marketplace.commerce.resolve')}
              </UiButton>
            </UiForm>
          ) : null}
        </div>
      ) : (
        <p>{t('admin.marketplace.commerce.noDispute')}</p>
      )}
    </UiCard>
  );
}

function MarketplaceCommerce({
  access,
  requestOptions,
}: Readonly<{ access: AdminAccess; requestOptions: ApiClientRequestOptions }>) {
  const { t } = useI18n();
  const [selectedContractId, setSelectedContractId] = useState('');
  const [lifecycle, setLifecycle] = useState<ResourceState<adminApi.ContractLifecycleDto>>({ status: 'loading' });
  const loader = useCallback(async () => {
    const [contracts, policies] = await Promise.all([
      throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListContracts(requestOptions)),
      throwOnOpenApiErrorData(
        adminApi.marketplaceContractLifecycleAdminControllerListCommissionPolicies(requestOptions),
      ),
    ]);
    return { contracts, policies };
  }, [requestOptions]);
  const [state, reload] = useResource(loader);
  const mutation = useAdminCommand(reload, t);
  const [policyVersion, setPolicyVersion] = useState('marketplace-v1');
  const [productRate, setProductRate] = useState('250');
  const [produceRate, setProduceRate] = useState('250');
  const [requestRate, setRequestRate] = useState('250');
  const data = state.status === 'ready' ? state.data : undefined;
  const selectedContract = data?.contracts.items.find((contract) => contract.id === selectedContractId);

  const loadLifecycle = useCallback(
    (contractId: string) => {
      setSelectedContractId(contractId);
      setLifecycle({ status: 'loading' });
      void throwOnOpenApiErrorData(
        adminApi.marketplaceContractLifecycleAdminControllerGetContractLifecycle(contractId, requestOptions),
      )
        .then((value) => {
          setLifecycle({ data: value, status: 'ready' });
        })
        .catch(() => {
          setLifecycle({ status: 'error' });
        });
    },
    [requestOptions],
  );

  return (
    <UiSection
      className="admin-page admin-marketplace-page"
      eyebrow={t('admin.marketplace.commerce.eyebrow')}
      headingLevel={1}
      title={t('admin.marketplace.commerce.title')}
    >
      <p className="admin-page-description">{t('admin.marketplace.commerce.description')}</p>
      {mutation.notice ? <UiNotification message={mutation.notice.message} tone={mutation.notice.tone} /> : null}
      <ResourceFrame onRetry={reload} state={state} t={t}>
        <div className="admin-marketplace-commerce-grid">
          <UiCard title={t('admin.marketplace.commerce.contracts')}>
            {data?.contracts.items.length ? (
              <div className="admin-marketplace-queue">
                {data.contracts.items.map((contract) => (
                  <article className="admin-marketplace-queue-item" key={contract.id}>
                    <div className="admin-marketplace-queue-heading">
                      <div>
                        <strong>{contract.subject}</strong>
                        <span>{`${contract.amountUzs.toLocaleString()} UZS · r${contract.revision}`}</span>
                      </div>
                      <UiStatusTag label={statusLabel(t, contract.status)} tone={statusTone(contract.status)} />
                    </div>
                    <UiButton
                      onClick={() => {
                        loadLifecycle(contract.id);
                      }}
                      variant="secondary"
                    >
                      {t('admin.marketplace.commerce.inspect')}
                    </UiButton>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyQueue t={t} />
            )}
          </UiCard>
          <UiCard title={t('admin.marketplace.commerce.policies')}>
            <div className="admin-marketplace-policy-list">
              {data?.policies.items.map((policy) => (
                <div className="admin-marketplace-policy" key={policy.version}>
                  <div>
                    <strong>{policy.version}</strong>
                    <span>{`${policy.rates.product}/${policy.rates.produce}/${policy.rates.request} bp`}</span>
                  </div>
                  <UiStatusTag label={statusLabel(t, policy.status)} tone={statusTone(policy.status)} />
                </div>
              ))}
            </div>
            {access.canWriteAgriTech ? (
              <UiForm
                className="admin-marketplace-form"
                onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const body = {
                    rates: {
                      produce: Number(produceRate),
                      product: Number(productRate),
                      request: Number(requestRate),
                    },
                    version: policyVersion,
                  };
                  const identity = `policy:${JSON.stringify(body)}`;
                  void mutation.run(identity, (key) =>
                    throwOnOpenApiErrorData(
                      adminApi.marketplaceContractLifecycleAdminControllerActivateCommissionPolicy(
                        body,
                        key,
                        requestOptions,
                      ),
                    ),
                  );
                }}
              >
                <UiTextField
                  label={t('admin.marketplace.commerce.policyVersion')}
                  onChange={(event) => {
                    setPolicyVersion(event.currentTarget.value);
                  }}
                  required
                  value={policyVersion}
                />
                <div className="admin-marketplace-rate-grid">
                  <UiTextField
                    label={t('admin.marketplace.commerce.productRate')}
                    max={1000}
                    min={0}
                    onChange={(event) => {
                      setProductRate(event.currentTarget.value);
                    }}
                    type="number"
                    value={productRate}
                  />
                  <UiTextField
                    label={t('admin.marketplace.commerce.produceRate')}
                    max={1000}
                    min={0}
                    onChange={(event) => {
                      setProduceRate(event.currentTarget.value);
                    }}
                    type="number"
                    value={produceRate}
                  />
                  <UiTextField
                    label={t('admin.marketplace.commerce.requestRate')}
                    max={1000}
                    min={0}
                    onChange={(event) => {
                      setRequestRate(event.currentTarget.value);
                    }}
                    type="number"
                    value={requestRate}
                  />
                </div>
                <UiButton type="submit">{t('admin.marketplace.commerce.activatePolicy')}</UiButton>
              </UiForm>
            ) : null}
          </UiCard>
        </div>
        {selectedContract ? (
          <ResourceFrame
            onRetry={() => {
              loadLifecycle(selectedContract.id);
            }}
            state={lifecycle}
            t={t}
          >
            {lifecycle.status === 'ready' ? (
              <ContractLifecyclePanel
                access={access}
                contract={selectedContract}
                lifecycle={lifecycle.data}
                mutation={mutation}
                requestOptions={requestOptions}
                t={t}
              />
            ) : null}
          </ResourceFrame>
        ) : null}
      </ResourceFrame>
    </UiSection>
  );
}

function ReviewReportItem({
  access,
  item,
  mutation,
  requestOptions,
  t,
}: Readonly<{
  access: AdminAccess;
  item: adminApi.MarketplaceReviewModerationItemDto;
  mutation: ReturnType<typeof useAdminCommand>;
  requestOptions: ApiClientRequestOptions;
  t: Translate;
}>) {
  const moderate = (decision: 'dismissed' | 'hidden') => {
    const identity = `review:${item.reportId}:${item.expectedRevision}:${decision}`;
    void mutation.run(identity, (key) =>
      throwOnOpenApiErrorData(
        adminApi.marketplaceEngagementAdminControllerModerateReviewReport(
          item.reportId,
          { decision, expectedRevision: item.expectedRevision },
          key,
          requestOptions,
        ),
      ),
    );
  };

  return (
    <article className="admin-marketplace-queue-item">
      <div className="admin-marketplace-queue-heading">
        <div>
          <strong>{`${item.review.rating}/5 · ${item.reason}`}</strong>
          <span>{item.review.comment}</span>
        </div>
        <UiStatusTag label={`r${item.expectedRevision}`} tone="info" />
      </div>
      {item.reportComment ? <p>{item.reportComment}</p> : null}
      {access.canApproveAgriTech ? (
        <div className="admin-marketplace-actions">
          <UiButton
            disabled={mutation.busy.startsWith(`review:${item.reportId}:`)}
            onClick={() => {
              moderate('dismissed');
            }}
          >
            {t('admin.marketplace.engagement.dismissReport')}
          </UiButton>
          <UiButton
            disabled={mutation.busy.startsWith(`review:${item.reportId}:`)}
            onClick={() => {
              moderate('hidden');
            }}
            variant="secondary"
          >
            {t('admin.marketplace.engagement.hideReview')}
          </UiButton>
        </div>
      ) : null}
    </article>
  );
}

function MarketplaceEngagement({
  access,
  requestOptions,
}: Readonly<{ access: AdminAccess; requestOptions: ApiClientRequestOptions }>) {
  const { t } = useI18n();
  const loader = useCallback(async () => {
    const [policy, reports, notifications] = await Promise.all([
      throwOnOpenApiErrorData(adminApi.marketplaceEngagementAdminControllerGetSamplePolicy(requestOptions)),
      throwOnOpenApiErrorData(adminApi.marketplaceEngagementAdminControllerListReviewReports(requestOptions)),
      throwOnOpenApiErrorData(adminApi.marketplaceContractNotificationAdminControllerList(requestOptions)),
    ]);
    return { notifications, policy, reports };
  }, [requestOptions]);
  const [state, reload] = useResource(loader);
  const mutation = useAdminCommand(reload, t);
  const data = state.status === 'ready' ? state.data : undefined;
  const [monthlyLimit, setMonthlyLimit] = useState('5');

  useEffect(() => {
    if (data?.policy.monthlyLimit) {
      setMonthlyLimit(`${data.policy.monthlyLimit}`);
    }
  }, [data?.policy.monthlyLimit]);

  return (
    <UiSection
      className="admin-page admin-marketplace-page"
      eyebrow={t('admin.marketplace.engagement.eyebrow')}
      headingLevel={1}
      title={t('admin.marketplace.engagement.title')}
    >
      <p className="admin-page-description">{t('admin.marketplace.engagement.description')}</p>
      {mutation.notice ? <UiNotification message={mutation.notice.message} tone={mutation.notice.tone} /> : null}
      <ResourceFrame onRetry={reload} state={state} t={t}>
        <div className="admin-marketplace-engagement-grid">
          <UiCard title={t('admin.marketplace.engagement.samplePolicy')}>
            <dl className="admin-marketplace-meta">
              <div>
                <dt>{t('admin.marketplace.engagement.version')}</dt>
                <dd>{data?.policy.version ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('admin.marketplace.engagement.monthlyLimit')}</dt>
                <dd>{data?.policy.monthlyLimit ?? '—'}</dd>
              </div>
            </dl>
            {access.canWriteAgriTech && data ? (
              <UiForm
                className="admin-marketplace-form"
                onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const body = { expectedVersion: data.policy.version, monthlyLimit: Number(monthlyLimit) };
                  const identity = `sample-policy:${body.expectedVersion}:${body.monthlyLimit}`;
                  void mutation.run(identity, (key) =>
                    throwOnOpenApiErrorData(
                      adminApi.marketplaceEngagementAdminControllerActivateSamplePolicy(body, key, requestOptions),
                    ),
                  );
                }}
              >
                <UiTextField
                  label={t('admin.marketplace.engagement.monthlyLimit')}
                  max={100}
                  min={1}
                  onChange={(event) => {
                    setMonthlyLimit(event.currentTarget.value);
                  }}
                  type="number"
                  value={monthlyLimit}
                />
                <UiButton type="submit">{t('admin.marketplace.engagement.activatePolicy')}</UiButton>
              </UiForm>
            ) : null}
          </UiCard>
          <UiCard title={t('admin.marketplace.engagement.reviewReports')}>
            {data?.reports.items.length ? (
              <div className="admin-marketplace-queue">
                {data.reports.items.map((item) => (
                  <ReviewReportItem
                    access={access}
                    item={item}
                    key={item.reportId}
                    mutation={mutation}
                    requestOptions={requestOptions}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <EmptyQueue t={t} />
            )}
          </UiCard>
        </div>
        <UiCard title={t('admin.marketplace.engagement.notifications')}>
          {data?.notifications.items.length ? (
            <div className="admin-marketplace-notifications">
              {data.notifications.items.map((item) => (
                <article className="admin-marketplace-notification" key={item.id}>
                  <div className="admin-marketplace-queue-heading">
                    <div>
                      <strong>{item.event}</strong>
                      <span>{`${item.recipientParty} · ${item.deliveryChannel} · ${item.recipientLocale}`}</span>
                    </div>
                    <UiStatusTag label={statusLabel(t, item.status)} tone={statusTone(item.status)} />
                  </div>
                  <p>{item.message}</p>
                  <small>{`${t('admin.marketplace.engagement.attempts')}: ${item.attempts}`}</small>
                  {item.simulation ? (
                    <UiNotification message={t('admin.marketplace.common.simulation')} tone="warning" />
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyQueue t={t} />
          )}
        </UiCard>
      </ResourceFrame>
    </UiSection>
  );
}

export function MarketplaceAdminPage({
  access,
  requestOptions,
  view,
}: Readonly<{
  access: AdminAccess;
  requestOptions?: ApiClientRequestOptions;
  view: MarketplaceAdminView;
}>) {
  const { t } = useI18n();
  if (!requestOptions) {
    return (
      <UiSection
        className="admin-page admin-marketplace-page"
        eyebrow={t('admin.marketplace.overview.eyebrow')}
        headingLevel={1}
        title={t('admin.marketplace.overview.title')}
      >
        <UiResourceError
          description={t('admin.marketplace.common.errorDescription')}
          title={t('admin.marketplace.common.errorTitle')}
        />
      </UiSection>
    );
  }

  switch (view) {
    case 'commerce':
      return <MarketplaceCommerce access={access} requestOptions={requestOptions} />;
    case 'engagement':
      return <MarketplaceEngagement access={access} requestOptions={requestOptions} />;
    case 'moderation':
      return <MarketplaceModeration access={access} requestOptions={requestOptions} />;
    default:
      return <MarketplaceOverview access={access} requestOptions={requestOptions} />;
  }
}
