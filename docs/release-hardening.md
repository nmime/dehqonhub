# Release hardening

The repository no longer contains GitHub Actions release, image-build, signing,
or GitOps-promotion workflows. `.github/release.yml` remains only as GitHub
release-note categorization metadata, and GHCR references remain valid registry
configuration. Neither file publishes an artifact by itself.

## Current release boundary

A maintainer or separately configured trusted runner must perform release work
from a clean exact source revision. Before publication:

1. Install with `pnpm install --frozen-lockfile` on Node.js 24 and pnpm 11.15.1.
2. Run the risk-selected source, test, migration, browser, security, and
   deployment checks from [Local verification](local-verification.md).
3. Produce an exact-SHA OpenSpec dossier with `spec:impact` and `spec:verify`.
4. Generate the selected image inventory with `node scripts/release-image-plan.mjs`.
5. Generate and inspect the selected Bake plan; never substitute
   `--all-reference` for product ownership.
6. Build and scan immutable images, record their digests, and only then update
   GitOps values through reviewed source control.

The repository validates image planning, tag-update input shapes, Docker/Helm
configuration, and GitOps manifests. It does not currently provide an automated
publisher or promotion actor.

## Protections that require an external release system

The removed workflows previously described automatic Buildx publication, SPDX
SBOM generation, Trivy CRITICAL/HIGH scanning, keyless cosign signatures,
provenance attestations, and promotion pull requests. Those protections are now
absent unless the operator implements and verifies them in a trusted external
runner. Do not claim signed or attested images merely because local source gates
pass.

If signing is reintroduced, define the new trust root explicitly. The former
GitHub OIDC workflow identity cannot authenticate a local or unrelated runner.
Record the signer identity, digest, source SHA, SBOM, scan result, and
verification command beside the release.

## Rollback

Roll back by selecting previously verified immutable image digests and applying
a reviewed GitOps change. Database rollback remains subject to each migration's
documented compatibility and loss policy; never run destructive down migrations
against live marketplace traffic solely to match an older image.
