import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// forkpick — a git-log cherry-pick visualization. A horizontal "main"
// trunk runs through the middle. Several branch lanes above and below.
// Commits (small orbs) drift leftward along each branch. Periodically a
// commit is "cherry-picked": it leaps in a parabolic arc from one lane
// to another, landing with a little splash. Forks open (diagonal line
// from trunk to branch) and merges close them. Click anywhere to drop
// a cherry-pick arc from the nearest lane to the pointer.

var fpBranches = null;   // per-lane state: { y, active, hue, age }
var fpCommits = null;    // { lane, x, ch, hue, life }
var fpCherries = null;   // arcs: { sx, sy, ex, ey, t, dur, hue }
var fpMerges = null;     // transient merge lines: { fromLane, toLane, x, life }
var fpW = 0, fpH = 0;
var fpTrunkY = 0;
var fpLaneYs = null;     // [y0, y1, ...] for each lane
var fpSpawnTimer = 0;
var fpPickTimer = 0;
var fpForkTimer = 0;

var COMMIT_CHARS = ['●', '○', '•', '◉', '◎'];
var CHERRY_CH = '♥';
var BRANCH_HUES = [200, 140, 50, 330, 270, 180, 30, 100];

function initForkpick() {
  fpW = state.COLS;
  fpH = state.ROWS;
  fpTrunkY = (fpH / 2) | 0;
  fpCommits = [];
  fpCherries = [];
  fpMerges = [];
  // 6 lanes: 3 above, 3 below (plus trunk at center)
  fpLaneYs = [
    fpTrunkY - 6,
    fpTrunkY - 4,
    fpTrunkY - 2,
    fpTrunkY,      // trunk
    fpTrunkY + 2,
    fpTrunkY + 4,
    fpTrunkY + 6,
  ];
  fpBranches = fpLaneYs.map(function(y, i) {
    return {
      y: y,
      isTrunk: i === 3,
      active: i === 3 || Math.random() < 0.7,
      hue: i === 3 ? 40 : BRANCH_HUES[(Math.random() * BRANCH_HUES.length) | 0],
      age: Math.random() * 5,
    };
  });
  // force all 7 lanes active for a dense pre-seed look
  for (var bi = 0; bi < fpBranches.length; bi++) fpBranches[bi].active = true;
  fpSpawnTimer = 0;
  fpPickTimer = 0.4;
  fpForkTimer = 2.0;
  // pre-seed DENSE commits scattered across each active lane
  for (var li = 0; li < fpBranches.length; li++) {
    if (!fpBranches[li].active) continue;
    var density = fpBranches[li].isTrunk ? 0.55 : 0.40;
    for (var x = 0; x < fpW; x++) {
      if (Math.random() < density) {
        fpCommits.push({
          lane: li,
          x: x,
          ch: COMMIT_CHARS[(Math.random() * COMMIT_CHARS.length) | 0],
          hue: fpBranches[li].hue + (Math.random() - 0.5) * 20,
          life: 1,
        });
      }
    }
  }
  // pre-seed several cherry arcs in flight (more than before)
  for (var c = 0; c < 7; c++) {
    var sL = (Math.random() * fpBranches.length) | 0;
    var eL = (Math.random() * fpBranches.length) | 0;
    if (sL === eL) eL = (eL + 1) % fpBranches.length;
    fpCherries.push({
      sx: Math.random() * fpW,
      sy: fpLaneYs[sL],
      ex: Math.random() * fpW,
      ey: fpLaneYs[eL],
      t: Math.random() * 0.9,
      dur: 1.2 + Math.random() * 0.6,
      hue: 340 + Math.random() * 15,
    });
  }
}

function spawnCommit(laneIdx, fromRight) {
  if (laneIdx < 0 || laneIdx >= fpBranches.length) return;
  var b = fpBranches[laneIdx];
  if (!b.active) return;
  fpCommits.push({
    lane: laneIdx,
    x: fromRight ? fpW + 1 : (Math.random() * fpW),
    ch: COMMIT_CHARS[(Math.random() * COMMIT_CHARS.length) | 0],
    hue: b.hue + (Math.random() - 0.5) * 20,
    life: 1,
  });
}

function startCherryPick(srcLane, tgtLane, sx) {
  if (srcLane < 0 || srcLane >= fpBranches.length) return;
  if (tgtLane < 0 || tgtLane >= fpBranches.length) return;
  if (!fpBranches[srcLane].active || !fpBranches[tgtLane].active) return;
  fpCherries.push({
    sx: sx,
    sy: fpLaneYs[srcLane],
    ex: sx - 4 - Math.random() * 10,
    ey: fpLaneYs[tgtLane],
    t: 0,
    dur: 1.0 + Math.random() * 0.6,
    hue: 340 + Math.random() * 15,
  });
}

