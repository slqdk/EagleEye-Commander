// Builds a single-file offline demo (skirmish against AI only): dist/eagleeye-commander-demo.html
// Needs esbuild once:  npm i --no-save esbuild   then:  node tools/bundle.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({ entryPoints: [path.join(root, 'public/js/main.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2022', legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = fs.readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"')).trim();
const voices = fs.readFileSync(path.join(root, 'public/audio/voices.mp3')).toString('base64');   // the recorded voices travel inside the page
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap">';
// One deliberate look (a cartoon battlefield), so the page pins its own dark colour scheme.
const page = `<title>EagleEye Commander</title>
${fonts}
<style>:root{color-scheme:dark}
${css}</style>
${body}
<script>window.JF_OFFLINE=true;window.JF_VOICE_B64="${voices}";</script>
<script>${js}</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/eagleeye-commander-artifact.html'), page);
fs.writeFileSync(path.join(root, 'dist/eagleeye-commander-demo.html'), `<!doctype html>\n<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n${page.replace('</style>', '</style></head><body>')}</body></html>\n`);
console.log('dist/eagleeye-commander-demo.html', (page.length / 1024).toFixed(0) + ' KB');
