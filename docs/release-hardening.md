# Release and Kubernetes hardening

## Image immutability

Release images are built by `.github/workflows/release-images.yml` and pushed to
GHCR as `ghcr.io/<owner>/<repo>/<image>:sha-<git-sha>`. The workflow also emits
BuildKit provenance/SBOM attestations, uploads SPDX SBOM artifacts, scans image
digests with Trivy, and signs pushed digests with cosign keyless signing via
GitHub OIDC.

Production Helm values intentionally avoid `latest`. Prefer setting
`*.image.digest` to the pushed digest, or set every `*.image.tag` to the
workflow's `sha-<git-sha>` tag.

## Container image build (bake)

Image identities come from one source: the `releaseImages` array in
`scripts/release-image-plan.mjs`. `pnpm run bake:generate` (script
`scripts/generate-bake-file.mjs`) derives `docker-bake.json` from that list —
one `docker buildx bake` target per image, with every app image sharing a
single `NX_BUILD_PROJECTS` arg. Pass `--only "a,b"` to scope the generated file
to a selected subset of images; the release workflow uses this to bake only
the images an affected release actually touches.

The Dockerfile's `builder` stage compiles the workspace **once** —
`pnpm exec nx run-many -t build export --projects="${NX_BUILD_PROJECTS:-$NX_PROJECT}"`
— so shared libraries build a single time no matter how many app images are
requested in the same bake; each per-app runtime image then copies only its
`dist/` slice plus its own pruned dependency graph. Compose still passes the
legacy `NX_PROJECT` arg per service — the `${NX_BUILD_PROJECTS:-$NX_PROJECT}`
fallback keeps that path working unchanged.

`.github/workflows/release-images.yml` builds every affected image in one
shared `docker buildx bake` invocation (rather than a per-image matrix job),
then loops over the build's `--metadata-file` digests to run the SBOM/Trivy/
cosign steps above per image.

Local commands:

```bash
# regenerate the full bake file from the single releaseImages source
pnpm run bake:generate

# regenerate it scoped to an affected subset (what the release workflow does)
node scripts/generate-bake-file.mjs --only "auth-app-api,user-app-api"

# inspect the resolved plan without building anything
docker buildx bake -f docker-bake.json --print auth-app-api user-app-api

# build the scoped image set — the builder compiles once and both images share it
docker buildx bake -f docker-bake.json auth-app-api user-app-api
```

Measured locally: building `auth-app-api` and `user-app-api` as two separate
image builds compiled the shared library graph twice (120s total); building
the same pair together via `docker buildx bake` compiles it once (99s total,
one `nx run-many` invocation) — see
[2026-07-23-build-baseline.md](superpowers/specs/2026-07-23-build-baseline.md)
for the full measurement. The release-workflow rewrite that drives this from
CI is static-validated (`--print`, `deploy:validate:docker`) pending a real CI
run.

## Helm validation

Run the same render gate as CI:

```bash
bash scripts/validate-helm.sh
# or
pnpm run helm:validate
```

The gate renders default and production values, rejects `:latest` in production,
and verifies nginx frontends point at Kubernetes Service DNS names.

## Runtime port and nginx behavior

API containers use their per-app Helm `apps.<name>.port` value as both
`containerPort` and the `PORT` environment variable. Node app images can bind
port 80 as a non-root user, so Services expose `servicePort: 80` and route by
named target port.

Frontend images still include the docker-compose nginx config for local use. In
Kubernetes, Helm mounts a rendered ConfigMap at
`/etc/nginx/conf.d/default.conf`; upstreams resolve to
`<release>-auth-app-api`, `<release>-user-app-api`, and
`<release>-admin-app-api` Services.
