import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var dialFreq = 88.0;
var dialTarget = 88.0;
var dialStations = [
  { freq: 91.1, name: 'TEXTFLOW FM', type: 'music' },
  { freq: 95.5, name: 'ASCII RADIO', type: 'talk' },
  { freq: 99.9, name: 'NOISE CORP', type: 'noise' },
  { freq: 103.7, name: 'WAVE STATION', type: 'wave' },
  { freq: 107.3, name: 'SEBLAND FM', type: 'music' },
];

function initDial() {
  dialFreq = 88.0;
  dialTarget = 88.0;
}
// initDial(); — called via registerMode
function renderDial() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  // Drag left/right to tune
  if (pointer.down && state.currentMode === 'dial') {
    dialTarget = 88.0 + (pointer.gx / W) * 20; // 88-108 MHz range
  }
  // Smooth tuning
  dialFreq += (dialTarget - dialFreq) * 0.1;

  // Find closest station
  var closestStation = null;
  var closestDist = 999;
  for (var si = 0; si < dialStations.length; si++) {
    var d = Math.abs(dialFreq - dialStations[si].freq);
    if (d < closestDist) { closestDist = d; closestStation = dialStations[si]; }
  }

  var tuned = closestDist < 0.5;
  var signalStrength = tuned ? Math.max(0, 1 - closestDist / 0.5) : 0;

  // Draw dial background
  var dialY = 4;
  var freqStr = dialFreq.toFixed(1) + ' MHz';
  for (var fi = 0; fi < freqStr.length; fi++) {
    drawChar(freqStr[fi], (W / 2 - freqStr.length / 2 + fi) | 0, dialY, 255, 200, 100, 0.9);
  }

  // Frequency markers
  var markerY = dialY + 2;
  for (var f = 88; f <= 108; f += 1) {
    var mx = ((f - 88) / 20 * (W - 4) + 2) | 0;
    var isMajor = f % 2 === 0;
    drawChar(isMajor ? '|' : '.', mx, markerY, 150, 150, 100, isMajor ? 0.6 : 0.3);
    // Station markers
    for (var ss = 0; ss < dialStations.length; ss++) {
      if (Math.abs(f - dialStations[ss].freq) < 0.5) {
        drawChar('▼', mx, markerY - 1, 255, 100, 100, 0.7);
      }
    }
  }

  // Tuning needle
  var needleX = ((dialFreq - 88) / 20 * (W - 4) + 2) | 0;
  drawChar('▲', needleX, markerY + 1, 255, 255, 100, 0.9);

  // Station name
  if (tuned && closestStation) {
    var nameStr = '[ ' + closestStation.name + ' ]';
    for (var ni = 0; ni < nameStr.length; ni++) {
      var nx = (W / 2 - nameStr.length / 2 + ni) | 0;
      drawChar(nameStr[ni], nx, markerY + 3, 100, 255, 100, signalStrength * 0.9);
    }
  }

  // Audio visualization area
  var vizStart = markerY + 6;
  var vizH = H - vizStart - 2;

  if (tuned && closestStation) {
    // Different visualizations per station type
    if (closestStation.type === 'music') {
      // Frequency bars
      var numBars = 32;
      for (var b = 0; b < numBars; b++) {
        var barX = ((b / numBars) * W) | 0;
        var barW = Math.max(1, (W / numBars - 1) | 0);
        var barH = (Math.sin(b * 0.5 + state.time * 3) * 0.5 + 0.5) * vizH * signalStrength;
        barH *= (Math.sin(b * 1.3 + state.time * 5) * 0.3 + 0.7);
        for (var by = 0; by < barH; by++) {
          var bpy = vizStart + vizH - by;
          if (bpy >= vizStart && bpy < H) {
            var bv = by / vizH;
            for (var bx = 0; bx < barW && barX + bx < W; bx++) {
              drawCharHSL('#', barX + bx, bpy, (120 - bv * 120 + 360) % 360, 70, 20 + bv * 40);
            }
          }
        }
      }
    } else if (closestStation.type === 'wave') {
      // Sine wave
      for (var x = 0; x < W; x++) {
        var wy = Math.sin(x * 0.1 + state.time * 3) * vizH * 0.3 * signalStrength;
        wy += Math.sin(x * 0.05 - state.time * 1.5) * vizH * 0.15;
        var py = (vizStart + vizH / 2 + wy) | 0;
        if (py >= vizStart && py < H) {
          drawCharHSL('~', x, py, (200 + x * 2) % 360, 70, 40 * signalStrength);
        }
      }
    } else if (closestStation.type === 'talk') {
      // Waveform bars
      for (var x = 0; x < W; x++) {
        var amp = Math.abs(Math.sin(x * 0.2 + state.time * 8) * Math.sin(x * 0.07 + state.time * 2)) * vizH * 0.4 * signalStrength;
        var midRow = vizStart + vizH / 2;
        for (var dy = -(amp | 0); dy <= (amp | 0); dy++) {
          var py = (midRow + dy) | 0;
          if (py >= vizStart && py < H) {
            drawChar('|', x, py, 100, (200 * signalStrength) | 0, 100, 0.3 + Math.abs(dy / amp) * 0.5);
          }
        }
      }
    } else {
      // Noise
      for (var y = vizStart; y < H; y++) {
        for (var x = 0; x < W; x++) {
          if (Math.random() < 0.85) continue;
          var nv = Math.random() * signalStrength;
          drawChar('@#$%'[Math.floor(Math.random() * 4)], x, y, (nv * 200) | 0, (nv * 150) | 0, (nv * 100) | 0, nv * 0.6);
        }
      }
    }
  } else {
    // Static noise between stations
    for (var y = vizStart; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (Math.random() < 0.7) continue;
        var nv = Math.random() * 0.3;
        var grey = (nv * 200) | 0;
        drawChar('.', x, y, grey, grey, grey, nv);
      }
    }
  }

  // Signal strength meter
  var meterY = vizStart - 2;
  var meterStr = 'SIGNAL: ';
  var bars = (signalStrength * 10) | 0;
  for (var mi = 0; mi < meterStr.length; mi++) {
    drawChar(meterStr[mi], mi + 2, meterY, 150, 150, 150, 0.6);
  }
  for (var mi = 0; mi < 10; mi++) {
    var ch = mi < bars ? '█' : '░';
    var hue = mi < 3 ? 0 : (mi < 7 ? 60 : 120);
    drawCharHSL(ch, meterStr.length + 2 + mi, meterY, hue, 70, mi < bars ? 40 : 10);
  }
}

registerMode('dial', {
  init: initDial,
  render: renderDial,
});
