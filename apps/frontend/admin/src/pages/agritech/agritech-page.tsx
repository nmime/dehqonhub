// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-ANALYTICS-011 REQ-AGRITECH-INTEGRATION-013
import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import { UiButton, UiCard, UiForm, UiResourceError, UiSection, UiStatCard, UiTextField } from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';

function formText(form: FormData, name: string): string {
  return form.get(name) as string;
}

export function AgriTechAdminPage({
  access,
  requestOptions,
}: Readonly<{ access: AdminAccess; requestOptions?: ApiClientRequestOptions }>) {
  const { t } = useI18n();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [partners, setPartners] = useState<adminApi.PartnerViewDto[]>([]);
  const [farmers, setFarmers] = useState<adminApi.AssignedFarmerViewDto[]>([]);
  const [orders, setOrders] = useState<adminApi.AgriTechOrderSummaryViewDto[]>([]);
  const [pilots, setPilots] = useState<adminApi.PilotViewDto[]>([]);
  const [integrations, setIntegrations] = useState<adminApi.IntegrationReadinessViewDto[]>([]);
  const [analytics, setAnalytics] = useState<adminApi.AnalyticsViewDto>();
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!requestOptions) {
      return;
    }
    setState('loading');
    try {
      const [partnerData, farmerData, orderData, pilotData, integrationData, analyticsData] = await Promise.all([
        throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListPartners(requestOptions)),
        throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListFarmers(requestOptions)),
        throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListOrders(requestOptions)),
        throwOnOpenApiErrorData(adminApi.agriTechAdminControllerListPilots(requestOptions)),
        throwOnOpenApiErrorData(adminApi.agriTechAdminControllerIntegrations(requestOptions)),
        throwOnOpenApiErrorData(adminApi.agriTechAdminControllerAnalytics(requestOptions)),
      ]);
      setPartners(partnerData.items);
      setFarmers(farmerData.items);
      setOrders(orderData.items);
      setPilots(pilotData.items);
      setIntegrations(integrationData.items);
      setAnalytics(analyticsData);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [requestOptions]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (operation: () => Promise<unknown>) => {
    setNotice('');
    try {
      await operation();
      setNotice(t('admin.agritech.saved'));
      await load();
    } catch {
      setNotice(t('admin.agritech.actionError'));
    }
  };

  const createPilot = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate(() =>
      throwOnOpenApiErrorData(
        adminApi.agriTechAdminControllerCreatePilot(
          {
            name: formText(form, 'name'),
            targetFarmers: Number(form.get('targetFarmers')),
            targetSuppliers: Number(form.get('targetSuppliers')),
            startsAt: formText(form, 'startsAt'),
            endsAt: formText(form, 'endsAt'),
          },
          requestOptions as ApiClientRequestOptions,
        ),
      ),
    );
  };

  const assignFarmer = (farmerId: string, event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate(() =>
      throwOnOpenApiErrorData(
        adminApi.agriTechAdminControllerAssignFarmer(
          farmerId,
          { agentUserId: formText(form, 'agentUserId') },
          requestOptions as ApiClientRequestOptions,
        ),
      ),
    );
  };

  const scheduleDelivery = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const agentUserId = formText(form, 'agentUserId').trim();
    void mutate(() =>
      throwOnOpenApiErrorData(
        adminApi.agriTechAdminControllerScheduleDelivery(
          {
            orderId: formText(form, 'orderId'),
            ...(agentUserId ? { agentUserId } : {}),
            scheduledAt: formText(form, 'scheduledAt'),
          },
          requestOptions as ApiClientRequestOptions,
        ),
      ),
    );
  };

  const publishAdvisory = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = formText(form, 'kind') === 'weather' ? 'weather' : 'agronomy';
    void mutate(() =>
      throwOnOpenApiErrorData(
        adminApi.agriTechAdminControllerPublishAdvisory(
          {
            farmerId: formText(form, 'farmerId'),
            kind,
            source: formText(form, 'source'),
            summary: formText(form, 'summary'),
            observedAt: formText(form, 'observedAt'),
            expiresAt: formText(form, 'expiresAt'),
          },
          requestOptions as ApiClientRequestOptions,
        ),
      ),
    );
  };

  if (!requestOptions || state === 'error') {
    return (
      <UiResourceError
        action={<UiButton onClick={() => void load()}>{t('ui.runtime.retry')}</UiButton>}
        description={t('admin.agritech.loadError')}
      />
    );
  }

  return (
    <UiSection eyebrow={t('admin.agritech.eyebrow')} headingLevel={1} title={t('admin.agritech.title')}>
      <p>{t('admin.agritech.description')}</p>
      {state === 'loading' && <p role="status">{t('common.loading')}</p>}
      {notice && <p role="status">{notice}</p>}
      {state === 'ready' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {analytics && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <UiStatCard
                detail={t('admin.agritech.description')}
                label={t('admin.agritech.farmers')}
                value={String(analytics.farmers)}
              />
              <UiStatCard
                detail={t('admin.agritech.description')}
                label={t('admin.agritech.suppliers')}
                value={String(analytics.approvedSuppliers)}
              />
              <UiStatCard
                detail={t('admin.agritech.description')}
                label={t('admin.agritech.buyers')}
                value={String(analytics.approvedBuyers)}
              />
              <UiStatCard
                detail={t('admin.agritech.description')}
                label={t('admin.agritech.gmv')}
                value={`${analytics.gmvUzs.toLocaleString()} UZS`}
              />
              <UiStatCard
                detail={t('admin.agritech.description')}
                label={t('admin.agritech.delivered')}
                value={String(analytics.deliveredOrders)}
              />
              <UiStatCard
                detail={t('admin.agritech.fulfillmentDetail')}
                label={t('admin.agritech.fulfillmentRate')}
                value={`${(analytics.fulfillmentRateBasisPoints / 100).toFixed(1)}%`}
              />
              <UiStatCard
                detail={t('admin.agritech.inventoryDetail', {
                  products: analytics.activeInputProducts,
                  listings: analytics.activeProduceListings,
                })}
                label={t('admin.agritech.inventory')}
                value={`${analytics.inputStockUnits} / ${analytics.produceAvailableKg} kg`}
              />
              <UiStatCard
                detail={t('admin.agritech.retentionDetail')}
                label={t('admin.agritech.repeatBuyers')}
                value={`${analytics.repeatBuyers} · ${(analytics.repeatBuyerRateBasisPoints / 100).toFixed(1)}%`}
              />
            </div>
          )}

          <UiCard title={t('admin.agritech.partners')}>
            {partners.length === 0 && <p>{t('admin.agritech.empty')}</p>}
            {partners.map((partner) => (
              <div key={partner.id}>
                <p>
                  {partner.legalName} · {partner.kind} · {partner.status} · {partner.region}
                </p>
                {access.canApproveAgriTech && partner.status === 'pending' && (
                  <>
                    <UiButton
                      onClick={() =>
                        void mutate(() =>
                          throwOnOpenApiErrorData(
                            adminApi.agriTechAdminControllerSetPartnerStatus(
                              partner.id,
                              { status: 'approved' },
                              requestOptions,
                            ),
                          ),
                        )
                      }
                    >
                      {t('admin.agritech.approve')}
                    </UiButton>{' '}
                    <UiButton
                      variant="secondary"
                      onClick={() =>
                        void mutate(() =>
                          throwOnOpenApiErrorData(
                            adminApi.agriTechAdminControllerSetPartnerStatus(
                              partner.id,
                              { status: 'rejected' },
                              requestOptions,
                            ),
                          ),
                        )
                      }
                    >
                      {t('admin.agritech.reject')}
                    </UiButton>
                  </>
                )}
              </div>
            ))}
          </UiCard>

          <UiCard title={t('admin.agritech.farmers')}>
            {farmers.length === 0 && <p>{t('admin.agritech.empty')}</p>}
            {farmers.map((farmer) => (
              <div key={farmer.id}>
                <p>
                  {farmer.firstName} {farmer.lastName} · {farmer.region} · {farmer.status}
                </p>
                {access.canApproveAgriTech && farmer.status === 'pending_verification' && (
                  <UiButton
                    onClick={() =>
                      void mutate(() =>
                        throwOnOpenApiErrorData(
                          adminApi.agriTechAdminControllerSetFarmerStatus(
                            farmer.id,
                            { status: 'active' },
                            requestOptions,
                          ),
                        ),
                      )
                    }
                  >
                    {t('admin.agritech.verify')}
                  </UiButton>
                )}
                {access.canWriteAgriTech && (
                  <UiForm
                    onSubmit={(event) => {
                      assignFarmer(farmer.id, event);
                    }}
                  >
                    <UiTextField
                      defaultValue={farmer.fieldAgentUserId}
                      label={t('admin.agritech.agentUserId')}
                      name="agentUserId"
                      required
                    />
                    <UiButton type="submit">{t('admin.agritech.assign')}</UiButton>
                  </UiForm>
                )}
              </div>
            ))}
          </UiCard>

          <UiCard title={t('admin.agritech.fulfillment')}>
            {orders.length === 0 && <p>{t('admin.agritech.empty')}</p>}
            {orders.map((order) => (
              <p key={order.id}>
                {order.id} · {order.kind} · {order.status} · {order.totalAmountUzs.toLocaleString()} UZS ·{' '}
                {order.region}
              </p>
            ))}
            {access.canWriteAgriTech && (
              <UiForm onSubmit={scheduleDelivery}>
                <label>
                  {t('admin.agritech.orderId')}
                  <select name="orderId" required>
                    <option value="">{t('admin.agritech.selectOrder')}</option>
                    {orders
                      .filter((order) => !['delivered', 'cancelled'].includes(order.status))
                      .map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.id} · {order.kind} · {order.region}
                        </option>
                      ))}
                  </select>
                </label>
                <UiTextField label={t('admin.agritech.agentUserIdOptional')} name="agentUserId" />
                <UiTextField
                  label={t('admin.agritech.scheduledAt')}
                  name="scheduledAt"
                  required
                  type="datetime-local"
                />
                <UiButton type="submit">{t('admin.agritech.scheduleDelivery')}</UiButton>
              </UiForm>
            )}
          </UiCard>

          <UiCard title={t('admin.agritech.advisories')}>
            {access.canWriteAgriTech && (
              <UiForm onSubmit={publishAdvisory}>
                <UiTextField label={t('admin.agritech.farmerId')} name="farmerId" required />
                <label>
                  {t('admin.agritech.advisoryKind')}
                  <select name="kind" required>
                    <option value="weather">{t('admin.agritech.advisoryKind.weather')}</option>
                    <option value="agronomy">{t('admin.agritech.advisoryKind.agronomy')}</option>
                  </select>
                </label>
                <UiTextField label={t('admin.agritech.source')} name="source" required />
                <UiTextField label={t('admin.agritech.summary')} name="summary" required />
                <UiTextField label={t('admin.agritech.observedAt')} name="observedAt" required type="datetime-local" />
                <UiTextField label={t('admin.agritech.expiresAt')} name="expiresAt" required type="datetime-local" />
                <UiButton type="submit">{t('admin.agritech.publishAdvisory')}</UiButton>
              </UiForm>
            )}
          </UiCard>

          <UiCard title={t('admin.agritech.pilots')}>
            {access.canWriteAgriTech && (
              <UiForm onSubmit={createPilot}>
                <UiTextField label={t('admin.agritech.pilotName')} name="name" required />
                <UiTextField
                  label={t('admin.agritech.targetFarmers')}
                  min={1}
                  name="targetFarmers"
                  required
                  type="number"
                />
                <UiTextField
                  label={t('admin.agritech.targetSuppliers')}
                  min={1}
                  name="targetSuppliers"
                  required
                  type="number"
                />
                <UiTextField label={t('admin.agritech.startsAt')} name="startsAt" required type="datetime-local" />
                <UiTextField label={t('admin.agritech.endsAt')} name="endsAt" required type="datetime-local" />
                <UiButton type="submit">{t('admin.agritech.createPilot')}</UiButton>
              </UiForm>
            )}
            {pilots.map((pilot) => (
              <div key={pilot.id}>
                <p>
                  {pilot.name} · {pilot.status} ·{' '}
                  {t('admin.agritech.targetsActuals', {
                    targetFarmers: pilot.targetFarmers,
                    actualFarmers: pilot.actualFarmers,
                    targetSuppliers: pilot.targetSuppliers,
                    actualSuppliers: pilot.actualSuppliers,
                  })}
                </p>
                {access.canWriteAgriTech && pilot.status === 'planned' && (
                  <UiButton
                    onClick={() =>
                      void mutate(() =>
                        throwOnOpenApiErrorData(
                          adminApi.agriTechAdminControllerSetPilotStatus(
                            pilot.id,
                            { status: 'active' },
                            requestOptions,
                          ),
                        ),
                      )
                    }
                  >
                    {t('admin.agritech.activatePilot')}
                  </UiButton>
                )}
                {access.canWriteAgriTech && pilot.status === 'active' && (
                  <UiButton
                    onClick={() =>
                      void mutate(() =>
                        throwOnOpenApiErrorData(
                          adminApi.agriTechAdminControllerSetPilotStatus(
                            pilot.id,
                            { status: 'completed' },
                            requestOptions,
                          ),
                        ),
                      )
                    }
                  >
                    {t('admin.agritech.completePilot')}
                  </UiButton>
                )}
              </div>
            ))}
          </UiCard>

          <UiCard title={t('admin.agritech.integrations')}>
            {integrations.map((integration) => (
              <p key={integration.provider}>
                {integration.provider} · {integration.status}
                {integration.lastSuccessfulAt ? ` · ${integration.lastSuccessfulAt}` : ''}
                {integration.lastErrorCode ? ` · ${integration.lastErrorCode}` : ''}
              </p>
            ))}
          </UiCard>
        </div>
      )}
    </UiSection>
  );
}
