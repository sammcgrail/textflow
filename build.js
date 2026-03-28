const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

async function build() {
  // Bundle src/entry.js into IIFE format
  const result = await esbuild.build({
    entryPoints: ['src/entry.js'],
    bundle: true,
    format: 'iife',
    write: false,
    minify: false,
    target: ['es2015'],
    sourcemap: false,
  });

  const bundledJS = result.outputFiles[0].text;

  // Read the HTML template
  let html = fs.readFileSync(path.join(__dirname, 'src', 'index.html'), 'utf8');

  // Inline CSS: replace <link rel="stylesheet" href="./styles/main.css"> with <style>...</style>
  const cssLink = '<link rel="stylesheet" href="./styles/main.css">';
  const cssIdx = html.indexOf(cssLink);
  if (cssIdx !== -1) {
    const css = fs.readFileSync(path.join(__dirname, 'src', 'styles', 'main.css'), 'utf8');
    html = html.substring(0, cssIdx) + '<style>\n' + css + '</style>' + html.substring(cssIdx + cssLink.length);
  }

  // Replace the module script tag with the inlined bundle
  // Use a function replacer to avoid $& / $' / $` special replacement patterns
  const placeholder = '<script type="module" src="./entry.js"></script>';
  const idx = html.indexOf(placeholder);
  const output = html.substring(0, idx) + '<script>\n' + bundledJS + '</script>' + html.substring(idx + placeholder.length);

  // Write to dist/
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), output);
  console.log('Built dist/index.html (' + (output.length / 1024).toFixed(1) + ' KB)');
}

if (watch) {
  const chokidar = require('chokidar');
  console.log('Watching src/ for changes...');
  build();
  // Simple polling rebuild for dev
  let debounce = null;
  require('fs').watch('src', { recursive: true }, () => {
    clearTimeout(debounce);
    debounce = setTimeout(build, 200);
  });
} else {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
