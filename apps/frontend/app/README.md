# DehqonHub user app (`user-app`)

## Ownership

This app owns the DehqonHub marketplace and authenticated user SPA shell. Keep reusable user
features, API wrappers, runtime helpers, and shared UI in `libs/frontend/**`.
For this product, `user-app` is the only selected public web application and
owns the apex. The repository's landing and Vike site projects remain
unselected reference renderers.

## Commands

```bash
pnpm exec nx serve user-app
pnpm exec nx build user-app
pnpm exec nx run user-app:test
pnpm exec nx run user-app:e2e
pnpm run test:storybook
pnpm run frontend:fsd:check
```

`storybook/home.stories.tsx` composes the DehqonHub home and catalog with a
deterministic, realistic multi-category review catalog. Those records are
Storybook-only fixtures; production continues to render API data and the
explicitly labelled, feature-flagged demo catalog. Keep routing,
authentication, API behavior, Telegram integration, local-favorite behavior,
and complete account flows in `user-app:e2e` and `user-app:e2e-authenticated`.

## Telegram Mini App and browser shell

The same `user-app` bundle is the canonical Telegram Mini App and normal web
application. Configure BotFather with
`https://dehqonhub.uz/telegram-mini-app`; `/tma` and `/tma/auth` remain
supported launch aliases.

- `MiniAppProvider` in `@app/frontend-runtime` detects Telegram without making
  browser or server rendering depend on Telegram globals. In Telegram it mounts
  theme/viewport state, binds CSS variables, calls `ready()` and `expand()`,
  disables Telegram's vertical close/minimize swipe through the Bot API 7.7
  swipe-behavior method, requests Bot API 8.0 fullscreen when available, and
  sets the branded header, background, and bottom-bar colors.
- `MiniAppShell` in `@app/frontend-ui-web` is the single visual shell for both
  environments. It owns safe-area spacing, the colored header and bottom
  navigation, native Telegram or browser back behavior, and Telegram/Web
  Share/clipboard fallback behavior.
- Safe-area CSS consumes both Telegram's official
  `--tg-safe-area-inset-*`/`--tg-content-safe-area-inset-*` variables and the
  equivalent `@tma.js` viewport variables. The HTML viewport includes
  `viewport-fit=cover`.
- Share URLs strip all `tgWebApp*` launch parameters before leaving the app so
  raw Telegram launch data is never copied or shared.

Do not initialize Telegram SDK features inside a page or feature. Add product
content below `MiniAppShell`, and use `useMiniApp()` only when a feature needs a
platform action beyond the shell's built-in back and share controls.

## Docs

- [Frontend app rules](../AGENTS.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Frontend FSD](../../../docs/frontend-fsd.md)
- [Frontend state](../../../docs/frontend-state.md)
