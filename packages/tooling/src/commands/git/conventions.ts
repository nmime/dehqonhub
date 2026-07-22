import { run } from "../../runtime/process";

interface GitConventionsOptions {
  argv: string[];
  workspaceRoot: string;
}

export interface CommitMetadata {
  hash: string;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  parents: string[];
  message: string;
}

const ownerName = "nmime";
const ownerEmail = "66474195+nmime@users.noreply.github.com";
const branchTypes = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "hotfix",
  "perf",
  "refactor",
  "release",
  "revert",
  "test",
] as const;
const commitTypes = branchTypes.filter(
  (type) => type !== "hotfix" && type !== "release",
);
const protectedBranches = new Set(["main"]);
const forbiddenBranchIdentity = /(?:^|\/)(?:claude|codex)(?:\/|$)/iu;
const branchPattern = new RegExp(
  `^(?:${branchTypes.join("|")})/[a-z0-9]+(?:-[a-z0-9]+)*$`,
  "u",
);
const commitPattern = new RegExp(
  `^(?:${commitTypes.join("|")})(?:\\([a-z0-9][a-z0-9/-]*\\))?!?: [a-z0-9].+$`,
  "u",
);
const agentIdentity = /(?:codex|claude|splox|executor|(?:^|[\s<@._-])(?:ai[-_. ]?)?agent(?:[\s>@._-]|$))/iu;
const attributionTrailer = /^(?:co-authored-by|signed-off-by):\s*(.+)$/gimu;

export function validateBranchName(branch: string): string[] {
  const failures: string[] = [];

  if (forbiddenBranchIdentity.test(branch)) {
    failures.push(`branch must not contain a codex or claude path segment: ${branch}`);
  }

  if (
    !protectedBranches.has(branch) &&
    !branch.startsWith("dependabot/") &&
    !branchPattern.test(branch)
  ) {
    failures.push(
      `branch must match <type>/<kebab-case>; allowed types: ${branchTypes.join(", ")}`,
    );
  }

  return failures;
}

export function validateCommit(commit: CommitMetadata): string[] {
  const failures: string[] = [];
  const subject = commit.message.split("\n", 1)[0] ?? "";

  const ownerAttributed =
    commit.authorName === ownerName &&
    commit.authorEmail === ownerEmail &&
    commit.committerName === ownerName &&
    commit.committerEmail === ownerEmail;
  const agentAttributed =
    isAgentIdentity(commit.authorName, commit.authorEmail) ||
    isAgentIdentity(commit.committerName, commit.committerEmail);

  if (agentAttributed && !ownerAttributed) {
    failures.push(
      `${commit.hash}: agent-produced commits must use author and committer ${ownerName} <${ownerEmail}>`,
    );
  }

  if (commit.parents.length > 1) {
    failures.push(`${commit.hash}: merge commits are not allowed; rebase or squash the branch`);
  }

  if (!commitPattern.test(subject)) {
    failures.push(
      `${commit.hash}: subject must use Conventional Commits; allowed types: ${commitTypes.join(", ")}`,
    );
  }

  for (const match of commit.message.matchAll(attributionTrailer)) {
    if (agentIdentity.test(match[1] ?? "")) {
      failures.push(`${commit.hash}: assistant attribution trailers are not allowed`);
    }
  }

  return failures;
}

function isAgentIdentity(name: string, email: string): boolean {
  return agentIdentity.test(`${name} <${email}>`);
}

export function runGitConventions({
  argv,
  workspaceRoot,
}: GitConventionsOptions): number {
  const options = parseArgs(argv);
  const branch =
    options.get("branch") ??
    process.env.GITHUB_HEAD_REF ??
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME ??
    gitOutput(workspaceRoot, ["branch", "--show-current"]);
  const range = options.get("range") ?? defaultRange(workspaceRoot, branch);
  const failures = validateBranchName(branch);
  const commits = readCommits(workspaceRoot, range);

  for (const commit of commits) failures.push(...validateCommit(commit));

  console.log(
    JSON.stringify(
      {
        status: failures.length === 0 ? "ok" : "error",
        branch,
        range,
        commitCount: commits.length,
        failures,
      },
      null,
      2,
    ),
  );
  return failures.length === 0 ? 0 : 1;
}

function defaultRange(workspaceRoot: string, branch: string): string {
  if (protectedBranches.has(branch)) return "HEAD..HEAD";

  const baseCheck = run("git", ["rev-parse", "--verify", "origin/main"], {
    cwd: workspaceRoot,
  });
  if (baseCheck.status !== 0) return "HEAD..HEAD";

  const mergeBase = gitOutput(workspaceRoot, ["merge-base", "origin/main", "HEAD"]);
  return `${mergeBase}..HEAD`;
}

function readCommits(workspaceRoot: string, range: string): CommitMetadata[] {
  const normalizedRange = normalizeRange(range, (commit) => {
    return run("git", ["cat-file", "-e", `${commit}^{commit}`], {
      cwd: workspaceRoot,
    }).status === 0;
  });
  const result = run(
    "git",
    [
      "log",
      "--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%P%x1f%B%x1e",
      normalizedRange,
    ],
    { cwd: workspaceRoot },
  );

  if (result.status !== 0) {
    throw new Error(`Unable to inspect commit range ${range}: ${result.stderr.trim()}`);
  }

  return result.stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [
        hash = "",
        authorName = "",
        authorEmail = "",
        committerName = "",
        committerEmail = "",
        parentList = "",
        message = "",
      ] = record.split("\x1f");

      return {
        hash,
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        parents: parentList.split(" ").filter(Boolean),
        message: message.trim(),
      };
    });
}

export function normalizeRange(
  range: string,
  commitExists: (commit: string) => boolean,
): string {
  const pushRange = /^([0-9a-f]{40})\.\./u.exec(range);
  if (!pushRange) return range;

  const before = pushRange[1] ?? "";
  return before === "0".repeat(40) || !commitExists(before) ? "HEAD" : range;
}

function gitOutput(workspaceRoot: string, args: string[]): string {
  const result = run("git", args, { cwd: workspaceRoot });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function parseArgs(argv: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? "";
    if (!value.startsWith("--")) continue;
    const raw = value.slice(2);
    const equals = raw.indexOf("=");
    if (equals >= 0) {
      options.set(raw.slice(0, equals), raw.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(raw, next);
      index += 1;
    }
  }
  return options;
}
