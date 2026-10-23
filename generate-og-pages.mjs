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
      'Over 330 interactive ASCII art experiments'
    );

  // og:video (Sam 2026-10-23): if static/videos/<id>.mp4 exists, the share card plays it inline
  // (iMessage, Slack, Discord). Poster = static/videos/<id>.jpg, else the thumb above.
  // Make one with scripts/record-og-video.mjs. The mp4 must be H.264 + faststart and fetched
  // from the subdomain (the /textflow/ path 301s, which kills previews).
  // Animated share card (Sam 2026-10-23): if static/videos/<id>.og.gif exists, use it as the og:image INSTEAD of
  // og:video. Discord autoplays a GIF og:image in the embed but never autoplays og:video (that needs a click).
  if (existsSync('static/videos/' + id + '.og.gif')) {
    var gurl = 'https://textflow.sebland.com/static/videos/' + id + '.og.gif';
    var gw = 480, gh = 300;
    try {
      var gd = JSON.parse(readFileSync('static/videos/' + id + '.og.json', 'utf8'));
      gw = gd.width; gh = gd.height;
    } catch (e) {}
    html = html
      .replace(/<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="' + gurl + '">\n<meta property="og:image:type" content="image/gif">')
      .replace(/<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="' + gurl + '">')
      .replace(/<meta property="og:image:width" content="[^"]*">/, '<meta property="og:image:width" content="' + gw + '">')
      .replace(/<meta property="og:image:height" content="[^"]*">/, '<meta property="og:image:height" content="' + gh + '">')
      .replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="https://textflow.sebland.com/' + id + '/">');
  } else if (existsSync('static/videos/' + id + '.mp4')) {
    var vurl = 'https://textflow.sebland.com/static/videos/' + id + '.mp4';
    var poster = existsSync('static/videos/' + id + '.jpg')
      ? 'https://textflow.sebland.com/static/videos/' + id + '.jpg' : ogImage;
    var vw = 1280, vh = 800;
    try {
      var dims = JSON.parse(readFileSync('static/videos/' + id + '.json', 'utf8'));
      vw = dims.width; vh = dims.height;
    } catch (e) {}
    var pageUrl = 'https://textflow.sebland.com/' + id + '/';
    html = html
      .replace(/<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="' + poster + '">')
      .replace(/<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="' + poster + '">')
      .replace(/<meta property="og:image:width" content="[^"]*">/, '<meta property="og:image:width" content="' + vw + '">')
      .replace(/<meta property="og:image:height" content="[^"]*">/, '<meta property="og:image:height" content="' + vh + '">')
      .replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + pageUrl + '">')
      .replace(/<meta property="og:type" content="[^"]*">/,
        '<meta property="og:type" content="video.other">\n' +
        '<meta property="og:video" content="' + vurl + '">\n' +
        '<meta property="og:video:url" content="' + vurl + '">\n' +
        '<meta property="og:video:secure_url" content="' + vurl + '">\n' +
        '<meta property="og:video:type" content="video/mp4">\n' +
        '<meta property="og:video:width" content="' + vw + '">\n' +
        '<meta property="og:video:height" content="' + vh + '">');
  }

  writeFileSync(dir + '/index.html', html);
  generated++;
}

console.log('Generated ' + generated + ' mode pages');
