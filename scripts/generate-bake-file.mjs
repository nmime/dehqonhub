#!/usr/bin/env node
/**
 * Derive a Docker Bake config from the single source of image truth
 * (`releaseImages` in `scripts/release-image-plan.mjs`) so there is no
 * second, hand-maintained list of images to keep in sync.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { releaseImages } from './release-image-plan.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const parseBuildArgs = (buildArgs) =>
  Object.fromEntries(
    buildArgs
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );

export function buildBakeConfig(images, selectedNames) {
  const hasFilter = Array.isArray(selectedNames) && selectedNames.length > 0;
  const byName = new Map(images.map((image) => [image.name, image]));
  // Preserve the order the caller selected images in (e.g. the --only list) so
  // NX_BUILD_PROJECTS reflects the affected-set order, not the full catalogue order.
  const scoped = hasFilter ? selectedNames.map((name) => byName.get(name)).filter(Boolean) : images;

  const nxBuildProjects = scoped
    .filter((image) => image.project)
    .map((image) => image.project)
    .join(',');

  const target = {};
  for (const image of scoped) {
    const parsed = parseBuildArgs(image.buildArgs);
    delete parsed.NX_PROJECT;
    delete parsed.NX_TARGET;
    const args = image.project ? { NX_BUILD_PROJECTS: nxBuildProjects, ...parsed } : { ...parsed };
    target[image.name] = { dockerfile: 'Dockerfile', target: image.target, args };
  }

  return { group: { default: { targets: scoped.map((image) => image.name) } }, target };
}

export function renderBakeJson(images, selectedNames) {
  return `${JSON.stringify(buildBakeConfig(images, selectedNames), null, 2)}\n`;
}

const parseOnlyFlag = (argv) => {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--only') {
      const value = argv[index + 1];
      if (!value) throw new Error('--only requires a value.');
      return value;
    }
    if (argument.startsWith('--only=')) {
      return argument.slice('--only='.length);
    }
  }
  return undefined;
};

const main = () => {
  const only = parseOnlyFlag(process.argv.slice(2));
  const names = only
    ? only
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
    : undefined;
  writeFileSync(join(rootDir, 'docker-bake.json'), renderBakeJson(releaseImages, names));
  console.log('Wrote docker-bake.json');
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
