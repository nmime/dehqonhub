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
 * supplies the chrome every non-Telegram route is embedded in, but the sign-in flow,
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
    // Subscribed rather than read from `globalThis.location`, so a panel switch
    // inside one route — `/account/buying` to `/account/selling` — re-renders the
    // page instead of leaving it showing the section it first mounted with.
    const locationPathname = useRouterState({ select: (state) => state.location.pathname });

    return (
      <MarketplacePage
        locationPathname={locationPathname}
        locationSearch={locationSearch}
        navigate={navigate}
        view={view}
      />
    );
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

function MarketplacePartyRouteComponent() {
  const navigate = useUserNavigate();
  const partyId = useRouterState({
    select: (state) => decodeURIComponent(state.location.pathname.slice('/parties/'.length)),
  });

  return <MarketplacePage navigate={navigate} partyId={partyId} view="party" />;
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

const partyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/parties/$partyId',
  component: MarketplacePartyRouteComponent,
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

// The buyer's own purchase requests and the seller's incoming feed are separate
// deep links rather than one mixed list, and a single request has its own address.
// All three reuse the marketplace chrome, so they stay on the same page component.
const requestsIncomingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/requests/incoming',
  component: createMarketplaceRouteComponent('requests'),
});

const requestsNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/requests/new',
  component: createMarketplaceRouteComponent('requests'),
});

function MarketplaceRequestRouteComponent() {
  const navigate = useUserNavigate();
  const locationSearch = useRouterState({ select: (state) => state.location.searchStr });
  const requestId = useRouterState({
    select: (state) => decodeURIComponent(state.location.pathname.slice('/requests/'.length)),
  });

  // The page reads the addressed request from the path, so switching between two
  // requests has to remount it rather than reuse the previous request's state.
  return <MarketplacePage key={requestId} locationSearch={locationSearch} navigate={navigate} view="requests" />;
}

const singleRequestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/requests/$requestId',
  component: MarketplaceRequestRouteComponent,
});

// Deals in flight get their own address, so a party can be sent straight to the
// work waiting on them instead of through the cabinet. A single deal keeps its
// own `/contracts/$contractId` route.
const dealsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deals',
  component: createMarketplaceRouteComponent('deals'),
});

// Creating a listing is its own address, so a producer can be sent straight to
// the form rather than through the cabinet's publish queue. The page decides
// from the actor's own role which listing the form creates, and shows a stub for
// a role that creates none.
const newListingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/listings/new',
  component: createMarketplaceRouteComponent('newListing'),
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

// The personal cabinet keeps every section on its own address, so a reviewer can
// be sent straight to `/account/finance` instead of to a screen they then have to
// navigate. Both routes share the account component: it derives the section from
// the path it is handed, and an unknown segment resolves to the overview rather
// than to an empty frame. Moving between two sections is a re-render driven by
// the subscribed pathname, not a remount, so switching panels does not re-read
// the dashboard.
const accountSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account/$cabinetSection',
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
  partyRoute,
  favoritesRoute,
  cartRoute,
  requestsRoute,
  requestsIncomingRoute,
  requestsNewRoute,
  singleRequestRoute,
  dealsRoute,
  newListingRoute,
  verificationRoute,
  accountRoute,
  accountSectionRoute,
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
