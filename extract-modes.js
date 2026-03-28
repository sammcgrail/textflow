#!/usr/bin/env node
/**
 * Extract modes from monolithic index.html into individual ES module files.
 *
 * Strategy: Since esbuild bundles everything into a single IIFE, all `var` declarations
 * at module top level become shared within the IIFE scope. So we DON'T need to rewrite
 * COLS/ROWS/time/etc to state.X — they're naturally shared through the IIFE closure.
 *
 * Each mode file just needs to:
 * 1. Import registerMode from registry
 * 2. Import shared utilities it uses (drawChar, clearCanvas, etc.)
 * 3. Contain its own var declarations and functions
 * 4. Call registerMode at the bottom
 *
 * The core modules (state, draw, canvas, pointer, etc.) will export the actual
 * shared variables, and the entry.js re-exports them as `var` declarations that
 * become shared scope in the IIFE bundle.
 */

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
const script = scriptMatch[1];
const lines = script.split('\n');

// ──────────────────────────────────────────────
// Define exact line ranges for each mode
// Lines are 0-indexed relative to the script content
// ──────────────────────────────────────────────

// First, find line offsets: the <script> tag is at a certain line in the HTML
// We work with the script lines array directly

// Helper: find line index containing a string
function findLine(str, startFrom = 0) {
  for (let i = startFrom; i < lines.length; i++) {
    if (lines[i].includes(str)) return i;
  }
  return -1;
}

// Find all section headers
const sectionHeaders = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '// ============================================================') {
    if (i + 1 < lines.length && i + 2 < lines.length) {
      const next = lines[i + 1].trim();
      const after = lines[i + 2].trim();
      if (next.startsWith('// ') && !next.startsWith('// ==') &&
          after === '// ============================================================') {
        sectionHeaders.push({ line: i, name: next.replace(/^\/\/\s*/, '') });
      }
    }
  }
}

console.log('Section headers found:');
sectionHeaders.forEach(s => console.log(`  Line ${s.line}: ${s.name}`));

// Map section names to mode names and define groupings
// Some modes need to be combined (lava + pointer tracker = lava mode)
const modeDefinitions = [
  // [modeName, startSection, endBeforeSection, initFunc, renderFunc]
  // endBeforeSection is the section header name that starts AFTER this mode ends
];

// Build mode definitions from section headers
// We need to identify which sections are modes vs shared utilities vs infrastructure

const skipSections = new Set([
  'SIMPLEX NOISE (shared utility)',
  'MAIN LOOP',
]);

// Lava is special: it includes the pointer tracker section
// Everything from "LAVA LAMP" to just before "RAIN" is the lava mode (includes pointer tracker)

