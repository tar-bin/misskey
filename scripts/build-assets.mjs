/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import cssnano from 'cssnano';
import postcss from 'postcss';
import * as terser from 'terser';

import { build as buildLocales } from '../locales/index.js';
import generateDTS from '../locales/generateDTS.js';
import meta from '../package.json' assert { type: "json" };

let locales = buildLocales();

async function copyFrontendFonts() {
  await fs.cp('./packages/frontend/node_modules/three/examples/fonts', './built/_frontend_dist_/fonts', { dereference: true, recursive: true });
}

async function copyFrontendTablerIcons() {
  await fs.cp('./packages/frontend/node_modules/@tabler/icons-webfont', './built/_frontend_dist_/tabler-icons', { dereference: true, recursive: true });
}

async function copyFrontendLocales() {
  generateDTS();

  await fs.mkdir('./built/_frontend_dist_/locales', { recursive: true });

  const v = { '_version_': meta.version };

  for (const [lang, locale] of Object.entries(locales)) {
    await fs.writeFile(`./built/_frontend_dist_/locales/${lang}.${meta.version}.json`, JSON.stringify({ ...locale, ...v }), 'utf-8');
  }
}

async function copyFrontendShikiAssets() {
  await fs.cp('./packages/frontend/node_modules/shiki/dist', './built/_frontend_dist_/shiki/dist', { dereference: true, recursive: true });
  await fs.cp('./packages/frontend/node_modules/shiki/languages', './built/_frontend_dist_/shiki/languages', { dereference: true, recursive: true });
  await fs.cp('./packages/frontend/node_modules/aiscript-vscode/aiscript/syntaxes', './built/_frontend_dist_/shiki/languages', { dereference: true, recursive: true });
  await fs.cp('./packages/frontend/node_modules/shiki/themes', './built/_frontend_dist_/shiki/themes', { dereference: true, recursive: true });
}

async function copyBackendViews() {
  await fs.cp('./packages/backend/src/server/web/views', './packages/backend/built/server/web/views', { recursive: true });
}

async function buildBackendScript() {
  await fs.mkdir('./packages/backend/built/server/web', { recursive: true });
  let clientEntry;
  try {
    clientEntry = JSON.parse(await fs.readFile('./built/_vite_/manifest.json', 'utf-8'))['src/_boot_.ts'].file;
  } catch {
    clientEntry = 'src/_boot_.ts';
  }

  for (const file of [
    './packages/backend/src/server/web/boot.js',
    './packages/backend/src/server/web/bios.js',
    './packages/backend/src/server/web/cli.js',
    './packages/backend/src/server/web/flush.js'
  ]) {
    let source = await fs.readFile(file, { encoding: 'utf-8' });
    source = source.replaceAll('LANGS', JSON.stringify(Object.keys(locales)));
    source = source.replaceAll('CLIENT_ENTRY', JSON.stringify(clientEntry));
    const { code } = await terser.minify(source, { toplevel: true });
    await fs.writeFile(`./built/_frontend_dist_/${path.basename(file)}`.replace('.js', `.${meta.version}.js`), code);
  }
}

async function buildBackendStyle() {
  await fs.mkdir('./packages/backend/built/server/web', { recursive: true });

  for (const file of [
    './packages/backend/src/server/web/style.css',
    './packages/backend/src/server/web/bios.css',
    './packages/backend/src/server/web/cli.css',
    './packages/backend/src/server/web/error.css'
  ]) {
    const source = await fs.readFile(file, { encoding: 'utf-8' });
    const { css } = await postcss([cssnano({ zindex: false })]).process(source, { from: undefined });
    await fs.writeFile(`./packages/backend/built/server/web/${path.basename(file)}`, css);
  }
}

async function build() {
  await Promise.all([
    copyFrontendFonts(),
    copyFrontendTablerIcons(),
    copyFrontendLocales(),
    copyFrontendShikiAssets(),
    copyBackendViews(),
    buildBackendScript(),
    buildBackendStyle(),
  ]);
}

await build();

if (process.argv.includes("--watch")) {
	const watcher = fs.watch('./locales');
	for await (const event of watcher) {
		const filename = event.filename?.replaceAll('\\', '/');
		if (/^[a-z]+-[A-Z]+\.yml/.test(filename)) {
			locales = buildLocales();
			await copyFrontendLocales()
		}
	}
}
