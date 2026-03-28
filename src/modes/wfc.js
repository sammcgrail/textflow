import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var wfcGrid, wfcW, wfcH, wfcGW, wfcGH, wfcTiles, wfcQueue, wfcDone, wfcTimer;
var WFC_TILES = [' ', '.', '-', '|', '+', '#', '=', '~', ':', '*'];
function initWfc() {
  wfcW = state.COLS; wfcH = state.ROWS;
  wfcGW = Math.min(wfcW, 60); wfcGH = Math.min(wfcH, 40);
  wfcGrid = new Int8Array(wfcGW * wfcGH);
  for (var i = 0; i < wfcGrid.length; i++) wfcGrid[i] = -1; // -1 = uncollapsed
  wfcQueue = [];
  wfcDone = false;
  wfcTimer = 0;
  // Collapse first cell
  var sx = (wfcGW * 0.5) | 0, sy = (wfcGH * 0.5) | 0;
  wfcGrid[sy * wfcGW + sx] = (Math.random() * WFC_TILES.length) | 0;
  wfcAddNeighbors(sx, sy);
}
// initWfc(); — called via registerMode
function wfcAddNeighbors(x, y) {
  var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  for (var d = 0; d < 4; d++) {
    var nx = x + dirs[d][0], ny = y + dirs[d][1];
    if (nx >= 0 && nx < wfcGW && ny >= 0 && ny < wfcGH && wfcGrid[ny * wfcGW + nx] === -1) {
      var already = false;
      for (var q = 0; q < wfcQueue.length; q++) {
        if (wfcQueue[q].x === nx && wfcQueue[q].y === ny) { already = true; break; }
      }
      if (!already) wfcQueue.push({ x: nx, y: ny });
    }
  }
}

function renderWfc() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (wfcW !== W || wfcH !== H) initWfc();
  wfcTimer += 0.016;
  // Click to seed collapse at pointer — creates a new collapse origin
  if (pointer.clicked && state.currentMode === 'wfc') {
    pointer.clicked = false;
    var ox2 = ((W - wfcGW) * 0.5) | 0;
    var oy2 = ((H - wfcGH) * 0.5) | 0;
    var cx = (pointer.gx - ox2) | 0, cy = (pointer.gy - oy2) | 0;
    if (cx >= 0 && cx < wfcGW && cy >= 0 && cy < wfcGH) {
      // Collapse a 5x5 area around click with a random tile
      var seedTile = (Math.random() * WFC_TILES.length) | 0;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < wfcGW && ny >= 0 && ny < wfcGH) {
            wfcGrid[ny * wfcGW + nx] = seedTile;
            wfcAddNeighbors(nx, ny);
          }
        }
      }
    }
  }
  // Hold to disrupt — erase cells around pointer
  if (pointer.down && state.currentMode === 'wfc') {
    var ox2 = ((W - wfcGW) * 0.5) | 0;
    var oy2 = ((H - wfcGH) * 0.5) | 0;
    var cx = (pointer.gx - ox2) | 0, cy = (pointer.gy - oy2) | 0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < wfcGW && ny >= 0 && ny < wfcGH && wfcGrid[ny * wfcGW + nx] >= 0) {
          wfcGrid[ny * wfcGW + nx] = -1;
          wfcDone = false;
          wfcAddNeighbors(nx, ny);
        }
      }
    }
  }
  // Collapse a few cells per frame
  var steps = Math.min(wfcQueue.length, 5);
  for (var s = 0; s < steps; s++) {
    if (wfcQueue.length === 0) { wfcDone = true; break; }
    // Pick lowest entropy (random for simplicity)
    var idx = (Math.random() * wfcQueue.length) | 0;
    var cell = wfcQueue[idx];
    wfcQueue.splice(idx, 1);
    if (wfcGrid[cell.y * wfcGW + cell.x] !== -1) continue;
    // Look at neighbors to constrain
    var neighborTiles = [];
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (var d = 0; d < 4; d++) {
      var nx = cell.x + dirs[d][0], ny = cell.y + dirs[d][1];
      if (nx >= 0 && nx < wfcGW && ny >= 0 && ny < wfcGH && wfcGrid[ny * wfcGW + nx] >= 0) {
        neighborTiles.push(wfcGrid[ny * wfcGW + nx]);
      }
    }
    // Weighted selection: prefer similar tiles to neighbors
    var chosen;
    if (neighborTiles.length > 0 && Math.random() < 0.6) {
      chosen = neighborTiles[(Math.random() * neighborTiles.length) | 0];
      if (Math.random() < 0.3) chosen = (chosen + ((Math.random() < 0.5) ? 1 : -1) + WFC_TILES.length) % WFC_TILES.length;
    } else {
      chosen = (Math.random() * WFC_TILES.length) | 0;
    }
    wfcGrid[cell.y * wfcGW + cell.x] = chosen;
    wfcAddNeighbors(cell.x, cell.y);
  }
  // Reset when done
  if (wfcDone && wfcTimer > 3) initWfc();
  // Draw
  var ox = ((W - wfcGW) * 0.5) | 0;
  var oy = ((H - wfcGH) * 0.5) | 0;
  for (var y = 0; y < wfcGH; y++) {
    for (var x = 0; x < wfcGW; x++) {
      var val = wfcGrid[y * wfcGW + x];
      var px = ox + x, py = oy + y;
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      if (val === -1) {
        // Uncollapsed — show entropy shimmer
        var v = Math.sin(x * 0.5 + y * 0.3 + state.time * 3) * 0.3 + 0.3;
        if (v < 0.02) continue;
        drawChar('.', px, py, 40, 40, 60, v);
      } else {
        var ch = WFC_TILES[val];
        var hue = (val * 36 + state.time * 10) % 360;
        drawCharHSL(ch, px, py, hue | 0, 60, 40);
      }
    }
  }
}

registerMode('wfc', {
  init: initWfc,
  render: renderWfc,
});
