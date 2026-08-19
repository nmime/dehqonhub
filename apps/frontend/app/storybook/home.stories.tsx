import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { ApiClientProvider, type MarketplacePublicListingDto } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendQueryProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { createUserRouter } from '../src/app/router/user-route-tree';
import { UserRuntimeProvider } from '../src/app/router/user-runtime-context';
import { MiniAppProvider } from '../src/shared/mini-app';
import userStyles from '../src/styles.css?inline';

const catalogProducts = [
  {
    availableQuantity: 18,
    category: 'seed',
    description: 'Certified drought-resistant corn seed for field production.',
    id: '65cb7c88-6b04-40d5-8443-f2d8de152119',
    images: [],
    kind: 'product',
    priceUzs: 4_080_000,
    promoted: false,
    provenance: 'live',
    publishedAt: '2026-08-09T10:00:00.000Z',
    rating: { average: 4.8, count: 24 },
    region: 'Samarqand',
    sampleAvailable: true,
    section: 'seeds',
    seller: {
      displayName: 'Zarafshon Agro',
      id: '5e64471f-7444-4b69-a28d-6d4cb8f59de0',
      provenance: 'live',
      region: 'Samarqand',
      verified: true,
    },
    title: 'Samarqand corn seed',
    transactional: true,
    unit: 't',
    updatedAt: '2026-08-09T10:00:00.000Z',
  },
  {
    availableQuantity: 24,
    category: 'seed',
    description: 'Regionally adapted wheat seed with current availability.',
    id: '18b392f4-09f6-44d9-a104-54db9e731631',
    images: [],
    kind: 'product',
    priceUzs: 3_850_000,
    promoted: false,
    provenance: 'live',
    publishedAt: '2026-08-09T10:00:00.000Z',
    rating: { average: 4.5, count: 11 },
    region: 'Jizzakh',
    sampleAvailable: true,
    section: 'seeds',
    seller: {
      displayName: 'AgroSem Trade',
      id: 'a6d5d506-275d-44fa-b079-192371263fc2',
      provenance: 'live',
      region: 'Jizzakh',
      verified: true,
    },
    title: 'Jizzakh wheat seed',
    transactional: true,
    unit: 't',
    updatedAt: '2026-08-09T10:00:00.000Z',
  },
  {
    availableQuantity: 36,
    category: 'seed',
    description: 'Early tomato seed for open-field production in the Fergana valley.',
    id: '0384a3ce-45b1-44b7-9e0b-20dd10fc7ff1',
    images: [],
    kind: 'product',
    priceUzs: 920_000,
    promoted: true,
    provenance: 'live',
    publishedAt: '2026-08-08T10:00:00.000Z',
    rating: { average: 4.9, count: 6 },
    region: 'Fargʻona',
    sampleAvailable: true,
    section: 'seeds',
    seller: {
      displayName: 'Fergana Seeds',
      id: '21eb499f-5c77-4a27-a88b-ea3e5e94622f',
      provenance: 'live',
      region: 'Fargʻona',
      verified: true,
    },
    title: 'Sitora F1 tomato seed',
    transactional: true,
    unit: 'kg',
    updatedAt: '2026-08-08T10:00:00.000Z',
  },
  {
    availableQuantity: 7,
    category: 'equipment',
    description: 'Compact 24 hp tractor with attachments for small farms.',
    id: '8cbe7285-3736-447a-a25a-10c5e6ad56f8',
    images: [],
    kind: 'product',
    priceUzs: 78_500_000,
    promoted: false,
    provenance: 'live',
    publishedAt: '2026-08-07T10:00:00.000Z',
    rating: { average: null, count: 0 },
    region: 'Toshkent',
    sampleAvailable: false,
    section: 'equipment',
    seller: {
      displayName: 'AgroTech UZ',
      id: 'a7d55290-fdc8-453c-aa58-970ff7dc9572',
      provenance: 'live',
      region: 'Toshkent',
      verified: true,
    },
    title: 'Compact farm tractor 24 hp',
    transactional: true,
    unit: 'unit',
    updatedAt: '2026-08-07T10:00:00.000Z',
  },
  {
    availableQuantity: 14,
    category: 'irrigation',
    description: 'Five-hectare drip irrigation kit with installation guide.',
    id: '01b347a2-140d-4747-a218-b9394920bd6e',
    images: [],
    kind: 'product',
    priceUzs: 18_500_000,
    promoted: false,
    provenance: 'demo',
    publishedAt: '2026-08-06T10:00:00.000Z',
    rating: { average: 4.7, count: 3 },
    region: 'Samarqand',
    sampleAvailable: false,
    section: 'equipment',
    seller: {
      displayName: 'DehqonHub demo cooperative',
      id: '7414feb8-5f1f-4e2e-b45f-5ea52b14f530',
      provenance: 'demo',
      region: 'Samarqand',
      verified: false,
    },
    title: 'Drip irrigation kit — 5 ha',
    transactional: false,
    unit: 'kit',
    updatedAt: '2026-08-06T10:00:00.000Z',
  },
  {
    availableQuantity: 2_400,
    crop: 'Tomato',
    description: 'Grade A open-field tomatoes packed for wholesale delivery.',
    grade: 'A',
    id: '1f888e33-7d95-4291-9659-c65c7b46345a',
    images: [],
    kind: 'produce',
    priceUzs: 18_000,
    promoted: false,
    provenance: 'live',
    publishedAt: '2026-08-05T10:00:00.000Z',
    rating: { average: 4.2, count: 8 },
    region: 'Fargʻona',
    sampleAvailable: true,
    section: 'produce',
    seller: {
      displayName: 'Vodiy Harvest',
      id: 'aa99a4b5-1b7e-4b72-84e4-17dc607d8e7c',
      provenance: 'live',
      region: 'Fargʻona',
      verified: true,
    },
    title: 'Grade A wholesale tomatoes',
    transactional: true,
    unit: 'kg',
    updatedAt: '2026-08-05T10:00:00.000Z',
  },
  {
    availableQuantity: 5_200,
    crop: 'Apple',
    description: 'Fresh orchard apples sorted for wholesale buyers.',
    grade: 'A',
    id: '69b87365-3e20-4b87-a202-fd27611fc045',
    images: [],
    kind: 'produce',
    priceUzs: 16_500,
    promoted: false,
    provenance: 'live',
    publishedAt: '2026-08-04T10:00:00.000Z',
    rating: { average: null, count: 0 },
    region: 'Namangan',
    sampleAvailable: false,
    section: 'produce',
    seller: {
      displayName: 'Namangan Bogʻlari',
      id: 'ce7b06a7-2606-47af-8524-b76e231d8eb4',
      provenance: 'live',
      region: 'Namangan',
      verified: true,
    },
    title: 'Fresh orchard apples',
    transactional: true,
    unit: 'kg',
    updatedAt: '2026-08-04T10:00:00.000Z',
  },
] as const satisfies readonly MarketplacePublicListingDto[];

