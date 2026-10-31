'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const output = path.join(root, 'dist');
const files = [
  'index.html',
  'assets/site.css',
  'charter/index.html',
  'news/index.html',
  'services/index.html',
  'admin/index.html',
];

fs.rmSync(output, { recursive: true, force: true });

for (const relativePath of files) {
  const source = path.join(root, relativePath);
  const destination = path.join(output, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

fs.writeFileSync(
  path.join(output, '_routes.json'),
  JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2) + '\n',
);

console.log(`Built ${files.length} site files and Pages routes into dist/`);
