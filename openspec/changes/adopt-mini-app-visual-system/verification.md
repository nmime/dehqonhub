# Verification

## Evidence Policy

This is a presentation-layer change to a high-risk journey requirement. It
alters no API, authorization, or persistence behavior, so acceptance and
contract lanes add nothing. What can actually regress is renderer-owned:
contrast, focus, target size, narrow-viewport layout, theme parity, accessible
naming, and the semantics of the new shared primitives. Those are falsified
directly by component tests, Storybook interaction play functions, and the
browser journey lane, which is why the existing `domain` + `journey` profile on
`REQ-AGRITECH-EXPERIENCE-026` is retained unchanged.

## Requirement Evidence

| Requirement                      | Risk | Required evidence     | Repository owners                                                              |
| -------------------------------- | ---- | --------------------- | ------------------------------------------------------------------------------ |
| `REQ-AGRITECH-EXPERIENCE-026`    | high | domain, journey       | `user-app:apps/frontend/app/src/shared/mini-app/mini-app-shell.spec.tsx`       |
| `REQ-FRONTEND-ACCESSIBILITY-003` | high | domain, journey       | `@app/frontend-ui-web:libs/frontend/ui-web/lib/src/storybook-coverage.spec.ts` |
| `REQ-FRONTEND-DESIGN-008`        | high | domain, documentation | `@app/frontend-ui-web:libs/frontend/ui-web/lib/src/shadcn-foundation.spec.ts`  |

`REQ-AGRITECH-EXPERIENCE-026` keeps its existing version 3 sidecar entry: the
same projects, risk, profiles, Cucumber disposition, and evidence files. The
mini-app shell test named in that entry is the file that proves the two new
observable behaviors, so no sidecar edit is required.

`REQ-FRONTEND-ACCESSIBILITY-003` and `REQ-FRONTEND-DESIGN-008` are exercised,
not modified. Their existing evidence already covers this change: the Storybook
coverage guard fails if a newly exported primitive has no story, and the
shadcn foundation guard fails if the token layer loses a required token name or
a theme block.

## Independence Review

The Storybook coverage guard and the shadcn foundation guard were authored
before this change and were not modified for it; they constrain the new code
without having been written to accommodate it. The mini-app shell test was
modified, and that modification is itself the reported behavior change — the
reviewer must judge whether replacing the "name flips to Copied" assertion with
the live-region assertion is a correction or a weakening. The argument for
correction is stated in `design.md` and the assertion's inline comment.

## PR, Main, Nightly, and Runtime Lanes

- PR and main: `@app/frontend-ui-web:test`, `user-app:test`, lint, typecheck,
  FSD boundary check, `spec:validate`, `spec:trace`, `docs:check`.
- PR and main: `user-app:e2e-authenticated` covers both themes, the 320 px and
  375 px layouts, keyboard focus, and horizontal-overflow checks.
- Nightly: the Chromium visual-regression suite. Its baselines change with this
  change and MUST be re-reviewed as intentional output rather than accepted
  automatically.
- Runtime: not applicable. Nothing deploys, and no runtime configuration or
  provider behavior changes.

A skipped lane is not a pass. The visual-regression baselines are pending
review below.

## Working-tree evidence

All lanes below ran on the modified working tree with `--skip-nx-cache`.

- `@app/frontend-ui-web:test` passed 20 test files and 118 tests, including the
  shadcn foundation token guard and the Storybook coverage guard extended to
  the new `mini-app-primitives` story file.
- `user-app:test` passed 25 test files and 196 tests after the mini-app shell
  test was updated to the live-region contract.
- `lint` and `typecheck` passed for both projects.
- `pnpm run frontend:fsd:check` passed across 520 frontend files under the
  strict layer policy, confirming the new shared asset and component modules
  sit in `shared` and are not imported upward.
- `pnpm run spec:validate` passed: 116 projects, 621 behavior tests, 84
  requirements, 401 evidence entries, zero errors and zero warnings.
  `pnpm run spec:trace` reported the same inventory with no unresolved markers.
- `pnpm run docs:check` passed across 369 Markdown files, 1014 local links, and
  23 anchors, confirming the rewritten design reference stays reachable from the
  documentation index.
- `pnpm run tooling:static-check`, `pnpm run test:security:secrets`, and
  `pnpm run format:check` passed; `git diff --check` is clean.
- Contrast for both palettes was computed by hand across body, muted, dim,
  accent-text, success-text, warning, and destructive tokens on their intended
  surfaces; the `-text` token variants exist because the dark accent and
  success hues fail AA on the light surface.
- Not run in this working tree: `user-app:e2e-authenticated`, the Storybook
  build and interaction suite, and the Chromium visual-regression suite. Their
  absence is recorded as residual risk below, not as a pass.

## Residual Risk

- The browser lanes named in the PR/main section — `user-app:e2e-authenticated`,
  the Storybook build and interaction suite — have not been executed against
  this working tree. Theme parity, keyboard focus, and 320 px/375 px overflow
  are therefore argued from component evidence and hand-computed contrast, not
  demonstrated in a browser. This change is not release-ready until those lanes
  run green.
- The Chromium visual baselines for every affected story are stale by
  construction and have not been regenerated or reviewed in this working tree.
  Until a reviewer accepts them as intentional output, the nightly visual lane
  is expected to fail, and that failure is not evidence of correctness.
- The reference material behind the visual direction was a supplied screenshot
  set that became unreadable partway through implementation. Four screens plus
  one pasted screenshot informed the system; the top-up, win, and loss screens
  were never read and are not reflected.
- Real-device review on a low-DPI Android Telegram client has not been
  performed. The filled-glyph decision is reasoned, not measured.

## Release boundary

This evidence belongs to the modified working tree and is not exact-SHA release
evidence. No commit-pinned lane, push, image publication, deployment, canary,
or rollback rehearsal is claimed by this change record.

## Independent Verification Reviewer

- `quality-engineering` (CODEOWNER role for frontend verification evidence).
