# Frontend UX and design system

The DehqonHub browser experience uses source-owned primitives from
`@app/frontend-ui-web`. Product pages compose those primitives inside their
Feature-Sliced owner; they do not create app-local design systems.

## Boundaries

- Shared controls, dialogs, menus, tables, cards, inputs, loading states, empty
  states, and error boundaries live in `libs/frontend/ui-web/lib`.
- Product-specific marketplace blocks stay under `apps/frontend/app/src/pages`
  until they are genuinely reusable.
- New web UI prefers the canonical `Button`, `Card`, `Dialog`, `Select`,
  `Tabs`, `Checkbox`, `Switch`, `Table`, and `Input` exports.
- Do not add app-local `components/ui` trees or import Radix, CVA, `clsx`, or
  `tailwind-merge` directly from product code.
- The product visual contract is
  [DehqonHub Marketplace Design](design/dehqonhub-marketplace.md).

## Registry policy

The pinned shadcn CLI is the source-reviewed registry client. Search before
adding anything, preview source first, and apply only product-needed primitives
into `@app/frontend-ui-web`. Magic UI is optional MIT-licensed source after
accessibility, motion, dependency, and bundle review. Aceternity is research-only
and must not be persisted in this repository.

## Interaction quality

Every changed flow must cover:

1. task completion and authoritative server state;
2. semantic labels, landmarks, focus restoration and containment, keyboard
   navigation, contrast, and reduced motion;
3. loading, empty, denied, conflict, stale, error, recovery, selected, disabled,
   and simulation states;
4. responsive behavior at 320 px, 375 px, and desktop widths;
5. light and dark themes with repository tokens rather than one-off colors.

`UiErrorBoundary`, `UiLoading`, `UiEmptyState`, and `UiToast` own the shared
fallback patterns. Protected content renders only after authentication and
permission checks resolve; unknown auth state remains loading and denied state
fails closed.

## Verification

Use component tests for state and interaction logic, Storybook for owned visual
states, and Playwright for route-level keyboard, responsive, recovery, and
request behavior. Update visual baselines only when the corresponding source
change is intentional.
