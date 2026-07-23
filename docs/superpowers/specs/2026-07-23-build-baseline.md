# Build baseline — per-image lib recompile (the "before")

- **Date:** 2026-07-23
- **Branch:** `chore/build-optimization-all-shapes`
- **Scope:** Task 1 of the build-once image pipeline effort — measure the
  redundant per-image `nx` compile that Option A (build once, reuse across
  images) removes. Read-only: no Dockerfile or source change.

## Environment

```
$ docker buildx version && docker info --format '{{.NCPU}} CPUs, {{.MemTotal}} bytes' && node -v && pnpm -v
github.com/docker/buildx v0.33.0 f7897eba028583e0071642db3c011e860444f8cf
12 CPUs, 12600696832 bytes
v24.18.0
11.11.0
```

BuildKit: v0.29.0 (OrbStack `orbstack` builder, docker driver).

## Method

1. Built the shared `workspace` target once (`docker buildx build --target
   workspace --build-arg PNPM_VERSION=11.11.0 -t nrb-baseline/workspace -f
   Dockerfile .`) to warm the dependency-install layer that CI already shares
   across image builds — **73.4s**, matching `docker buildx history` (`1m
   17s`).
2. Built two backend images that share the same library graph
   (`auth-app-api`, `user-app-api`) against that warm workspace, each timed
   end-to-end with `date +%s` deltas per the brief.
3. **Deviation from the brief's literal Step 3 command, required to get a
   real number:** this Docker host still held build cache from an earlier,
   separate interrupted attempt at this same task (a `--no-cache` `backend`
   build for `auth-app-api` that had already completed in the background,
   3m53s, per `docker buildx history`). Re-running the brief's exact command
   against that state hit a full BuildKit layer-cache skip — 2.7s, with the
   `nx run` instruction never executing — which is not a real build and was
   discarded. To get a genuine measurement without discarding the
   legitimately warm `workspace` layer, two corrections were applied before
   timing:
   - `docker buildx prune --filter type=exec.cachemount -f` — clears BuildKit
     cache *mounts* only (the Nx local compute cache at `/workspace/.nx/cache`
     mounted by the `builder` stage), leaving the regular layer cache
     (including the warm `workspace` stage) untouched.
   - `--no-cache-filter builder,backend-deps,backend` on the two timed builds
     — forces those stages' `RUN` instructions to actually execute instead of
     reusing a matching layer from the earlier interrupted attempt; the
     `workspace` stage (not in the filter) still serves from cache.
   Both timed builds were confirmed genuine by inspecting their logs: Nx
   reported **`Cache: 0/30 hit (0%)`** (auth-app-api) and **`Cache: 0/29 hit
   (0%)`** (user-app-api) — every shared-lib task actually recompiled, not
   replayed from Nx's own cache. This mirrors real CI: per finding #7 in
   `docs/superpowers/specs/2026-07-23-build-optimization-all-shapes-design.md`,
   the Nx cache lives in a BuildKit cache *mount* that the project's
   `cache-to: type=gha` strategy does not export, so each image build's
   runner starts with that mount cold — exactly the state this measurement
   reproduces locally.

## Results

| image | build time, warm workspace (s) | image size |
|---|---|---|
| `nrb-baseline/workspace` (prime, one-time) | 73 | 5.51GB |
| `nrb-baseline/auth-app-api` | 75 | 672MB |
| `nrb-baseline/user-app-api` | 45 | 420MB |

Raw command output:

```
auth-app-api elapsed=75s
user-app-api elapsed=45s
```

```
$ docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep nrb-baseline
nrb-baseline/user-app-api:latest 420MB
nrb-baseline/auth-app-api:latest 672MB
nrb-baseline/workspace:latest 5.51GB
```

## Note

With the `workspace` stage warm (dependency fetch/install already paid for
and shared, as it is in CI), the remaining wall-clock for each backend image
— 75s for `auth-app-api`, 45s for `user-app-api` — is dominated by the
`builder` stage's `RUN pnpm exec nx run <app>:build`, confirmed by the Nx
task log: that single step recompiles the app's entire dependency graph
(30 tasks for `auth-app-api`, 29 for `user-app-api`), the large majority of
which — `@app/common-config`, `@app/common-i18n-*`, `@app/backend-common-*`,
etc. — are libraries shared by both apps and are therefore compiled twice
across these two images with zero reuse between them (`Cache: 0/30` and
`Cache: 0/29`, i.e. 0% Nx-cache reuse across the two builds in this
environment, matching the CI reality described above). This per-image
shared-lib recompile — not the workspace install, and not the final
`backend-deps`/image-assembly steps, which are comparatively small — is
exactly the quantity a build-once compile (Option A) collapses from N
redundant runs into one.