const marketplaceFetch =
  (products: readonly (typeof catalogProducts)[number][] = []): typeof fetch =>
  (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), globalThis.location.origin);
    if (url.pathname.endsWith('/auth/me')) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: null }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
    }
    let data: null | Record<string, number> | { items: readonly (typeof catalogProducts)[number][] } = { items: [] };
    if (url.pathname.endsWith('/verification')) {
      data = null;
    } else if (url.pathname.endsWith('/samples/usage')) {
      data = { limit: 5, remaining: 5, used: 0 };
    } else if (url.pathname.endsWith('/marketplace/public/catalog')) {
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
    <MiniAppProvider backgroundColor="#fbf3e3" bottomBarColor="#203128" headerColor="#0b7138">
      <FrontendStateProvider initialLocale="en">
        <FrontendI18nProvider initialLocale="en" translations={userFrontendTranslations}>
          <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }} fetchImpl={marketplaceFetch(products)}>
            <FrontendQueryProvider>
              <UserRuntimeProvider value={{ applyUserLocale: () => undefined, applyUserTheme: () => undefined }}>
                <RouterProvider router={router} />
              </UserRuntimeProvider>
            </FrontendQueryProvider>
          </ApiClientProvider>
        </FrontendI18nProvider>
      </FrontendStateProvider>
    </MiniAppProvider>
  );
};

