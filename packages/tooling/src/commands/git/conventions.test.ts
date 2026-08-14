// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CommitMetadata,
  normalizeRange,
  validateBranchName,
  validateCommit,
} from "./conventions.ts";

const validCommit: CommitMetadata = {
  hash: "abc1234",
  authorName: "nmime",
  authorEmail: "66474195+nmime@users.noreply.github.com",
  committerName: "nmime",
  committerEmail: "66474195+nmime@users.noreply.github.com",
  parents: ["parent"],
  message: "feat(auth): add passkey login",
};

describe("git conventions", () => {
  it("audits all of HEAD when a force-push before SHA is unavailable", () => {
    const before = "a".repeat(40);
    assert.equal(normalizeRange(`${before}..HEAD`, () => false), "HEAD");
    assert.equal(normalizeRange(`${before}..HEAD`, () => true), `${before}..HEAD`);
    assert.equal(normalizeRange("origin/main..HEAD", () => false), "origin/main..HEAD");
  });

  it("accepts protected and typed branches", () => {
    assert.deepEqual(validateBranchName("main"), []);
    assert.deepEqual(validateBranchName("feat/passkey-login"), []);
    assert.deepEqual(validateBranchName("hotfix/session-rotation"), []);
  });

  it("rejects agent prefixes and untyped branch names", () => {
    assert.notDeepEqual(validateBranchName("codex/passkey-login"), []);
    assert.notDeepEqual(validateBranchName("Claude/passkey-login"), []);
    assert.notDeepEqual(validateBranchName("bot/dependency-updates"), []);
    assert.notDeepEqual(validateBranchName("feature/passkey-login"), []);
  });

  it("accepts owner and human contributor Conventional Commits", () => {
    assert.deepEqual(validateCommit(validCommit), []);
    assert.deepEqual(
      validateCommit({ ...validCommit, message: "feat(api)!: remove legacy sessions" }),
      [],
    );
    assert.deepEqual(
      validateCommit({
        ...validCommit,
        authorName: "Ada Lovelace",
        authorEmail: "ada@example.com",
        committerName: "Grace Hopper",
        committerEmail: "grace@example.com",
        message: "fix(api): preserve contributor attribution\n\nCo-authored-by: Alan Turing <alan@example.com>",
      }),
      [],
    );
  });

  it("rejects assistant attribution, merges, malformed subjects, and assistant trailers", () => {
    const failures = validateCommit({
      ...validCommit,
      authorName: "Claude Agent",
      authorEmail: "agent@claude.example",
      parents: ["left", "right"],
      message: "Add passkey login\n\nCo-authored-by: Codex <agent@openai.example>",
    });

    assert.equal(failures.length, 4);
  });
});
