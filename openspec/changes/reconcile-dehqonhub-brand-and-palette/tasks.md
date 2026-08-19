## 1. Specification

- [x] 1.1 Record the owner decisions: the real emblem in the shell, one light palette, no per-card eligibility hint.
- [x] 1.2 Modify `REQ-AGRITECH-EXPERIENCE-026` in place, keeping the stable identifier.
- [x] 1.3 Keep the version 3 evidence sidecar structurally valid and map the runtime evidence that now states the brand facts.

## 2. Implementation

- [x] 2.1 Render the transparent emblem as the header and footer brand mark with a small-asset source and a denser-screen master.
- [x] 2.2 Keep the mark presentational and give the clickable lockup a 44 px minimum target.
- [x] 2.3 Remove the per-card eligibility hint and its per-card recovery button.
- [x] 2.4 Announce the demo or eligibility reason on the card's own add action.
- [x] 2.5 Render one catalog-level eligibility notice for a signed-in actor who cannot yet transact.
- [x] 2.6 Make the restricted add label read as the plain add-to-cart label in all four locales.

## 3. Evidence

- [x] 3.1 Update the app-shell, component, and Storybook assertions to the emblem markup.
- [x] 3.2 Update the user-app Playwright journey for the emblem, the removed per-card hint, and the plain cart label.
- [x] 3.3 Update the fullstack runtime journey for the served asset, the lockup target, the visible wordmark, and the absent theme control.
- [x] 3.4 Run typecheck, lint, the user-app unit suite, `spec:validate`, strict OpenSpec validation, and `spec:impact`.
- [ ] 3.5 Run the user-app Playwright lane and the fullstack runtime lane. Not executed in this environment.
- [ ] 3.6 Rebuild Storybook and its interaction suite for the changed brand story assertions.

## 4. Documentation and rollback

- [x] 4.1 State the single-palette decision and the brand-asset rule in the durable requirement so reviewers stop asserting theme parity.
- [ ] 4.2 Record the rollback rehearsal for the previous `user-app` revision.

## 5. Release

- [ ] 5.1 Commit and push the exact revision with repository authorship.
- [ ] 5.2 Collect exact-SHA assurance and deploy the immutable `user-app` revision.
- [ ] 5.3 Run production browser canaries and record rollback material.