const UserHomeComposition = () => <UserMarketplaceComposition initialEntry="/" products={catalogProducts} />;

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

    await expect(
      await canvas.findByRole('heading', { name: "Uzbekistan's entire agro market — on one platform" }),
    ).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'DehqonHub' })).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('svg.dh-brand__mark')).toHaveLength(0);
    await expect(canvasElement.querySelectorAll('img.dh-brand__mark[alt=""]')).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('img.dh-brand__mark[src="/dehqonhub-emblem-96.png"]')).toHaveLength(2);
    await expect(canvas.getAllByRole('button', { name: /^Catalog$/u })).toHaveLength(1);
    await expect(canvas.getByRole('button', { name: 'For buyers: Catalog' })).toBeVisible();
    await expect(canvas.getByText('Samarqand corn seed')).toBeVisible();
    await expect(canvas.getByText('Compact farm tractor 24 hp')).toBeVisible();
    await expect(canvas.getByText('Grade A wholesale tomatoes')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Demo reviewer accounts' })).toBeVisible();
    await expect(canvas.getByText('Demo accounts')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'How purchase requests work' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('.dh-how__steps > li')).toHaveLength(3);
    await expect(canvas.queryByText('01')).not.toBeInTheDocument();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};

export const SeedCatalog: Story = {
  render: () => <UserMarketplaceComposition initialEntry="/catalog?section=seeds" products={catalogProducts} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { level: 1, name: 'Seeds' })).toBeVisible();
    await expect(canvas.getByRole('searchbox', { name: 'Product or seller' })).toHaveAttribute(
      'placeholder',
      'e.g. tomatoes',
    );
    const priceInputs = canvas.getAllByRole('spinbutton');
    await expect(priceInputs[0]).toHaveAttribute('placeholder', '0');
    await expect(priceInputs[1]).toHaveAttribute('placeholder', 'No limit');
    await expect(canvas.getByText('Samarqand corn seed')).toBeVisible();
    await expect(canvas.getByText('Jizzakh wheat seed')).toBeVisible();
    await expect(canvas.getByText('3 products')).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};

export const FilteredCatalog: Story = {
  render: () => <UserMarketplaceComposition initialEntry="/catalog?section=seeds&q=corn" products={catalogProducts} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Search: corn')).toBeVisible();
    await expect(canvas.getByText('Samarqand corn seed')).toBeVisible();
    await expect(canvas.queryByText('Jizzakh wheat seed')).not.toBeInTheDocument();
    await expect(canvas.getByText('1 product')).toBeVisible();
  },
};

export const EmptyCatalog: Story = {
  render: () => <UserMarketplaceComposition initialEntry="/catalog" products={[]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { name: 'No products match the selected criteria' })).toBeVisible();
    await expect(canvas.getByText('Change the search or filters and try again.')).toBeVisible();
    const resetButtons = canvas.getAllByRole('button', { name: 'Reset' });
    await expect(resetButtons[resetButtons.length - 1]).toBeVisible();
  },
};

export const Authentication: Story = {
  render: () => <UserMarketplaceComposition initialEntry="/auth" products={catalogProducts} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { name: 'Sign in to DehqonHub' })).toBeVisible();
    await expect(canvas.getByLabelText('Login email')).toHaveAttribute('placeholder', 'user@example.com');
    await expect(canvas.getByLabelText('Login password')).toHaveAttribute('placeholder', 'password');
    const loginButton = canvasElement.querySelector<HTMLButtonElement>('.xr-submit-button');
    if (!loginButton) {
      throw new Error('The sign-in submit button must be rendered.');
    }
    await expect(getComputedStyle(loginButton).color).toBe('rgb(255, 255, 255)');
    const recoverySectionGaps = Array.from(
      canvasElement.querySelectorAll<HTMLElement>('.user-auth__recovery section[aria-labelledby]'),
      (section) => getComputedStyle(section).gap,
    );
    await expect(recoverySectionGaps).toEqual(['16px', '16px']);
    await expect(canvas.getByRole('navigation', { name: 'Primary marketplace navigation' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('.xr-brand__mark')).toHaveLength(0);
  },
};
