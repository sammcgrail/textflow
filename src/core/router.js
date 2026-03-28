import { getRenderers } from './registry.js';

export function getModeFromPath() {
  var renderers = getRenderers();
  var path = window.location.pathname.replace(/\/+$/, '');
  var parts = path.split('/');
  var last = parts[parts.length - 1];
  if (last && renderers[last]) return last;
  return getRandomMode();
}

export function updateURL(mode) {
  var renderers = getRenderers();
  var base = window.location.pathname.replace(/\/+$/, '').split('/');
  if (base.length > 1 && renderers[base[base.length - 1]]) base.pop();
  var newPath = base.join('/') + '/' + mode;
  history.replaceState(null, '', newPath);
}

export function getRandomMode() {
  var renderers = getRenderers();
  var modeKeys = Object.keys(renderers);
  var filtered = modeKeys.filter(function(m) { return m !== 'vidascii'; });
  return filtered[Math.floor(Math.random() * filtered.length)];
}
