import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { ApiClientProvider } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { createUserRouter } from '../src/app/router/user-route-tree';
import userStyles from '../src/styles.css?inline';

const emptyMarketplaceFetch: typeof fetch = (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input), globalThis.location.origin);
  let data: null | Record<string, number> | { items: never[] } = { items: [] };
  if (url.pathname.endsWith('/verification')) {
    data = null;
  } else if (url.pathname.endsWith('/samples/usage')) {
    data = { limit: 5, remaining: 5, used: 0 };
  }
  return Promise.resolve(
    new Response(JSON.stringify({ data }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }),
  );
};

const UserHomeComposition = () => {
  const router = createUserRouter(createMemoryHistory({ initialEntries: ['/'] }));

  return (
    <FrontendStateProvider>
      <FrontendI18nProvider initialLocale="en" translations={userFrontendTranslations}>
        <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }} fetchImpl={emptyMarketplaceFetch}>
          <RouterProvider router={router} />
        </ApiClientProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>
  );
};

const meta = {
  title: 'Applications/User/Home',
  component: UserHomeComposition,
  tags: ['visual'],
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { name: 'Everything for your farm in one place' })).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: 'DehqonHub' })).toHaveLength(2);
    await expect(canvas.getAllByRole('button', { name: /^Catalog$/u })).toHaveLength(1);
    await expect(canvas.getByRole('button', { name: 'For buyers: Catalog' })).toBeVisible();
    await expect(await canvas.findAllByText('No products in this section')).toHaveLength(3);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};
