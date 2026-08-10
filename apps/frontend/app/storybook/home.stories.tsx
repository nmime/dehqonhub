import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { ApiClientProvider } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { createUserRouter } from '../src/app/router/user-route-tree';
import userStyles from '../src/styles.css?inline';

const catalogProducts = [
  {
    category: 'seed',
    createdAt: '2026-08-09T10:00:00.000Z',
    description: 'Certified drought-resistant corn seed for field production.',
    id: '65cb7c88-6b04-40d5-8443-f2d8de152119',
    images: [],
    name: 'Samarqand corn seed',
    priceUzs: 4_080_000,
    region: 'Samarqand',
    status: 'active',
    stockQuantity: 18,
    supplierId: '5e64471f-7444-4b69-a28d-6d4cb8f59de0',
    supplierName: 'Zarafshon Agro',
    unit: 't',
    updatedAt: '2026-08-09T10:00:00.000Z',
  },
  {
    category: 'seed',
    createdAt: '2026-08-09T10:00:00.000Z',
    description: 'Regionally adapted wheat seed with current availability.',
    id: '18b392f4-09f6-44d9-a104-54db9e731631',
    images: [],
    name: 'Jizzakh wheat seed',
    priceUzs: 3_850_000,
    region: 'Jizzakh',
    status: 'active',
    stockQuantity: 24,
    supplierId: 'a6d5d506-275d-44fa-b079-192371263fc2',
    supplierName: 'AgroSem Trade',
    unit: 't',
    updatedAt: '2026-08-09T10:00:00.000Z',
  },
] as const;

const marketplaceFetch =
  (products: readonly (typeof catalogProducts)[number][] = []): typeof fetch =>
  (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), globalThis.location.origin);
    let data: null | Record<string, number> | { items: readonly (typeof catalogProducts)[number][] } = { items: [] };
    if (url.pathname.endsWith('/verification')) {
      data = null;
    } else if (url.pathname.endsWith('/samples/usage')) {
      data = { limit: 5, remaining: 5, used: 0 };
    } else if (url.pathname.endsWith('/marketplace/catalog')) {
      data = { items: products };
    }
    return Promise.resolve(
      new Response(JSON.stringify({ data }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
  };

const UserMarketplaceComposition = ({
  initialEntry,
  products,
}: Readonly<{ initialEntry: string; products?: readonly (typeof catalogProducts)[number][] }>) => {
  const router = createUserRouter(createMemoryHistory({ initialEntries: [initialEntry] }));

  return (
    <FrontendStateProvider initialLocale="en">
      <FrontendI18nProvider initialLocale="en" translations={userFrontendTranslations}>
        <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }} fetchImpl={marketplaceFetch(products)}>
          <RouterProvider router={router} />
        </ApiClientProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>
  );
};

const UserHomeComposition = () => <UserMarketplaceComposition initialEntry="/" />;

const meta = {
  title: 'Applications/User/Home',
  component: UserHomeComposition,
  decorators: [
    (Story) => (
      <>
        <style>{userStyles}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    appComposition: true,
    layout: 'fullscreen',
  },
} satisfies Meta<typeof UserHomeComposition>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  tags: ['visual'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { name: 'Everything for your farm in one place' })).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'DehqonHub' })).toHaveLength(2);
    const brandMarks = Array.from(canvasElement.querySelectorAll<HTMLImageElement>('.dh-brand__mark img'));
    await expect(brandMarks).toHaveLength(2);
    await waitFor(async () => {
      await expect(brandMarks.every((mark) => mark.complete && mark.naturalWidth === 512)).toBe(true);
    });
    await expect(canvas.getAllByRole('button', { name: /^Catalog$/u })).toHaveLength(1);
    await expect(canvas.getByRole('button', { name: 'For buyers: Catalog' })).toBeVisible();
    await expect(await canvas.findAllByText('No products in this section')).toHaveLength(3);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};

export const SeedCatalog: Story = {
  render: () => <UserMarketplaceComposition initialEntry="/catalog?section=seeds" products={catalogProducts} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { level: 1, name: 'Seeds' })).toBeVisible();
    await expect(canvas.getByText('Samarqand corn seed')).toBeVisible();
    await expect(canvas.getByText('Jizzakh wheat seed')).toBeVisible();
    await expect(canvas.getByText('2 products')).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