const modeMap = {};
for (let i = 0; i < sectionHeaders.length; i++) {
  const s = sectionHeaders[i];
  const nextSection = sectionHeaders[i + 1];

  if (skipSections.has(s.name)) continue;
  if (s.name === 'UNIVERSAL POINTER TRACKER') continue; // Part of lava/core

  // Determine mode name from section header
  let modeName = null;
  const nameMap = {
    'LAVA LAMP': 'lava',
    'RAIN': 'rain',
    'WAVES': 'wave',
    'FIRE': 'fire',
    'PLASMA': 'plasma',
    'GAME OF LIFE': 'life',
  };

  if (nameMap[s.name]) {
    modeName = nameMap[s.name];
  } else if (s.name.startsWith('MODE: ')) {
    modeName = s.name.replace('MODE: ', '').split(' ')[0].replace(/[^a-z0-9]/g, '');
  } else {
    // Extract first word or known pattern
    const cleaned = s.name.split(/\s*[—\-]\s*/)[0].trim().toLowerCase();
    const knownModes = {
      'warp': 'warp', 'swirl': 'swirl', 'rift': 'rift', 'voronoi': 'voronoi',
      'bolt': 'bolt', 'moire': 'moire', 'fold': 'fold', 'copper': 'copper',
      'glitch': 'glitch', 'flock': 'flock', 'roto': 'roto', 'erosion': 'erosion',
      'gravity': 'gravity', 'paint': 'paint', 'ripple': 'ripple', 'sand': 'sand',
      'orbit': 'orbit', 'grow': 'grow', 'magnet': 'magnet', 'shatter': 'shatter',
      'pulse': 'pulse', 'worm': 'worm', 'snake': 'snake', 'bloom': 'bloom',
      'fluid': 'fluid', 'spiral': 'spiral', 'cipher': 'cipher', 'aurora': 'aurora',
      'pendulum': 'pendulum', 'diffuse': 'diffuse', 'crystal': 'crystal',
      'static': 'tvstatic', 'crt': 'crt', 'vhs': 'vhs', 'terminal': 'terminal',
      'oscilloscope': 'oscilloscope', 'dial': 'dial',
      'propfont': 'propfont', 'brightmatch': 'brightmatch', 'smoothfluid': 'smoothfluid',
      'vidascii': 'vidascii', 'vidcow': 'vidcow', 'vidscenes': 'vidscenes',
      'vidfootball': 'vidfootball', 'vidclowns': 'vidclowns', 'vidneon': 'vidneon',
      'terrain': 'terrain', 'tunnel': 'tunnel', 'noise': 'noise',
      'interference': 'interference', 'automata': 'automata', 'maze': 'maze',
      'langton': 'langton', 'wave2d': 'wave2d', 'heat': 'heat',
      'lorenz': 'lorenz', 'galaxy': 'galaxy', 'cloth': 'cloth',
      'dla': 'dla', 'slime': 'slime', 'reaction': 'reaction',
      'nbody': 'nbody', 'ants': 'ants', 'strange': 'strange',
      'mandel': 'mandel', 'storm': 'storm', 'starfield': 'starfield',
      'matrix': 'matrix', 'snowfall': 'snowfall', 'firework': 'firework',
      'kaleidoscope': 'kaleidoscope', 'radar': 'radar', 'fountain': 'fountain',
      'coral': 'coral', 'smoke': 'smoke', 'tornado': 'tornado',
      'dna': 'dna', 'circuit': 'circuit', 'rain3d': 'rain3d',
      'boids': 'boids', 'waves3d': 'waves3d', 'tree': 'tree',
      'chem': 'chem', 'typewriter': 'typewriter', 'conway3': 'conway3',
      'wfc': 'wfc',
    };
    modeName = knownModes[cleaned];
  }

  if (!modeName) {
    console.log(`  SKIP unknown section: ${s.name}`);
    continue;
  }

  // For lava, extend to include UNIVERSAL POINTER TRACKER section
  let startLine = s.line;
  let endLine = nextSection ? nextSection.line - 1 : lines.length - 1;

  if (modeName === 'lava') {
    // Include everything up to RAIN section
    const rainSection = sectionHeaders.find(h => h.name === 'RAIN');
    if (rainSection) endLine = rainSection.line - 1;
  }

  modeMap[modeName] = { startLine, endLine, sectionName: s.name };
}

console.log('\nMode mappings:');
for (const [name, info] of Object.entries(modeMap)) {
  console.log(`  ${name}: lines ${info.startLine}-${info.endLine}`);
}

// Now extract each mode
const modesDir = path.join(__dirname, 'src', 'modes');
fs.mkdirSync(modesDir, { recursive: true });

// Also need somnai-specific modes: propfont, brightmatch, smoothfluid
// Check if they're in the section headers
const propfontIdx = sectionHeaders.findIndex(s => s.name.includes('ropfont') || s.name.includes('PROPFONT'));
console.log('\nPropfont section index:', propfontIdx, propfontIdx >= 0 ? sectionHeaders[propfontIdx] : 'not found');

// For modes that aren't found via section headers, search by function name
const missingModes = ['propfont', 'brightmatch', 'smoothfluid'];
for (const mode of missingModes) {
  if (!modeMap[mode]) {
    // Find the init or render function
    const initName = 'init' + mode.charAt(0).toUpperCase() + mode.slice(1);
    const renderName = 'render' + mode.charAt(0).toUpperCase() + mode.slice(1);
    const startLine = findLine('function ' + initName) || findLine('function ' + renderName);
    if (startLine >= 0) {
      console.log(`  Found ${mode} at line ${startLine} (by function search)`);
    }
  }
}

