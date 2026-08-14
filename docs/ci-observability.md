# Validation observability without GitHub Actions

This repository does not contain GitHub Actions workflows or composite actions.
The canonical assurance surface is the repository-owned command set, executed
from a clean checkout locally or on a separately configured trusted runner.

## Fast change feedback

Run:

```bash
pnpm run ci:pr
```

This checks repository tooling, documentation, OpenSpec validity, changed-file
formatting, secret patterns, native SAST, and production dependency audit. It is
a preflight, not complete release evidence.

For broader changes, run the affected lint, typecheck, tests, builds, database
migration checks, browser journeys, and deployment validators described in
[Local verification](local-verification.md). Finish behavior changes with:

```bash
pnpm run spec:impact -- --base <base-revision> --head HEAD
pnpm run spec:verify -- --lane <pr|main|nightly|runtime> --base <base-revision> --head HEAD --report <report-path>
```

`spec:verify` rejects a dirty worktree and records the source SHA and
specification hash. Store its report with the review or release record in the
system chosen by the maintainer.

## Signals that are no longer repository-provided

Removing hosted GitHub execution also removed repository-owned CodeQL uploads,
OpenSSF Scorecard, pull-request dependency review, GitHub step summaries and
artifacts, scheduled assurance runs, automated image build/SBOM/Trivy/cosign
publication, and automatic GitOps promotion pull requests. `pnpm audit`, native
SAST, Gitleaks, local tests, and exact-SHA dossiers remain useful controls, but
they are not equivalent replacements for those hosted services.

GitLab CI remains an optional external runner configuration. Its status and
artifacts are authoritative only when a maintainer has enabled and protected
that runner and confirms it tested the exact revision under review.

## Recording results

Record the command, exit code, source SHA, runtime/tool versions, and any skipped
or unavailable dependency. Missing execution is `not run`, never `passed`.
Provider canaries, deployment state, and production readiness remain separate
evidence boundaries from source validation.
