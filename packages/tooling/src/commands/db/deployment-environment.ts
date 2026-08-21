// @requirements REQ-RUNTIME-DATABASE-008

/**
 * Environments in which a database is a disposable local one.
 *
 * Everything else - staging, preview, a named demo, production - is a
 * deployment whose database somebody else can reach.
 */
const localEnvironments = new Set(["development", "test"]);

/**
 * Whether this process is running against a deployment rather than a laptop.
 *
 * The host-and-name heuristic the database commands use cannot tell the two
 * apart: a deployed stack reaches Postgres at host `postgres` with the default
 * database name, which is exactly the shape a local checkout has. `NODE_ENV` is
 * the only signal that can, and it has to be read as an allowlist. Three copies
 * of this rule each excluded the single name `production`, so a staging
 * deployment was treated as local and the seed published its default
 * administrator credentials on a host reachable from the internet.
 *
 * An unset or empty value stays local, because a local seed routinely runs
 * without one; any other name is a deployment and must opt in explicitly.
 */
export function isDeploymentEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const environment = env.NODE_ENV;
  if (environment === undefined || environment === "") return false;
  return !localEnvironments.has(environment);
}
