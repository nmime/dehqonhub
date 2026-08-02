// REQ-AGRITECH-WEB-006: dashboard statistics and orders are source-backed or explicitly empty.
import { useCallback, useEffect, useState } from 'react';
import { observer, useI18n } from '@app/frontend-runtime';
import {
  isApiClientError,
  throwOnOpenApiErrorData,
  useUserApiClient,
  type FarmerProfileDto,
  type OrderViewDto,
} from '@app/frontend-api-client';
import { UiButton, UiCard, UiSection, UiStatCard } from '../../../shared/ui';

export const FarmerDashboardPage = observer(function FarmerDashboardPage() {
  const { t } = useI18n();
  const { api, requestOptions } = useUserApiClient();
  const [profile, setProfile] = useState<FarmerProfileDto>();
  const [orders, setOrders] = useState<OrderViewDto[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [farmerProfile, farmerOrders] = await Promise.all([
        throwOnOpenApiErrorData(api.farmerControllerGet(requestOptions)),
        throwOnOpenApiErrorData(api.orderControllerList(requestOptions)),
      ]);
      setProfile(farmerProfile);
      setOrders(farmerOrders.items);
      setStatus('ready');
    } catch (error) {
      setStatus(isApiClientError(error) && error.status === 404 ? 'missing' : 'error');
    }
  }, [api, requestOptions]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <UiSection className="farmer-dashboard" eyebrow={t('agritech.brand')} title={t('farmer.dashboard.title')}>
      {status === 'loading' && <p role="status">{t('common.loading')}</p>}
      {status === 'error' && (
        <UiCard>
          <p role="alert">{t('farmer.dashboard.error')}</p>
          <UiButton onClick={() => void load()}>{t('ui.runtime.retry')}</UiButton>
        </UiCard>
      )}
      {status === 'missing' && (
        <UiCard>
          <p>{t('farmer.dashboard.missing')}</p>
          <UiButton href="/farmer/register">{t('farmer.register.submit')}</UiButton>
        </UiCard>
      )}
      {status === 'ready' && profile && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
            <UiStatCard
              label={t('farmer.dashboard.status')}
              value={profile.status}
              detail={`${profile.firstName} ${profile.lastName}`}
            />
            <UiStatCard
              label={t('farmer.dashboard.farmSize')}
              value={`${profile.farmSizeHectares} ha`}
              detail={profile.region}
            />
            <UiStatCard
              label={t('farmer.dashboard.orders')}
              value={String(orders.length)}
              detail={t('farmer.dashboard.ordersDetail')}
            />
          </div>
          <UiButton href="/catalog" variant="primary">
            {t('farmer.dashboard.products')}
          </UiButton>
          <h3>{t('farmer.dashboard.recentOrders')}</h3>
          {orders.length === 0 ? (
            <p role="status">{t('farmer.dashboard.emptyOrders')}</p>
          ) : (
            <UiCard>
              <table>
                <thead>
                  <tr>
                    <th>{t('order.id')}</th>
                    <th>{t('order.date')}</th>
                    <th>{t('order.amount')}</th>
                    <th>{t('order.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td>{order.totalAmountUzs.toLocaleString()} UZS</td>
                      <td>{order.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </UiCard>
          )}
        </>
      )}
    </UiSection>
  );
});
