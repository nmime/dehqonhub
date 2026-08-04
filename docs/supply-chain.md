# Supply-chain security

Supply-chain claims must distinguish checked-in controls from external service
configuration. This repository has no GitHub Actions or composite actions.

| Boundary     | Repository-owned control                                                          | Current limitation                                                        |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Dependencies | pnpm lockfile, frozen install, `pnpm audit`, and license checks                   | No automated dependency updates or pull-request dependency-review job     |
| Source       | secret scan, native SAST, lint, typecheck, tests, exact-SHA OpenSpec dossier      | No CodeQL upload or OpenSSF Scorecard run                                 |
| Build inputs | selected closure, image inventory, Docker Bake generation, Docker/Helm validators | No repository-owned remote builder or artifact retention                  |
| Images       | immutable-digest validation and GitOps tag-update guards                          | No automated SBOM, Trivy, signature, attestation, or registry publication |
| Promotion    | reviewed GitOps manifests and full-SHA/digest input validation                    | No automated promotion pull request                                       |

## Dependency discipline

- Use Node.js 24 and pnpm 11.15.1.
- Install with `pnpm install --frozen-lockfile`.
- Keep `pnpm-lock.yaml` authoritative; Bun must not create package-manager state.
- Run `pnpm run audit:ci`, `pnpm run audit:licenses`, secret scanning, and native
  SAST as selected by the change risk.
- Dependency updates are maintainer-owned and must preserve the frozen
  lockfile plus the selected validation evidence.

## Exact-source evidence

Run `spec:impact` and `spec:verify` from a clean checkout. The dossier records
the checked-out source SHA and specification hash. A local pass does not prove a
remote branch, built image, deployed workload, or provider canary uses that SHA;
record those links separately.

## Images and attestations

The release image plan and Bake generator remain the canonical inventory and
build-input tools. An operator may use them on a trusted external builder, but
must separately retain:

- immutable image digests;
- source SHA and selected closure;
- SBOM and vulnerability scan output;
- signer identity and signature/attestation verification output;
- the reviewed GitOps change that promotes those digests.

The former GitHub workflow OIDC identity is not available. If keyless signing is
reintroduced on another platform, define and review that platform's identity
policy before accepting signatures. Otherwise use a protected key-based model
with documented custody and rotation.

## Honest assurance

Missing CodeQL, Scorecard, dependency review, hosted artifacts, scheduled runs,
SBOMs, scans, or signatures are gaps, not successful checks. A trusted external
runner may restore some of these controls, but its configuration and live result
must be verified independently of this repository.
