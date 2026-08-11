// @requirements REQ-AGRITECH-ADMIN-025
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess } from '../src/entities/admin-session';
import { MarketplaceAdminPage } from '../src/pages/agritech';
import { AdminLayout } from '../src/widgets/admin-shell';
import adminStyles from '../src/styles.css?inline';

const now = '2030-01-01T00:00:00.000Z';
const access = createAdminAccess({ permissions: ['admin:manage:all'], roles: ['admin'], subject: 'storybook-admin' });
const responses: Record<string, unknown> = {
  '/admin/contracts': { items: [{ id: 'contract-1', status: 'active' }] },
  '/admin/marketplace/commission-policies': {
    items: [
      { createdAt: now, rates: { produce: 200, product: 250, request: 300 }, status: 'active', version: 'rates-v1' },
    ],
  },
  '/admin/marketplace/engagement/review-reports': { items: [] },
  '/admin/marketplace/notifications': {
    items: [{ attempts: 1, createdAt: now, id: 'notice-1', simulation: true, status: 'simulated' }],
  },
  '/admin/marketplace/publications/pending': {
    listings: [{ publication: { id: 'listing-1' } }],
    requests: [],
    sellerProfiles: [],
  },
  '/admin/verifications': { items: [{ id: 'verification-1' }] },
};

const storyFetch: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  const path = new URL(request.url).pathname;
  const data = responses[path];
  if (data === undefined) {
    return Promise.resolve(
      new Response(JSON.stringify({ detail: `Unhandled story route: ${path}`, status: 501 }), {
        headers: { 'content-type': 'application/problem+json' },
        status: 501,
      }),
    );
  }
  return Promise.resolve(
    new Response(JSON.stringify({ data }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }),
  );
};

const MarketplaceOverviewComposition = () => (
  <FrontendStateProvider>
    <FrontendI18nProvider initialLocale="en" translations={adminFrontendTranslations}>
      <AdminLayout access={access} currentPath="/admin/marketplace/overview">
        <MarketplaceAdminPage
          access={access}
          requestOptions={{ baseUrl: 'https://admin.example.test', fetchImpl: storyFetch }}
          view="overview"
        />
      </AdminLayout>
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const meta = {
  title: 'Applications/Admin/Marketplace',
  component: MarketplaceOverviewComposition,
  decorators: [
    (Story) => (
      <>
        <style>{adminStyles}</style>
        <Story />
      </>
    ),
  ],
  parameters: { appComposition: true, layout: 'fullscreen' },
} satisfies Meta<typeof MarketplaceOverviewComposition>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Marketplace overview' })).toBeVisible();
    await expect(await canvas.findByText('rates-v1')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Manage feature flags' })).toHaveAttribute(
      'href',
      '/admin/settings/feature-flags',
    );
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};
