#!/usr/bin/env node
// Copy the Lily Design System theme stylesheets into static/assets/themes/, so
// the theme picker can fetch them by URL (themesUrl + slug) from the app's own
// origin. Source: the @lilydesignsystem/themes npm dev dependency.
// Runs before `dev` and `build` (package.json predev/prebuild), and by hand
// with `pnpm run sync:lily`.
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(
	dirname(fileURLToPath(import.meta.resolve('@lilydesignsystem/themes/package.json'))),
	'dist'
);
const out = join(root, 'static', 'assets', 'themes');
const files = (await readdir(src)).filter((f) => f.endsWith('.css')).sort();
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of files) await copyFile(join(src, f), join(out, f));
console.log(`Vendored ${files.length} Lily theme(s) into static/assets/themes/.`);
