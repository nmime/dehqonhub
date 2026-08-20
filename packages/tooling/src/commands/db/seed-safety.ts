export const DefaultAdminEmail = "admin@example.com";
export const DefaultAdminPassword = "ChangeMe123!";

export interface SeedSafetyArgs {
  email: string;
  password: string;
  force?: boolean;
}

export interface SeedSafetyOptions {
  env?: NodeJS.ProcessEnv;
  assertLocalDevelopmentDatabase?: (connectionString: string) => void;
  isLocalDevelopmentDatabase?: (connectionString: string, env: NodeJS.ProcessEnv) => boolean;
}

function isTruthy(value: unknown): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

export function isLocalDevelopmentDatabase(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Fail closed: the host/name heuristic cannot tell a laptop from a deployment,
  // because a deployed stack also reaches Postgres at host "postgres" with the
  // default database name, which matches the /_boilerplate/ rule. NODE_ENV is the
  // primary signal and it is read as an allowlist, not as a single exclusion:
  // naming only "production" here let a staging deployment take the development
  // branch and publish the seeded administrator login, which is as reachable from
  // the internet as a production one. An unset value stays permitted because a
  // local seed routinely runs without it; any other named environment is treated
  // as a deployment and must opt in explicitly.
  const localEnvironments = new Set(["development", "test"]);
  if (env.NODE_ENV !== undefined && env.NODE_ENV !== "" && !localEnvironments.has(env.NODE_ENV)) {
    return false;
  }
  const url = new URL(connectionString);
  const hosts = [url.host].map((host) =>
    host.startsWith("[") ? host.slice(1, host.indexOf("]")).toLowerCase() : host.replace(/:\d+$/u, "").toLowerCase(),
  );
  const database = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
  const looksLikeDevDb = /(^|_)(dev|test|boilerplate)($|_)/u.test(database);
  return hosts.every((host) => localHosts.has(host)) && looksLikeDevDb;
}

export function resolvePassword(
  args: { passwordEnv?: string; password?: string },
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!args.passwordEnv) return args.password;
  const password = env[args.passwordEnv];
  if (!password) {
    throw new Error(`${args.passwordEnv} must contain the seed password.`);
  }
  return password;
}

export function assertSeedSafety(
  args: SeedSafetyArgs,
  connectionString: string,
  {
    env = process.env,
    assertLocalDevelopmentDatabase,
    isLocalDevelopmentDatabase: inspectLocalDatabase = isLocalDevelopmentDatabase,
  }: SeedSafetyOptions = {},
): void {
  const localDevelopmentDatabase = inspectLocalDatabase(connectionString, env);
  const productionRuntime = env.NODE_ENV === "production";
  const defaultSeedCredentials =
    args.email.toLowerCase() === DefaultAdminEmail &&
    args.password === DefaultAdminPassword;

  if (!args.force) {
    assertLocalDevelopmentDatabase?.(connectionString);
  }

  if (args.force && !localDevelopmentDatabase) {
    if (!isTruthy(env.DB_SEED_ALLOW_NON_LOCAL)) {
      throw new Error(
        "Refusing --force seed against a non-local/dev database. Set DB_SEED_ALLOW_NON_LOCAL=true only for an intentional, controlled seed operation.",
      );
    }
    if (productionRuntime && !isTruthy(env.DB_SEED_ALLOW_PRODUCTION)) {
      throw new Error(
        "Refusing --force seed in production. Set DB_SEED_ALLOW_PRODUCTION=true only for an intentional, controlled production seed operation.",
      );
    }
  }

  if ((productionRuntime || !localDevelopmentDatabase) && defaultSeedCredentials) {
    throw new Error(
      "Default seed admin credentials are not allowed for production or non-local databases. Pass --email and a strong --password or --password-env value.",
    );
  }
}
