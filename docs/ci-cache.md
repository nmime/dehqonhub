# Local Nx cache

The repository uses the local `.nx/cache` directory for Nx task outputs. It no
longer contains GitHub Actions workflows or a repository-owned remote cache
adapter.

Keep cache inputs reproducible:

- install with `pnpm install --frozen-lockfile`;
- keep `NX_DAEMON=false` in non-interactive validation;
- never add `.env*`, credentials, Docker secret files, or other secret-bearing
  paths to a cache archive;
- treat a cache miss as a performance event, never as permission to skip a
  required command.

A trusted external runner may persist `.nx/cache` using its own protected cache
facility. That runner configuration is external to this repository and must not
change the command, source SHA, or lockfile being verified. Local cache hits do
not provide provenance, signing, or release authorization.
