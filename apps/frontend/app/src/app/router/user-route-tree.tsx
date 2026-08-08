import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
  useRouterState,
} from '@tanstack/react-router';
import { AuthPage } from '../../pages/auth';
import { AuthDiscordCallbackPage } from '../../pages/auth-discord-callback';
import { AuthTelegramCallbackPage } from '../../pages/auth-telegram-callback';
import { ProfilePage } from '../../pages/profile';
import { SettingsPage } from '../../pages/settings';
import { TmaPage } from '../../pages/tma';
import { FarmerRegisterPage } from '../../pages/farmer-register';
import { FarmerDashboardPage } from '../../pages/farmer-dashboard';
import { AgriTechOperationsPage } from '../../pages/agritech-operations';
import { MarketplacePage, type MarketplacePageProps } from '../../pages/marketplace';
import { NotFoundPage } from '../../pages/not-found';
import { UserShell } from './user-shell';
import { useUserNavigate } from './user-navigation';
import { useUserRuntime } from './user-runtime-context';

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
]);

export const createUserRouter = (history: RouterHistory = createBrowserHistory()) =>
  createRouter({
    routeTree,
    history,
    trailingSlash: 'never',
    defaultPreload: false,
  });

export type UserRouter = ReturnType<typeof createUserRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: UserRouter;
  }
}
