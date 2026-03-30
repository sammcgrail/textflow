// Mode registry — modes register themselves, replacing the massive if-chains
var modes = {};
var renderersCache = null;

export function registerMode(name, { init, render, attach, cleanup }) {
  modes[name] = { init: init || function(){}, render: render, attach: attach || function(){}, cleanup: cleanup || function(){} };
  renderersCache = null; // invalidate on registration
}

export function getMode(name) {
  return modes[name];
}

export function getAllModeNames() {
  return Object.keys(modes);
}

export function getRenderers() {
  if (renderersCache) return renderersCache;
  var r = {};
  for (var name in modes) {
    r[name] = modes[name].render;
  }
  renderersCache = r;
  return r;
}
