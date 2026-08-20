// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "migrations-check.ts");
const roots: string[] = [];

/** A repository root holding exactly the migrations a case needs. */
function repositoryWith(migrations: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "migrations-check-"));
  roots.push(root);
  const directory = join(root, "libs", "backend", "postgres", "main", "example", "lib", "src", "migrations");
  mkdirSync(directory, { recursive: true });
  for (const [name, contents] of Object.entries(migrations)) {
    writeFileSync(join(directory, name), contents);
  }
  return root;
}

const run = (cwd: string) =>
  // Run by absolute path with no loader: the child's working directory is the
  // fixture repository, so a loader named by bare specifier would not resolve
  // there, and this script's own imports carry explicit extensions.
  spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });

after(() => {
  for (const root of roots) rmSync(root, { force: true, recursive: true });
});

const wellFormed = `export class Migration20260101000000AddExample {
  async up(): Promise<void> {
    this.addSql('alter table "examples" add column "label" varchar(20) not null default \'x\';');
  }
}
`;

const badConstraintName = `export class Migration20260101000001AddExampleCheck {
  async up(): Promise<void> {
    this.addSql('alter table "examples" add constraint "examples_label_chk" check (length("label") > 0);');
  }
}
`;

test("examines the migrations it finds instead of reporting an empty pass", () => {
  // The walk yields platform-native paths. Matching them against a pattern
  // written with forward slashes found nothing on Windows, so the gate printed
  // "checked: 0" and every migration went unexamined - the failure mode a green
  // check cannot be distinguished from.
  const result = run(repositoryWith({ "Migration20260101000000AddExample.ts": wellFormed }));

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { status: "ok", checked: 1 });
});

test("fails a migration whose constraint is not named by the convention", () => {
  const result = run(
    repositoryWith({
      "Migration20260101000000AddExample.ts": wellFormed,
      "Migration20260101000001AddExampleCheck.ts": badConstraintName,
    }),
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /check constraint name must match ck__\{table\}__\{rule\}/u);
});

test("refuses to pass when it found nothing to examine", () => {
  // Finding no migrations at all means either the repository has none or the
  // walk is broken, and the second is indistinguishable from success unless it
  // is reported.
  const result = run(repositoryWith({}));

  assert.equal(result.status, 1);
  assert.match(result.stderr, /found no migrations to examine/u);
});
