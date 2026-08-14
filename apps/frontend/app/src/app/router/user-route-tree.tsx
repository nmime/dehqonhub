import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
  useRouterState,
} from '@tanstack/react-router';
import { MarketplacePage, type MarketplacePageProps } from '../../pages/marketplace';
import { NotFoundPage } from '../../pages/not-found';
import { UiLoading } from '../../shared/ui';
import { UserShell } from './user-shell';
import { useUserNavigate } from './user-navigation';
import { useUserRuntime } from './user-runtime-context';

/**
 * Everything outside the marketplace is fetched when its route is first opened.
 * The marketplace itself stays in the entry bundle because it renders `/` and
 * supplies the chrome every other route is embedded in, but the sign-in flow,
 * the OAuth callbacks, account preferences, the Telegram mini-app views, the
 * problem registry and the farmer consoles are each a screen most visits never
 * reach — and between them they were pulling their whole feature graph,
 * `better-auth` included, into the bundle a first-time reader waits for.
 */
const AuthPage = lazyRouteComponent(() => import('../../pages/auth'), 'AuthPage');
const AuthDiscordCallbackPage = lazyRouteComponent(
  () => import('../../pages/auth-discord-callback'),
  'AuthDiscordCallbackPage',
);
const AuthTelegramCallbackPage = lazyRouteComponent(
  () => import('../../pages/auth-telegram-callback'),
  'AuthTelegramCallbackPage',
);
const ProfilePage = lazyRouteComponent(() => import('../../pages/profile'), 'ProfilePage');
const SettingsPage = lazyRouteComponent(() => import('../../pages/settings'), 'SettingsPage');
const TmaPage = lazyRouteComponent(() => import('../../pages/tma'), 'TmaPage');
const FarmerRegisterPage = lazyRouteComponent(() => import('../../pages/farmer-register'), 'FarmerRegisterPage');
const FarmerDashboardPage = lazyRouteComponent(() => import('../../pages/farmer-dashboard'), 'FarmerDashboardPage');
const AgriTechOperationsPage = lazyRouteComponent(
  () => import('../../pages/agritech-operations'),
  'AgriTechOperationsPage',
);
const ProblemsPage = lazyRouteComponent(() => import('../../pages/problems'), 'ProblemsPage');

const rootRoute = createRootRoute({
  component: UserShell,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: createMarketplaceRouteComponent('home'),
});

type MarketplaceRouteView = NonNullable<MarketplacePageProps['view']>;

function createMarketplaceRouteComponent(view: MarketplaceRouteView) {
  return function MarketplaceRouteComponent() {
    const navigate = useUserNavigate();
    const locationSearch = useRouterState({ select: (state) => state.location.searchStr });

    return <MarketplacePage locationSearch={locationSearch} navigate={navigate} view={view} />;
  };
}

function MarketplaceProductRouteComponent() {
  const navigate = useUserNavigate();
  const productId = useRouterState({
    select: (state) => decodeURIComponent(state.location.pathname.slice('/products/'.length)),
  });

  return <MarketplacePage navigate={navigate} productId={productId} view="product" />;
}

function MarketplaceContractRouteComponent() {
  const navigate = useUserNavigate();
  const contractId = useRouterState({
    select: (state) => decodeURIComponent(state.location.pathname.slice('/contracts/'.length)),
  });

  return <MarketplacePage contractId={contractId} navigate={navigate} view="contract" />;
}

function MarketplaceSellerRouteComponent() {
  const navigate = useUserNavigate();
  const sellerId = useRouterState({
    select: (state) => decodeURIComponent(state.location.pathname.slice('/sellers/'.length)),
  });

  return <MarketplacePage navigate={navigate} sellerId={sellerId} view="seller" />;
}

const operationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/operations',
  component: AgriTechOperationsPage,
});

const problemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems',
  component: ProblemsPage,
});

function AuthRouteComponent() {
  const { applyUserLocale, applyUserTheme } = useUserRuntime();
  const navigate = useUserNavigate();
  return <AuthPage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} navigate={navigate} />;
}

const authRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth', component: AuthRouteComponent });

function DiscordCallbackRouteComponent() {
  const navigate = useUserNavigate();
  return <AuthDiscordCallbackPage navigate={navigate} />;
}

const discordCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/discord/callback',
  component: DiscordCallbackRouteComponent,
});

function TelegramCallbackRouteComponent() {
  const navigate = useUserNavigate();
  return <AuthTelegramCallbackPage navigate={navigate} />;
}

const telegramCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/telegram/callback',
  component: TelegramCallbackRouteComponent,
});

function ProfileRouteComponent() {
  const { applyUserLocale, applyUserTheme } = useUserRuntime();
  return <ProfilePage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} />;
}

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfileRouteComponent,
});

function SettingsRouteComponent() {
  const { applyUserLocale, applyUserTheme } = useUserRuntime();
  const navigate = useUserNavigate();
  return <SettingsPage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} navigate={navigate} />;
}

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsRouteComponent,
});

function TmaRouteComponent() {
  const navigate = useUserNavigate();
  return <TmaPage navigate={navigate} />;
}

// `/tma`, `/tma/auth`, `/telegram-mini-app` are aliases for the same Telegram
// mini-app view; `/link/telegram` opens it in account-linking mode.
const tmaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tma', component: TmaRouteComponent });
const tmaAuthRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tma/auth', component: TmaRouteComponent });
const telegramMiniAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/telegram-mini-app',
  component: TmaRouteComponent,
});

function LinkTelegramRouteComponent() {
  const navigate = useUserNavigate();
  return <TmaPage fallbackStartParam="link_telegram" navigate={navigate} />;
}

const linkTelegramRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/link/telegram',
  component: LinkTelegramRouteComponent,
});

// `/link/discord` reuses the settings surface (Discord linking lives there).
const linkDiscordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/link/discord',
  component: SettingsRouteComponent,
});

// AgriTech routes
const farmerRegisterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/farmer/register',
  component: FarmerRegisterPage,
});

const farmerDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: FarmerDashboardPage,
});

const marketplaceCatalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catalog',
  component: createMarketplaceRouteComponent('catalog'),
});

const productRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/products/$productId',
  component: MarketplaceProductRouteComponent,
});

const sellerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sellers/$sellerId',
  component: MarketplaceSellerRouteComponent,
});

const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/favorites',
  component: createMarketplaceRouteComponent('favorites'),
});

const cartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cart',
  component: createMarketplaceRouteComponent('cart'),
});

const requestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/requests',
  component: createMarketplaceRouteComponent('requests'),
});

const verificationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verification',
  component: createMarketplaceRouteComponent('verification'),
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: createMarketplaceRouteComponent('account'),
});

const contractRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contracts/$contractId',
  component: MarketplaceContractRouteComponent,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  discordCallbackRoute,
  telegramCallbackRoute,
  profileRoute,
  settingsRoute,
  tmaRoute,
  tmaAuthRoute,
  telegramMiniAppRoute,
  linkTelegramRoute,
  linkDiscordRoute,
  farmerRegisterRoute,
  farmerDashboardRoute,
  marketplaceCatalogRoute,
  productRoute,
  sellerRoute,
  favoritesRoute,
  cartRoute,
  requestsRoute,
  verificationRoute,
  accountRoute,
  contractRoute,
  operationsRoute,
  problemsRoute,
]);

export const createUserRouter = (history: RouterHistory = createBrowserHistory()) =>
  createRouter({
    routeTree,
    history,
    trailingSlash: 'never',
    defaultPreload: false,
    // A lazily fetched route suspends, and TanStack only wraps a match in
    // Suspense when the router can name what to show meanwhile. The chrome keeps
    // rendering around it, so this is the page area only.
    defaultPendingComponent: () => <UiLoading />,
  });

export type UserRouter = ReturnType<typeof createUserRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: UserRouter;
  }
}
