// Mode-to-group mapping for lazy loading (Vite code-splitting).
// Core modes are loaded eagerly; all others are loaded on-demand by group.

var CORE_MODES = [
  'lava', 'rain', 'wave', 'fire', 'plasma', 'life', 'warp', 'swirl',
  'rift', 'voronoi', 'bolt', 'moire', 'fold', 'copper', 'glitch', 'flock',
  'roto', 'erosion', 'gravity', 'paint', 'ripple', 'sand', 'orbit', 'grow',
  'magnet', 'shatter', 'pulse', 'worm', 'snake', 'bloom'
];

var SIMULATION_MODES = [
  'fluid', 'spiral', 'cipher', 'aurora', 'pendulum', 'diffuse', 'crystal',
  'terrain', 'tunnel', 'noise', 'interference', 'automata', 'maze', 'langton',
  'wave2d', 'heat', 'lorenz', 'galaxy', 'cloth', 'dla', 'slime', 'reaction',
  'nbody', 'ants', 'strange', 'mandel', 'storm', 'starfield', 'matrix',
  'snowfall', 'firework', 'kaleidoscope', 'radar', 'fountain', 'coral',
  'smoke', 'tornado', 'dna', 'circuit', 'rain3d', 'boids', 'waves3d',
  'tree', 'chem', 'typewriter', 'conway3', 'wfc', 'metaball', 'heartbeat',
  'bubbles', 'waterfall', 'pixelsort', 'pendwave', 'hexlife', 'bacteria',
  'harmonograph', 'topography', 'lissajous', 'embers', 'eclipse', 'caustics',
  'constellations', 'dissolve', 'tetris', 'highway', 'cityscape', 'ocean',
  'piano', 'clock', 'blackhole', 'fireflies', 'vinyl', 'jellyfish',
  'campfire', 'roots', 'lightning', 'fern', 'waveform', 'neuron', 'hourglass',
  'volcano', 'sonar', 'drops', 'tiles', 'mushroom', 'cascade', 'northern',
  'tidal', 'comet', 'circuit2', 'snakegame', 'asteroids', 'rhythm', 'neonrace',
  'symbiosis', 'blackholes', 'synthwave', 'aquarium', 'raincity',
  'prism', 'phoenix', 'swarm', 'supernova', 'inferno',
  'wavelet', 'infection', 'sandcastle', 'flocking', 'runelore',
  'antfarm', 'gears', 'rainfall', 'mycelium', 'stainedglass',
  'vorospark', 'fractree', 'sierpinski', 'julia', 'vorofire',
  'kochsnow', 'vorostorm', 'spirograph', 'cellspark',
  'nebula', 'vortex', 'aurora3d', 'starfield3d', 'shockwave',
  'plasma3d', 'wormhole', 'quasar', 'fireball', 'cosmos',
  'burning', 'tricorn', 'newton', 'lyapunov', 'phoenixfrac',
  'multibrot', 'magnet2', 'collatz', 'mandeljulia', 'fractalflame',
  'cymatics', 'voxwave', 'tinysurv', 'pebbin', 'forkpick', 'compact',
  'pachinko', 'yohei', 'emptiness', 'flower', 'macroscope'
];

var RETRO_MODES = [
  'tvstatic', 'crt', 'vhs', 'terminal', 'oscilloscope', 'dial', 'propfont',
  'brightmatch', 'smoothfluid'
];

var VIDEO_MODES = [
  'vidascii', 'vidcow', 'vidscenes', 'vidfootball', 'vidclowns', 'vidneon',
  'vidjellyfish', 'vidlava', 'vidcity', 'vidocean', 'vidfireworks',
  'vidgears', 'vidink', 'vidaurora', 'vidgyro', 'vidstars'
];

var ROTO_MODES = [
  'rotozoomer', 'rotowarp', 'rotogrid', 'rotoprism', 'rotospiral',
  'rototunnel', 'rotoplasma', 'rotoflower', 'rotocube', 'rotoscroll',
  'rotodisk'
];

var THREE_MODES = [
  'threeterrain', 'threetunnel', 'threeparticles', 'threeshapes',
  'threefacecube', 'textcube', 'r3fgem',
  'threestorm', 'threevortex', 'threecubes', 'threenebula', 'threewaves',
  'tslblob',
  'tslfire',
  'tslascii',
  'tslascii2',
  'tslmatrix',
  'tslplasma'
];

var WEBCAM_MODES = [
  'cat', 'buttons', 'handpose', 'facemesh', 'webcam', 'facepass',
  'headcube', 'camtrail', 'camhalftone', 'camdepth', 'faceglitch',
  'facepaint', 'facemirror', 'handfire', 'handlaser', 'handgravity', 'handsmash', 'handball', 'fruiteat', 'facebricks', 'facepong', 'story', 'fingercount', 'tilttext', 'photostory', 'sunsmile', 'faceballoon', 'tiltmaze', 'tiltpour', 'cloud'
];

// Build reverse lookup: modeName -> groupName
var modeToGroup = {};
function mapGroup(modes, groupName) {
  for (var i = 0; i < modes.length; i++) {
    modeToGroup[modes[i]] = groupName;
  }
}
mapGroup(CORE_MODES, 'core');
mapGroup(SIMULATION_MODES, 'simulation');
mapGroup(RETRO_MODES, 'retro');
mapGroup(VIDEO_MODES, 'video');
mapGroup(ROTO_MODES, 'roto');
mapGroup(THREE_MODES, 'three');
mapGroup(WEBCAM_MODES, 'webcam');

// Track which groups have been loaded
var loadedGroups = { core: true }; // core is loaded eagerly

// Dynamic import loaders for each group
var groupLoaders = {
  simulation: function() { return import('./groups/simulation.js'); },
  retro: function() { return import('./groups/retro.js'); },
  video: function() { return import('./groups/video.js'); },
  roto: function() { return import('./groups/roto.js'); },
  three: function() { return import('./groups/three.js'); },
  webcam: function() { return import('./groups/webcam.js'); },
};

// In-flight loading promises to avoid double-loading
var loadingPromises = {};

/**
 * Ensure a mode's group is loaded. Returns a promise that resolves
 * when the group is registered. For core modes, resolves immediately.
 */
export function ensureModeLoaded(modeName) {
  var group = modeToGroup[modeName];
  if (!group) {
    // Unknown mode — might already be registered, just resolve
    return Promise.resolve();
  }
  if (loadedGroups[group]) {
    return Promise.resolve();
  }
  if (loadingPromises[group]) {
    return loadingPromises[group];
  }
  var loader = groupLoaders[group];
  if (!loader) {
    return Promise.resolve();
  }
  loadingPromises[group] = loader().then(function() {
    loadedGroups[group] = true;
    delete loadingPromises[group];
  });
  return loadingPromises[group];
}

/**
 * Get the group name for a mode.
 */
export function getModeGroup(modeName) {
  return modeToGroup[modeName] || null;
}

/**
 * Get all known mode names across all groups.
 */
export function getAllKnownModes() {
  return Object.keys(modeToGroup);
}

/**
 * Preload all mode groups (useful if you want everything available).
 */
export function preloadAllGroups() {
  var promises = [];
  for (var group in groupLoaders) {
    if (!loadedGroups[group]) {
      promises.push(ensureModeLoaded(
        // Just pick the first mode from each group to trigger loading
        Object.keys(modeToGroup).filter(function(m) { return modeToGroup[m] === group; })[0]
      ));
    }
  }
  return Promise.all(promises);
}
