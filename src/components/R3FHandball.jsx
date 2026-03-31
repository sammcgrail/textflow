// R3FHandball — React Three Fiber overlay for handball mode
// Renders glowing spheres that follow ball positions from handball.js ballState

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ballState } from '../modes/handball.js';

// Convert normalized screen coords (0-1) to R3F world coords
// Camera at [0,0,5], fov 45
var TAN_HALF_FOV = Math.tan(22.5 * Math.PI / 180);

function toWorldCoords(nx, ny, vw, vh) {
  var worldHeight = 2 * 5 * TAN_HALF_FOV;
  var worldWidth = worldHeight * (vw / vh);
  return {
    x: (nx - 0.5) * worldWidth,
    y: -(ny - 0.5) * worldHeight
  };
}

function hueToColor(hue) {
  var h = hue / 360;
  // HSL to RGB, s=0.9, l=0.55
  var s = 0.9, l = 0.55;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs((h * 6) % 2 - 1));
  var m = l - c / 2;
  var r, g, b;
  var sector = Math.floor(h * 6);
  if (sector === 0) { r = c; g = x; b = 0; }
  else if (sector === 1) { r = x; g = c; b = 0; }
  else if (sector === 2) { r = 0; g = c; b = x; }
  else if (sector === 3) { r = 0; g = x; b = c; }
  else if (sector === 4) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return new THREE.Color(r + m, g + m, b + m);
}

var BALL_HUES = [0, 30, 60, 180, 240, 300];

function Balls() {
  var innerRef = useRef();
  var outerRef = useRef();
  var dummy = useMemo(function() { return new THREE.Object3D(); }, []);

  // Pre-compute ball colors
  var colors = useMemo(function() {
    return BALL_HUES.map(function(h) { return hueToColor(h); });
  }, []);

  // Create materials for outer glow shells per ball
  var innerGeo = useMemo(function() { return new THREE.SphereGeometry(1, 16, 16); }, []);
  var outerGeo = useMemo(function() { return new THREE.SphereGeometry(1, 12, 12); }, []);

  useFrame(function() {
    if (!innerRef.current || !outerRef.current) return;
    var balls = ballState.balls;
    if (!balls || balls.length === 0) return;

    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;

    for (var i = 0; i < balls.length; i++) {
      var ball = balls[i];
      var wc = toWorldCoords(ball.x, ball.y, vw, vh);

      // Inner solid core
      dummy.position.set(wc.x, wc.y, 0);
      var worldR = ball.radius * 2 * 5 * TAN_HALF_FOV;
      dummy.scale.setScalar(worldR);
      dummy.updateMatrix();
      innerRef.current.setMatrixAt(i, dummy.matrix);

      // Color
      var col = colors[i % colors.length];
      innerRef.current.setColorAt(i, col);

      // Outer glow shell (slightly larger, transparent)
      dummy.scale.setScalar(worldR * (1.4 + ball.glow * 0.6));
      dummy.updateMatrix();
      outerRef.current.setMatrixAt(i, dummy.matrix);
      outerRef.current.setColorAt(i, col);
    }

    innerRef.current.instanceMatrix.needsUpdate = true;
    if (innerRef.current.instanceColor) innerRef.current.instanceColor.needsUpdate = true;
    outerRef.current.instanceMatrix.needsUpdate = true;
    if (outerRef.current.instanceColor) outerRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <>
      {/* Solid inner core */}
      <instancedMesh ref={innerRef} args={[innerGeo, null, 6]}>
        <meshStandardMaterial
          emissive="#ffffff"
          emissiveIntensity={0.8}
          metalness={0.3}
          roughness={0.2}
        />
      </instancedMesh>

      {/* Outer glow shell */}
      <instancedMesh ref={outerRef} args={[outerGeo, null, 6]}>
        <meshBasicMaterial
          transparent
          opacity={0.25}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
}

function Trails() {
  var ref = useRef();
  var dummy = useMemo(function() { return new THREE.Object3D(); }, []);
  var MAX_TRAIL = 30; // 5 trail particles per ball
  var trailGeo = useMemo(function() { return new THREE.SphereGeometry(1, 6, 6); }, []);

  // Store previous positions for trail
  var prevPositions = useRef([]);

  var colors = useMemo(function() {
    return BALL_HUES.map(function(h) { return hueToColor(h); });
  }, []);

  useFrame(function() {
    if (!ref.current) return;
    var balls = ballState.balls;
    if (!balls || balls.length === 0) return;

    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;

    // Update trail history
    var prev = prevPositions.current;
    while (prev.length < balls.length) {
      prev.push([]);
    }

    var trailIdx = 0;
    for (var i = 0; i < balls.length; i++) {
      var ball = balls[i];
      var speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      var wc = toWorldCoords(ball.x, ball.y, vw, vh);

      // Only add trail if moving fast enough
      if (speed > 0.003) {
        prev[i].unshift({ x: wc.x, y: wc.y });
      }
      // Limit trail length
      if (prev[i].length > 5) prev[i].length = 5;

      // Render trail particles
      for (var j = 0; j < 5; j++) {
        if (trailIdx >= MAX_TRAIL) break;
        if (j < prev[i].length) {
          var tp = prev[i][j];
          var fade = 1 - (j + 1) / 6;
          dummy.position.set(tp.x, tp.y, 0);
          var worldR = ball.radius * 2 * 5 * TAN_HALF_FOV * fade * 0.5;
          dummy.scale.setScalar(Math.max(0.001, worldR));
          dummy.updateMatrix();
          ref.current.setMatrixAt(trailIdx, dummy.matrix);
          ref.current.setColorAt(trailIdx, colors[i % colors.length]);
        } else {
          // Hide unused trail particle
          dummy.position.set(0, 0, -100);
          dummy.scale.setScalar(0.001);
          dummy.updateMatrix();
          ref.current.setMatrixAt(trailIdx, dummy.matrix);
        }
        trailIdx++;
      }
    }

    // Hide remaining unused slots
    while (trailIdx < MAX_TRAIL) {
      dummy.position.set(0, 0, -100);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      ref.current.setMatrixAt(trailIdx, dummy.matrix);
      trailIdx++;
    }

    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[trailGeo, null, MAX_TRAIL]}>
      <meshBasicMaterial
        transparent
        opacity={0.3}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

export default function R3FHandball({ visible }) {
  if (!visible) return null;

  return (
    <div
      data-mode-overlay="handball"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 5,
        pointerEvents: 'none',
        display: visible ? 'block' : 'none',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}
        style={{ background: 'transparent', pointerEvents: 'none' }}
        events={function() { return { enabled: false, priority: 0 }; }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[0, 0, 4]} intensity={2} />
        <Balls />
        <Trails />
      </Canvas>
    </div>
  );
}
