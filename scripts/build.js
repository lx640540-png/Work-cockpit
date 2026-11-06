// Dependency-free deterministic build. index.html remains the deployable entry point.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
const startup = manifest.startup || [];
const listed = new Set([...manifest.styles, ...startup, ...manifest.scripts]);
for (const entry of fs.readdirSync(path.join(root, 'src'), { recursive: true })) {
  const name = entry.split(path.sep).join('/');
  if (/\.(js|css)$/.test(name) && !listed.has(name)) throw new Error('Unlisted source: ' + name);
}
function joinFiles(names) {
  if (new Set(names).size !== names.length) throw new Error('Duplicate source in manifest');
  return names.map(name => {
    if (!/^[a-z0-9/-]+\.(js|css)$/.test(name)) throw new Error('Invalid source path: ' + name);
    return read(name);
  }).join('');
}
// Pinned Apache-2.0 Quill 2 image formatter; bundled locally for offline/static hosting.
const formatterRoot = path.join(root, 'vendor/quill-blot-formatter2-3.2.0');
const script = fs.readFileSync(path.join(formatterRoot, 'index.js'), 'utf8') + '\n' + joinFiles(manifest.scripts);
const startupScript = joinFiles(startup);
new vm.Script(startupScript, { filename: 'work-cockpit-startup.js' });
new vm.Script(script, { filename: 'work-cockpit.js' });
const names = [...script.matchAll(/^function (\w+)\(/gm)].map(match => match[1]);
if (new Set(names).size !== names.length) throw new Error('Duplicate application function');
let html = read('index.template.html');
for (const [marker, value] of [['{{APP_STYLES}}', fs.readFileSync(path.join(formatterRoot, 'quill-blot-formatter2.css'), 'utf8') + '\n' + joinFiles(manifest.styles)], ['{{STARTUP_SCRIPT}}', startupScript], ['{{APP_SCRIPT}}', script]]) {
  if (html.split(marker).length !== 2) throw new Error('Expected one template marker: ' + marker);
  html = html.replace(marker, () => value);
}
const output = path.join(root, 'index.html');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(output, 'utf8') !== html) throw new Error('index.html is stale. Run npm run build and commit the output.');
  console.log('PASS: generated entry point matches source');
} else {
  fs.writeFileSync(output, html);
  console.log('Built index.html from ' + manifest.scripts.length + ' JavaScript source files');
}
