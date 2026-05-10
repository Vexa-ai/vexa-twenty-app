#!/usr/bin/env node
// Strip host-coupling fields from .twenty/output/package.json before
// `npm publish`. The published package must NOT dictate node/yarn
// version (engines), force corepack downloads (packageManager), or
// carry build-time fields (devDependencies, scripts) — those break
// installs on air-gapped or version-pinned hosts (k8s clusters,
// hosted Twenty, restricted CI). All build-time concerns stay in the
// source-side package.json; only the runtime contract ships.
import { readFileSync, writeFileSync } from 'node:fs';

const path = '.twenty/output/package.json';
const pkg = JSON.parse(readFileSync(path, 'utf8'));

for (const k of ['packageManager', 'engines', 'scripts', 'devDependencies']) {
  delete pkg[k];
}

writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
console.log(`stripped: ${path} (${Object.keys(pkg).length} fields kept)`);
