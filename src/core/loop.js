// loop.js — Legacy loop/switchMode are now in engine.js.
// Only scrollNavToMode remains here for the legacy entry path.

export function scrollNavToMode(mode, instant) {
  var container = document.querySelector('.nav-buttons');
  var btn = container.querySelector('button[data-mode="' + mode + '"]');
  if (!btn) return;
  var containerWidth = container.clientWidth;
  var btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
  var scrollTarget = btnCenter - containerWidth / 2;
  scrollTarget = Math.max(0, Math.min(scrollTarget, container.scrollWidth - containerWidth));
  container.scrollTo({ left: scrollTarget, behavior: instant ? 'instant' : 'smooth' });
}