function renderForkpick() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!fpBranches || fpW !== W || fpH !== H) initForkpick();

  var t = state.time;
  var dt = 1 / 60;

  // Click: drop a cherry from a random active lane to the pointer column
  if (pointer.clicked && state.currentMode === 'forkpick') {
    pointer.clicked = false;
    var activeLanes = [];
    for (var li = 0; li < fpBranches.length; li++) {
      if (fpBranches[li].active) activeLanes.push(li);
    }
    if (activeLanes.length >= 2) {
      var src = activeLanes[(Math.random() * activeLanes.length) | 0];
      // target is closest lane to pointer y
      var py = pointer.gy;
      var best = activeLanes[0], bestD = 1e9;
      for (var ai = 0; ai < activeLanes.length; ai++) {
        var L = activeLanes[ai];
        if (L === src) continue;
        var d = Math.abs(fpLaneYs[L] - py);
        if (d < bestD) { bestD = d; best = L; }
      }
      startCherryPick(src, best, pointer.gx);
      // also spawn a few commits on the src lane near the click for flavor
      for (var k = 0; k < 3; k++) {
        fpCommits.push({
          lane: src,
          x: pointer.gx + (Math.random() - 0.5) * 6,
          ch: COMMIT_CHARS[(Math.random() * COMMIT_CHARS.length) | 0],
          hue: fpBranches[src].hue,
          life: 1,
        });
      }
    }
  }

  // Drag spawns commits under pointer
  if (pointer.down && state.currentMode === 'forkpick') {
    if (Math.random() < 0.3) {
      var py2 = pointer.gy;
      var best2 = 0, bd = 1e9;
      for (var li2 = 0; li2 < fpBranches.length; li2++) {
        if (!fpBranches[li2].active) continue;
        var dd = Math.abs(fpLaneYs[li2] - py2);
        if (dd < bd) { bd = dd; best2 = li2; }
      }
      fpCommits.push({
        lane: best2,
        x: pointer.gx,
        ch: COMMIT_CHARS[(Math.random() * COMMIT_CHARS.length) | 0],
        hue: fpBranches[best2].hue,
        life: 1,
      });
    }
  }

  // Periodic commit spawn — right edge, random active lane
  fpSpawnTimer -= dt;
  if (fpSpawnTimer <= 0) {
    fpSpawnTimer = 0.25 + Math.random() * 0.25;
    var lane = (Math.random() * fpBranches.length) | 0;
    spawnCommit(lane, true);
  }

  // Periodic cherry-pick
  fpPickTimer -= dt;
  if (fpPickTimer <= 0) {
    fpPickTimer = 1.5 + Math.random() * 2.0;
    var actives = [];
    for (var li3 = 0; li3 < fpBranches.length; li3++) {
      if (fpBranches[li3].active) actives.push(li3);
    }
    if (actives.length >= 2) {
      var s = actives[(Math.random() * actives.length) | 0];
      var e = actives[(Math.random() * actives.length) | 0];
      while (e === s) e = actives[(Math.random() * actives.length) | 0];
      startCherryPick(s, e, Math.random() * (W - 10) + 5);
    }
  }

  // Periodic fork / merge
  fpForkTimer -= dt;
  if (fpForkTimer <= 0) {
    fpForkTimer = 3.0 + Math.random() * 4.0;
    // toggle a non-trunk lane
    var candidates = [];
    for (var li4 = 0; li4 < fpBranches.length; li4++) {
      if (!fpBranches[li4].isTrunk) candidates.push(li4);
    }
    var pick = candidates[(Math.random() * candidates.length) | 0];
    fpBranches[pick].active = !fpBranches[pick].active;
    if (fpBranches[pick].active) {
      fpBranches[pick].hue = BRANCH_HUES[(Math.random() * BRANCH_HUES.length) | 0];
      // merge line from trunk to new lane (fork open)
      fpMerges.push({
        fromLane: 3,
        toLane: pick,
        x: W - 2,
        life: 0.8,
      });
    } else {
      // merge line from lane back to trunk
      fpMerges.push({
        fromLane: pick,
        toLane: 3,
        x: 2,
        life: 0.8,
      });
    }
  }

  // Update commits — drift leftward, fade when off screen
  for (var i = fpCommits.length - 1; i >= 0; i--) {
    var cm = fpCommits[i];
    var speed = fpBranches[cm.lane].isTrunk ? 0.55 : 0.4 + Math.random() * 0.2;
    cm.x -= speed;
    if (cm.x < -2) { fpCommits.splice(i, 1); continue; }
  }

  // Update cherries
  for (var ci = fpCherries.length - 1; ci >= 0; ci--) {
    var ch = fpCherries[ci];
    ch.t += dt;
    if (ch.t >= ch.dur) {
      // landing splash: spawn commit at landing site on target lane
      var tgtLaneIdx = -1;
      for (var li5 = 0; li5 < fpLaneYs.length; li5++) {
        if (fpLaneYs[li5] === ch.ey) { tgtLaneIdx = li5; break; }
      }
      if (tgtLaneIdx >= 0) {
        fpCommits.push({
          lane: tgtLaneIdx,
          x: ch.ex,
          ch: '◉',
          hue: ch.hue,
          life: 1,
        });
      }
      fpCherries.splice(ci, 1);
    }
  }

  // Update merges (transient)
  for (var mi = fpMerges.length - 1; mi >= 0; mi--) {
    fpMerges[mi].life -= dt;
    if (fpMerges[mi].life <= 0) fpMerges.splice(mi, 1);
  }

  // ---- RENDER ----

  // Draw branch lines (only active lanes) — pale dashed
  for (var li6 = 0; li6 < fpBranches.length; li6++) {
    var b = fpBranches[li6];
    if (!b.active) continue;
    var y = b.y;
    if (y < 0 || y >= H) continue;
    var isTrunk = b.isTrunk;
    for (var x = 0; x < W; x++) {
      var dashCh;
      if (isTrunk) {
        dashCh = '=';
      } else {
        // solid dash line, not ghosted
        dashCh = ((x + (t * 4) | 0) % 2) === 0 ? '-' : '·';
      }
      var lineL = isTrunk ? 40 : 30;
      drawCharHSL(dashCh, x, y, b.hue | 0, isTrunk ? 50 : 55, lineL);
    }
  }

  // Draw fork/merge arcs — connect trunk & lane at x position
  for (var mi2 = 0; mi2 < fpMerges.length; mi2++) {
    var m = fpMerges[mi2];
    var y1 = fpLaneYs[m.fromLane];
    var y2 = fpLaneYs[m.toLane];
    var lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    var xi = m.x | 0;
    var alpha = m.life / 0.8;
    for (var yy = lo; yy <= hi; yy++) {
      if (yy < 0 || yy >= H || xi < 0 || xi >= W) continue;
      var cch = yy === lo || yy === hi ? '+' : '|';
      drawCharHSL(cch, xi, yy, 45, 80, 40 + alpha * 20);
    }
  }

  // Draw commits
  for (var i2 = 0; i2 < fpCommits.length; i2++) {
    var cc = fpCommits[i2];
    var cx = cc.x | 0;
    var cy = fpLaneYs[cc.lane];
    if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
    var isTr = fpBranches[cc.lane].isTrunk;
    var baseL = isTr ? 65 : 55;
    drawCharHSL(cc.ch, cx, cy, cc.hue | 0, 70, baseL);
  }

  // Draw cherries (arcs)
  for (var ci2 = 0; ci2 < fpCherries.length; ci2++) {
    var ch2 = fpCherries[ci2];
    var p = ch2.t / ch2.dur;
    if (p < 0 || p > 1) continue;
    var nx = ch2.sx + (ch2.ex - ch2.sx) * p;
    // parabolic arc — peak above halfway
    var arcH = Math.abs(ch2.sy - ch2.ey) * 0.8 + 3;
    var yLin = ch2.sy + (ch2.ey - ch2.sy) * p;
    var ny = yLin - Math.sin(p * Math.PI) * arcH;
    var nxi = nx | 0, nyi = ny | 0;
    if (nxi >= 0 && nxi < W && nyi >= 0 && nyi < H) {
      drawCharHSL(CHERRY_CH, nxi, nyi, ch2.hue | 0, 95, 65);
    }
    // trail behind
    for (var tk = 1; tk <= 4; tk++) {
      var pt = p - tk * 0.04;
      if (pt < 0) break;
      var tx = ch2.sx + (ch2.ex - ch2.sx) * pt;
      var tyLin = ch2.sy + (ch2.ey - ch2.sy) * pt;
      var ty = tyLin - Math.sin(pt * Math.PI) * arcH;
      var txi = tx | 0, tyi = ty | 0;
      if (txi >= 0 && txi < W && tyi >= 0 && tyi < H) {
        drawCharHSL('.', txi, tyi, ch2.hue | 0, 80, 40 - tk * 7);
      }
    }
  }

  // label — bottom-right, clear of mobile nav
  var label = 'forkpick';
  for (var i3 = 0; i3 < label.length; i3++) {
    drawCharHSL(label[i3], W - label.length - 1 + i3, H - 2, 340, 70, 55);
  }
}

registerMode('forkpick', { init: initForkpick, render: renderForkpick });
