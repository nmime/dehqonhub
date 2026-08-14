# Discovery

## Actors and boundaries

- Visitors and authenticated users operate the complete DehqonHub application
  at the root of `dehqonhub.uz`.
- Administrators operate the protected application at `/admin` on `admin-app.<domain>`.
- Operators deploy through the repository-owned single-server controller on Ubuntu 24.04 with the distribution Nginx package.

## Rules

- `user-app` is the selected apex owner and owns `/`, its SPA deep links, and
  `/problems` plus `/telegram-mini-app` on `PUBLIC_DOMAIN`.
- Registered custom problem types use
  `https://dehqonhub.uz/problems#<validated-code>`, opaque problem occurrences
  use the DehqonHub apex `/problem-instances/<encoded-request-id>` namespace,
  and unsafe codes or request identifiers fail before URI construction.
- `landing-app`, `site-app`, and `fullstack-e2e` are absent from the DehqonHub
  product selection. They produce no release images, listeners, virtual hosts,
  certificate names, or doctor expectations.
- `user-app.<domain>` is not a second public application host and is not kept as
  a compatibility alias.
- CORS, Better Auth trusted/return origins, payment return origins, and public
  runtime URLs include the apex and exclude deselected or unknown
  landing/site/user-app hosts.
- Admin, mobile, API, and enabled bot hosts keep their app-specific ownership.
- The administrator application retains `/admin` on its own host.
- The generated Nginx configuration must parse on the supported Ubuntu Nginx 1.24 baseline.
- Disabling optional UFW provisioning is a successful no-op, not a failed apply.
- Local image provenance builds the selected immutable tags once before systemd; unit activation and reboot reuse those tags with `--no-build` and never pull registry images.
- Backend processes bind `0.0.0.0:80` inside their containers so Docker bridge and published-port traffic can reach Fastify, while the host publications remain fixed to `127.0.0.1`.
- Frontend directory canonicalization behind host TLS remains relative, so an inner `http://<host>:8080/<path>/` redirect cannot change the browser's public scheme or expose the inner port.
- Migrator runtime sources remain readable by the numeric non-root image user
  even when the deployment checkout was created under a restrictive umask.
- Final API, worker, SSR, and static frontend runtime assets remain readable by
  their numeric non-root image users when the deployment checkout was created
  under a restrictive umask; representative asset checks run after each final
  image user switch.
- The production frontend failure showed that bundle readability alone is not
  sufficient: the selected Nginx server configuration also inherits build
  context modes unless the image normalizes it before switching to UID 101.

## Examples

- With `PRIMARY_APP=user-app`, `https://dehqonhub.uz/` serves the marketplace
  SPA and `https://dehqonhub.uz/catalog` remains a user-app deep link.
- `https://dehqonhub.uz/problems` renders the shared RFC 9457 registry from
  `user-app`, including `about:blank` and every registered custom type.
- `https://dehqonhub.uz/marketplace/public/catalog` reaches `user-app-api`
  through same-origin routing rather than returning SPA HTML.
- The Admin application remains `https://admin-app.dehqonhub.uz/admin`.
- Telegram opens `https://dehqonhub.uz/telegram-mini-app`.
- Authentication and payment return to the apex rather than any removed
  application hostname.

## Counterexamples

- Mounting the user SPA below `/app` or moving it to `user-app.<domain>` is not accepted.
- Serving Astro or Vike instead of the user SPA on the apex is not accepted.
- Keeping deselected landing/site images, ports, hosts, or certificate names is not accepted.
- A doctor result based only on Nginx's infrastructure endpoint is not treated as browser-journey proof.
- Rebuilding local images inside the systemd unit after the controller already built them is not accepted.
- A container-local health check is not proof that a loopback-published host port can reach a process bound only to the container loopback interface.
- Returning `Location: http://dehqonhub.uz:8080/problems/` from the public TLS origin is not accepted.
- Deriving a problem type or occurrence from a request host, repository/package
  identity, removed subdomain, or unsafe identifier is not accepted.
- Passing an image smoke check as root before its final numeric runtime user
  attempts to load restrictive-mode locale, server, static, or Nginx
  configuration assets is not accepted.

## Failure and rollback

- Invalid generated Nginx blocks deployment before reload and restores the previous configuration.
- Missing DNS or certificate coverage blocks convergence.
- Rollback restores the protected pre-change environment file and the previous immutable source revision.

## Review and unresolved questions

- Product intent was supplied directly by the maintainer: the user application
  is the apex product and the marketing renderers are removed from the selected
  DehqonHub deployment.
- Review found that pre-existing `REQ-NOTIFY-PREFERENCE-006` described an
  optional-channel preference model, API, delivery rule, UI, and journey that do
  not exist in source. The unsupported durable requirement and false mappings
  are removed by this change; implementation is deferred to a separately
  specified notification-preference change outside the apex hotfix.
- Runtime and operations review is required through deployment renderer tests and live route canaries.
- No blocking product decision remains.
