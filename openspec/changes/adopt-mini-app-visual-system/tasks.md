## 1. Token layer

- [x] 1.1 Re-author `libs/frontend/ui-web/lib/src/styles.css` dark-first: `:root`
      carries the dark palette and `color-scheme: dark`, `:root[data-theme='dark']`
      re-asserts it for nested shells, `:root[data-theme='light']` carries the
      derived counterpart.
- [x] 1.2 Add `--xr-color-accent-text` and `--xr-color-success-text` so accent
      and success text resolve per palette.
- [x] 1.3 Apply `--xr-font-display` to headings and numeric values, wiring the
      previously declared but unused display face.
- [x] 1.4 Move panels to the large radius and gradient surface with glow-based
      elevation; keep a true shadow only on the floating navigation island.
- [x] 1.5 Verify computed WCAG AA contrast for body and large text in both
      themes, including muted, dim, accent-text, and success-text tokens.

## 2. Shared primitives

- [x] 2.1 Add `UiPageHeader`, `UiStatChip`/`UiStatChipRow`, `UiStatWells`,
      `UiListRow`/`UiListRows`, and `UiBottomNav` to `@app/frontend-ui-web`.
- [x] 2.2 Give each primitive its semantics: `<dl>` pairing for wells, element
      choice by interactivity for rows, `role="group"` labelling for chips,
      `aria-current` for navigation.
- [x] 2.3 Extend the stat-chip action to a 44 px hit area without enlarging the
      chip.
- [x] 2.4 Export the primitives from the component barrel.

## 3. Asset pack

- [x] 3.1 Add `libs/frontend/ui-web/lib/src/asset/` with `ArtworkFrame`,
      navigation glyphs, category marks, status badges, and empty-state art.
- [x] 3.2 Scope gradient IDs with `useId()`; keep artwork `aria-hidden` unless a
      `title` is supplied.
- [x] 3.3 Give every status badge a distinct glyph so state survives greyscale.
- [x] 3.4 Export the asset barrel from the library index.

## 4. Mini-app shell

- [x] 4.1 Replace the hand-rolled bottom navigation with `UiBottomNav` and map
      routes to filled glyphs.
- [x] 4.2 Render visible navigation labels instead of `sr-only` names.
- [x] 4.3 Stop renaming the share controls on copy; leave the announcement to
      the existing polite live region.

## 5. Specification and documentation

- [x] 5.1 Author this change with a MODIFIED delta for
      `REQ-AGRITECH-EXPERIENCE-026` superseding the cream/green palette clauses
      and adding the navigation-label and stable-name behaviors.
- [x] 5.2 Rewrite `docs/design/dehqonhub-marketplace.md` so the design contract
      matches the shipped tokens.
- [x] 5.3 Run `pnpm run spec:validate` and `pnpm run spec:trace`.
- [x] 5.4 Run `pnpm run docs:check` for documentation link integrity.

## 6. Evidence

- [x] 6.1 Add `mini-app-primitives.stories.tsx` covering the composed screen and
      the light-theme counterpart, and register it in the Storybook coverage
      guard.
- [x] 6.2 Update `mini-app-shell.spec.tsx` to assert the live-region
      announcement, the `data-share-result` hook, and the stable control names.
- [x] 6.3 Run `@app/frontend-ui-web:test` and `user-app:test`.
- [x] 6.4 Run `lint`, `typecheck`, and `pnpm run frontend:fsd:check`.

## 7. Rollback

- [x] 7.1 Confirm the change is revertible as a single presentation commit with
      no migration, stored state, or configuration dependency.
