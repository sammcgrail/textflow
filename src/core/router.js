import { getRenderers } from './registry.js';
import { getAllKnownModes } from '../modes/modeGroups.js';

export function getModeFromPath() {
  var path = window.location.pathname.replace(/\/+$/, '');
  var parts = path.split('/');
  var last = parts[parts.length - 1];
  if (!last) return getRandomMode();
  // Check registered modes first (fast path for core modes)
  var renderers = getRenderers();
  if (renderers[last]) return last;
  // Check all known modes including lazy-loaded groups
  var allModes = getAllKnownModes();
  if (allModes.indexOf(last) !== -1) return last;
  return getRandomMode();
}

export function updateURL(mode) {
  var renderers = getRenderers();
  var allModes = getAllKnownModes();
  var base = window.location.pathname.replace(/\/+$/, '').split('/');
  var tail = base[base.length - 1];
  if (base.length > 1 && (renderers[tail] || allModes.indexOf(tail) !== -1)) base.pop();
  var newPath = base.join('/') + '/' + mode;
  history.replaceState(null, '', newPath);
}

export function getRandomMode() {
  var renderers = getRenderers();
  var modeKeys = Object.keys(renderers);
  var filtered = modeKeys.filter(function(m) { return m !== 'vidascii'; });
  return filtered[Math.floor(Math.random() * filtered.length)];
}