// Write mode files
let writtenModes = 0;

for (const [modeName, info] of Object.entries(modeMap)) {
  // Get the raw code for this section (skip section header comments)
  let codeStart = info.startLine + 3; // Skip 3 header lines
  let codeEnd = info.endLine;

  // Trim empty lines at start/end
  while (codeStart < codeEnd && lines[codeStart].trim() === '') codeStart++;
  while (codeEnd > codeStart && lines[codeEnd].trim() === '') codeEnd--;

  let code = lines.slice(codeStart, codeEnd + 1).join('\n');

  // Remove top-level init calls (e.g., "initBlobs();")
  code = code.replace(/^(init\w+)\(\);\s*$/gm, '// $1(); — called via registerMode');

  // Find init and render functions
  const funcRegex = /function\s+(\w+)\s*\(/g;
  const funcs = [];
  let m;
  while ((m = funcRegex.exec(code)) !== null) funcs.push(m[1]);

  const initFunc = funcs.find(f => f.startsWith('init'));
  const renderFunc = funcs.find(f => f.startsWith('render'));

  if (!renderFunc) {
    // Some modes like lava have render in a different section
    // Check if renderLava exists in the code
    const altRender = funcs.find(f => f.toLowerCase().includes(modeName.toLowerCase().replace(/\d/g, '')));
    if (!altRender) {
      console.log(`  WARNING: ${modeName} has no render function (funcs: ${funcs.join(',')})`);
    }
  }

  // Write the mode file — no import/export transformation needed
  // esbuild IIFE bundling means all top-level vars are shared in the closure
  // We just need registerMode import
  const moduleCode = `import { registerMode } from '../core/registry.js';

${code}

registerMode('${modeName}', {
  init: ${initFunc || 'undefined'},
  render: ${renderFunc || funcs.find(f => f.startsWith('render')) || 'undefined'},
});
`;

  const filePath = path.join(modesDir, modeName + '.js');
  fs.writeFileSync(filePath, moduleCode);
  writtenModes++;
}

console.log(`\nWrote ${writtenModes} mode files`);

// Verify all 92 modes are accounted for
const allModes = [
  'lava', 'rain', 'wave', 'fire', 'plasma', 'life', 'warp', 'swirl', 'rift', 'voronoi',
  'bolt', 'moire', 'fold', 'copper', 'glitch', 'flock', 'roto', 'erosion', 'gravity', 'paint',
  'ripple', 'sand', 'orbit', 'grow', 'magnet', 'shatter', 'pulse', 'worm', 'snake', 'bloom',
  'fluid', 'spiral', 'cipher', 'aurora', 'pendulum', 'diffuse', 'crystal', 'tvstatic', 'crt', 'vhs',
  'terminal', 'oscilloscope', 'dial', 'propfont', 'brightmatch', 'smoothfluid',
  'vidascii', 'vidcow', 'vidscenes', 'vidfootball', 'vidclowns', 'vidneon',
  'terrain', 'tunnel', 'noise', 'interference', 'automata', 'maze', 'langton', 'wave2d',
  'heat', 'lorenz', 'galaxy', 'cloth', 'dla', 'slime', 'reaction', 'nbody', 'ants',
  'strange', 'mandel', 'storm', 'starfield', 'matrix', 'snowfall', 'firework', 'kaleidoscope',
  'radar', 'fountain', 'coral', 'smoke', 'tornado', 'dna', 'circuit', 'rain3d', 'boids',
  'waves3d', 'tree', 'chem', 'typewriter', 'conway3', 'wfc'
];

const missing = allModes.filter(m => !modeMap[m]);
if (missing.length > 0) {
  console.log('\nMISSING modes:', missing.join(', '));
} else {
  console.log('\nAll 92 modes extracted successfully!');
}
