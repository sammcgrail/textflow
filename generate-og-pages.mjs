#!/usr/bin/env node
// Generate per-mode HTML files with mode-specific OG images.
// Run after Vite build — creates dist-vite/<modename>/index.html for each mode.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

var base = readFileSync('dist-vite/index.html', 'utf8');
var modesFile = readFileSync('src/modes-list.js', 'utf8');

// Extract mode IDs from modes-list.js
var ids = [];
var re = /id:\s*"([^"]+)"/g;
var match;
while ((match = re.exec(modesFile)) !== null) {
  ids.push(match[1]);
}

console.log('Generating OG pages for ' + ids.length + ' modes...');

var generated = 0;
for (var id of ids) {
  var dir = 'dist-vite/' + id;
  mkdirSync(dir, { recursive: true });

  // Check if a thumbnail exists
  var hasThumb = existsSync('static/thumbs/' + id + '.png');
  // Use the textflow.sebland.com subdomain — the /textflow/ prefix path
  // 301-redirects when Discord/X tries to fetch the image, which breaks the
  // link-preview embed. Direct subdomain serves the PNG at 200.
  var ogImage = hasThumb
    ? 'https://textflow.sebland.com/static/thumbs/' + id + '.png'
    : 'https://textflow.sebland.com/static/og-roto.png';

  var html = base
    .replace(
      /<meta property="og:image" content="[^"]*">/,
      '<meta property="og:image" content="' + ogImage + '">'
    )
    .replace(
      /<meta name="twitter:image" content="[^"]*">/,
      '<meta name="twitter:image" content="' + ogImage + '">'
    )
    .replace(
      /<meta property="og:title" content="[^"]*">/,
      '<meta property="og:title" content="textflow — ' + id + '">'
    )
    .replace(
      /<meta name="twitter:title" content="[^"]*">/,
      '<meta name="twitter:title" content="textflow — ' + id + '">'
    )
    .replace(
      /<title>[^<]*<\/title>/,
      '<title>textflow — ' + id + '</title>'
    )
    .replace(
      /(Over )?\d+ interactive ASCII art experiments/g,
      'Over 260 interactive ASCII art experiments'
    );

  writeFileSync(dir + '/index.html', html);
  generated++;
}

console.log('Generated ' + generated + ' mode pages');
