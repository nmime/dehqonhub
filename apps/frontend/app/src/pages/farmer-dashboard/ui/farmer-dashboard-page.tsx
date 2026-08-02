import { observer, useI18n } from '@app/frontend-runtime';
import { UiButton, UiCard, UiSection, UiStatCard } from '../../../shared/ui';

const stats = [
  { label: 'Active Orders', value: '3', color: '#22c55e' },
  { label: 'Total Spent', value: '2.4M UZS', color: '#3b82f6' },
  { label: 'Farm Size', value: '2.5 ha', color: '#a855f7' },
  { label: 'Next Delivery', value: 'Aug 5', color: '#f59e0b' },
];

const quickActions = [
  { title: 'Order Inputs', description: 'Fertilizers, seeds, pesticides', href: '/catalog', icon: '🌱' },
  { title: 'My Orders', description: 'Track order status', href: '/orders', icon: '📦' },
  { title: 'Crop Advisory', description: 'AI recommendations', href: '/advisory', icon: '🤖' },
  { title: 'Weather', description: '7-day forecast', href: '/weather', icon: '🌤️' },
];

export const FarmerDashboardPage = observer(function FarmerDashboardPage() {
  const { t } = useI18n();

  return (
    <UiSection className="farmer-dashboard" eyebrow="AgroUz" title={t('farmer.dashboard.title')}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {stats.map(s => (
          <UiStatCard key={s.label} label={s.label} value={s.value} color={s.color} />
        ))}
      </div>

      <h3 style={{ color: '#f0fdf4', marginBottom: '1rem' }}>Quick Actions</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {quickActions.map(action => (
          <UiCard key={action.title}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{action.icon}</div>
            <h4 style={{ color: '#fff', marginBottom: '0.25rem' }}>{action.title}</h4>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.75rem' }}>{action.description}</p>
            <UiButton href={action.href} variant="secondary">{action.title}</UiButton>
          </UiCard>
        ))}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3 style={{ color: '#f0fdf4', marginBottom: '1rem' }}>Recent Orders</h3>
        <UiCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #166534' }}>
                {['Order', 'Date', 'Amount', 'Status'].map(h => (
                  <th key={h} style={{ padding: '0.75rem', textAlign: 'left', color: '#22c55e' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { id: '#1001', date: 'Aug 1', amount: '850,000 UZS', status: 'Processing', statusColor: '#f59e0b' },
                { id: '#1002', date: 'Jul 28', amount: '420,000 UZS', status: 'Delivered', statusColor: '#22c55e' },
                { id: '#1003', date: 'Jul 25', amount: '1,200,000 UZS', status: 'Delivered', statusColor: '#22c55e' },
              ].map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '0.75rem', color: '#e5e7eb' }}>{order.id}</td>
                  <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{order.date}</td>
                  <td style={{ padding: '0.75rem', color: '#e5e7eb' }}>{order.amount}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ background: order.statusColor + '20', color: order.statusColor,
                      padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </UiCard>
      </div>
    </UiSection>
  );
});
