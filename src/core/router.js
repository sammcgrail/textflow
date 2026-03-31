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

var isFirstUpdate = true;
var popstateCallback = null;
var isPopstateNavigation = false;

export function updateURL(mode) {
  var renderers = getRenderers();
  var allModes = getAllKnownModes();
  var base = window.location.pathname.replace(/\/+$/, '').split('/');
  var tail = base[base.length - 1];
  if (base.length > 1 && (renderers[tail] || allModes.indexOf(tail) !== -1)) base.pop();
  var newPath = base.join('/') + '/' + mode;
  var title = 'textflow \u2014 ' + mode;
  document.title = title;
  // During popstate (back/forward), don't push a new entry — the URL is already correct
  if (isPopstateNavigation) {
    // Just update title and meta, don't touch history
  } else if (isFirstUpdate) {
    history.replaceState({ mode: mode }, title, newPath);
    isFirstUpdate = false;
  } else {
    history.pushState({ mode: mode }, title, newPath);
  }
  // Update og:title meta tag for Safari share sheet / social previews
  var ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
  var twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute('content', title);
}

/**
 * Register a callback for popstate (back/forward navigation).
 * The callback receives the mode name to switch to.
 */
export function onPopState(callback) {
  popstateCallback = callback;
  window.addEventListener('popstate', function(e) {
    var mode = null;
    if (e.state && e.state.mode) {
      mode = e.state.mode;
    } else {
      // Extract mode from URL path
      mode = getModeFromPath();
    }
    if (mode && popstateCallback) {
      isPopstateNavigation = true;
      // popstateCallback may return a Promise (lazy-loaded modes)
      var result = popstateCallback(mode);
      if (result && result.then) {
        result.then(function() { isPopstateNavigation = false; });
      } else {
        isPopstateNavigation = false;
      }
    }
  });
}

export function getRandomMode() {
  var renderers = getRenderers();
  var modeKeys = Object.keys(renderers);
  var filtered = modeKeys.filter(function(m) { return m !== 'vidascii'; });
  return filtered[Math.floor(Math.random() * filtered.length)];
}
