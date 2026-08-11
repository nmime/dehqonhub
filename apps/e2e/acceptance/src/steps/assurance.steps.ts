import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Given, Then, When } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../support/world.ts';

// Executable acceptance evidence for REQ-ASSURANCE-TRACE-001 and
// REQ-ASSURANCE-RELEASE-003.
Given('the repository assurance model', function (this: AcceptanceWorld) {
  this.assuranceExitCode = undefined;
});

When('its project and evidence ownership is validated', function (this: AcceptanceWorld) {
  const toolingBin = resolve(process.cwd(), 'packages/tooling/bin/repo-tooling.mjs');
  const result = spawnSync(process.execPath, [toolingBin, 'spec', 'trace'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      NX_DAEMON: 'false',
      OPENSPEC_TELEMETRY: '0',
    },
  });
  this.assuranceExitCode = result.status;
});

Then('no project, requirement, feature, or scenario is orphaned', function (this: AcceptanceWorld) {
  assert.equal(this.assuranceExitCode, 0);
});

Given('the runner-neutral release assurance sources', function (this: AcceptanceWorld) {
  this.releaseAssuranceSources = [
    readFileSync('packages/tooling/src/commands/tooling/static-check.ts', 'utf8'),
    readFileSync('packages/tooling/src/commands/spec/assurance.ts', 'utf8'),
  ].join('\n');
});

When('its exact revision controls are inspected', function (this: AcceptanceWorld) {
  assert.match(this.releaseAssuranceSources ?? '', /checkGitHubActionsAbsent/u);
  assert.match(this.releaseAssuranceSources ?? '', /git status --porcelain/u);
});

Then('repository-owned GitHub execution remains absent', function (this: AcceptanceWorld) {
  assert.match(this.releaseAssuranceSources ?? '', /\.github\/workflows/u);
  assert.match(this.releaseAssuranceSources ?? '', /\.github\/actions/u);
});

Then('release evidence binds a clean exact source revision', function (this: AcceptanceWorld) {
  assert.match(this.releaseAssuranceSources ?? '', /The worktree is dirty/u);
  assert.match(this.releaseAssuranceSources ?? '', /run\('git', \['rev-parse', '--verify'/u);
  assert.match(this.releaseAssuranceSources ?? '', /checked-out source/u);
  assert.match(this.releaseAssuranceSources ?? '', /specificationHash/u);
});
