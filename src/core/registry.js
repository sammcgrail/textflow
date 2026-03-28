// Mode registry — modes register themselves, replacing the massive if-chains
var modes = {};

export function registerMode(name, { init, render, attach }) {
  modes[name] = { init: init || function(){}, render: render, attach: attach || function(){} };
}

export function getMode(name) {
  return modes[name];
}

export function getAllModeNames() {
  return Object.keys(modes);
}

export function getRenderers() {
  var r = {};
  for (var name in modes) {
    r[name] = modes[name].render;
  }
  return r;
}
