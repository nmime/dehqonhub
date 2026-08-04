// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const workspaceRoot = process.cwd();

function configuredPnpmVersion(): string {
  const packageJson = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as {
    packageManager?: string;
  };
  const match = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageJson.packageManager ?? '');
  assert.ok(match, 'package.json must pin an exact pnpm packageManager version');
  return match[1];
}

function gitLabPnpmVersion(): string {
  const source = readFileSync(join(workspaceRoot, '.gitlab-ci.yml'), 'utf8');
  const match = /^\s*PNPM_VERSION:\s*['\"]?(\d+\.\d+\.\d+)['\"]?\s*$/m.exec(source);
  assert.ok(match, '.gitlab-ci.yml must pin an exact PNPM_VERSION');
  return match[1];
}

void describe('runner pnpm version alignment', () => {
  void it('keeps the optional GitLab runner pin aligned with packageManager', () => {
    assert.equal(gitLabPnpmVersion(), configuredPnpmVersion());
  });
});
