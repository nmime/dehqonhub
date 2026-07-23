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

export function buildBakeConfig(images) {
  const nxBuildProjects = images
    .filter((image) => image.project)
    .map((image) => image.project)
    .join(',');

  const target = {};
  for (const image of images) {
    const parsed = parseBuildArgs(image.buildArgs);
    delete parsed.NX_PROJECT;
    delete parsed.NX_TARGET;
    const args = image.project ? { NX_BUILD_PROJECTS: nxBuildProjects, ...parsed } : { ...parsed };
    target[image.name] = { dockerfile: 'Dockerfile', target: image.target, args };
  }

  return { group: { default: { targets: images.map((image) => image.name) } }, target };
}

export function renderBakeJson(images) {
  return `${JSON.stringify(buildBakeConfig(images), null, 2)}\n`;
}

const main = () => {
  writeFileSync(join(rootDir, 'docker-bake.json'), renderBakeJson(releaseImages));
  console.log('Wrote docker-bake.json');
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
