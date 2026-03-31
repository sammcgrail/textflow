// R3FFacebricks — React Three Fiber overlay for facebricks mode
// Renders 3D bricks, ball, debris, and face-textured cuboid paddle

import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { brickState } from '../modes/facebricks.js';

// Camera at [0,0,5], fov 45
var TAN_HALF_FOV = Math.tan(22.5 * Math.PI / 180);

function toWorld(nx, ny, vw, vh) {
  var worldHeight = 2 * 5 * TAN_HALF_FOV;
  var worldWidth = worldHeight * (vw / vh);
  return {
    x: (nx - 0.5) * worldWidth,
    y: -(ny - 0.5) * worldHeight
  };
}

function toWorldScale(nw, nh, vw, vh) {
  var worldHeight = 2 * 5 * TAN_HALF_FOV;
  var worldWidth = worldHeight * (vw / vh);
  return { w: nw * worldWidth, h: nh * worldHeight };
}

// Precompute row colors
var ROW_COLORS = [
  new THREE.Color().setHSL(0 / 360, 0.8, 0.5),      // red
  new THREE.Color().setHSL(30 / 360, 0.8, 0.5),     // orange
  new THREE.Color().setHSL(55 / 360, 0.8, 0.5),     // yellow
  new THREE.Color().setHSL(140 / 360, 0.8, 0.45),   // green
  new THREE.Color().setHSL(185 / 360, 0.8, 0.45),   // cyan
  new THREE.Color().setHSL(230 / 360, 0.8, 0.5)     // blue
];

var BALL_COLOR = new THREE.Color(1, 0.95, 0.4);

function BrickField() {
  var meshRef = useRef();
  var dummy = useMemo(function() { return new THREE.Object3D(); }, []);
  var MAX_BRICKS = 60;

  useFrame(function() {
    if (!meshRef.current) return;
    var bricks = brickState.bricks;
    if (!bricks || bricks.length === 0) return;

    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;
    var idx = 0;

    for (var i = 0; i < bricks.length && idx < MAX_BRICKS; i++) {
      var b = bricks[i];
      if (!b.alive) {
        dummy.position.set(0, 0, -100);
        dummy.scale.set(0.001, 0.001, 0.001);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(idx, dummy.matrix);
        idx++;
        continue;
      }

      var center = toWorld(b.x + b.width / 2, b.y + b.height / 2, vw, vh);
      var size = toWorldScale(b.width, b.height, vw, vh);

      dummy.position.set(center.x, center.y, 0);
      dummy.scale.set(size.w, size.h, 0.15);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(idx, dummy.matrix);
      meshRef.current.setColorAt(idx, ROW_COLORS[b.row] || ROW_COLORS[0]);
      idx++;
    }

    while (idx < MAX_BRICKS) {
      dummy.position.set(0, 0, -100);
      dummy.scale.set(0.001, 0.001, 0.001);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(idx, dummy.matrix);
      idx++;
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, MAX_BRICKS]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        metalness={0.3}
        roughness={0.4}
        emissive={new THREE.Color(0.15, 0.15, 0.15)}
      />
    </instancedMesh>
  );
}

function FacePaddle() {
  var meshRef = useRef();
  var texRef = useRef(null);
  var canvasRef = useRef(null);

  // Create a canvas to capture webcam face region
  useEffect(function() {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    canvasRef.current = c;
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    texRef.current = tex;
  }, []);

  useFrame(function(frameState) {
    if (!meshRef.current) return;
    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;

    // Position the paddle cuboid
    var pos = toWorld(brickState.paddleX, brickState.paddleY, vw, vh);
    var size = toWorldScale(brickState.paddleWidth, 0.045, vw, vh);

    meshRef.current.position.set(pos.x, pos.y, 0.1);

    // Squish/distort effect — wobble based on ball proximity
    var ball = brickState.ball;
    var dx = Math.abs(ball.x - brickState.paddleX);
    var dy = Math.abs(ball.y - brickState.paddleY);
    var proximity = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 5);
    var squish = 1 + proximity * 0.15 * Math.sin(frameState.clock.elapsedTime * 12);

    meshRef.current.scale.set(size.w * squish, size.h * (2 - squish) * 0.8, 0.2);

    // Slight wobble rotation when face visible
    if (brickState.faceVisible) {
      meshRef.current.rotation.z = Math.sin(frameState.clock.elapsedTime * 2) * 0.03;
      meshRef.current.rotation.x = Math.sin(frameState.clock.elapsedTime * 1.5) * 0.05;
    }

    // Update webcam texture from video
    var video = brickState.webcamVideo;
    if (video && video.readyState >= 2 && canvasRef.current && texRef.current) {
      var ctx = canvasRef.current.getContext('2d');
      var fb = brickState.faceBounds;

      // Crop face region from video and draw to canvas (mirror X for selfie)
      var vw2 = video.videoWidth || 640;
      var vh2 = video.videoHeight || 480;
      var sx = (1 - fb.maxX) * vw2;  // mirror X
      var sy = fb.minY * vh2;
      var sw = (fb.maxX - fb.minX) * vw2;
      var sh = (fb.maxY - fb.minY) * vh2;

      if (sw > 10 && sh > 10) {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 128, 64);
        texRef.current.needsUpdate = true;
      }
    }

    // Update material
    if (meshRef.current.material && texRef.current) {
      meshRef.current.material.map = texRef.current;
      meshRef.current.material.needsUpdate = true;
    }

    meshRef.current.visible = brickState.faceVisible;
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={new THREE.Color(1, 0.9, 0.7)}
        emissive={new THREE.Color(0.2, 0.15, 0.1)}
        emissiveIntensity={0.4}
        metalness={0.1}
        roughness={0.6}
      />
    </mesh>
  );
}

function Ball() {
  var meshRef = useRef();
  var glowRef = useRef();

  useFrame(function(frameState) {
    if (!meshRef.current) return;
    var ball = brickState.ball;
    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;
    var pos = toWorld(ball.x, ball.y, vw, vh);
    var worldHeight = 2 * 5 * TAN_HALF_FOV;
    var r = ball.radius * worldHeight * 1.5;

    meshRef.current.position.set(pos.x, pos.y, 0.1);
    meshRef.current.scale.setScalar(r);
    meshRef.current.visible = true;

    if (glowRef.current) {
      glowRef.current.position.set(pos.x, pos.y, 0.05);
      var pulse = 1 + Math.sin(frameState.clock.elapsedTime * 8) * 0.15;
      glowRef.current.scale.setScalar(r * 2.5 * pulse);
      glowRef.current.visible = true;
    }
  });

  return (
    <>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial
          color={BALL_COLOR}
          emissive={BALL_COLOR}
          emissiveIntensity={0.6}
          metalness={0.2}
          roughness={0.3}
        />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color={BALL_COLOR}
          transparent
          opacity={0.15}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

function DebrisParticles() {
  var meshRef = useRef();
  var dummy = useMemo(function() { return new THREE.Object3D(); }, []);
  var MAX_DEBRIS = 80;
  var tempColor = useMemo(function() { return new THREE.Color(); }, []);

  useFrame(function() {
    if (!meshRef.current) return;
    var debris = brickState.debris;
    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;
    var idx = 0;

    for (var i = 0; i < debris.length && idx < MAX_DEBRIS; i++) {
      var d = debris[i];
      var pos = toWorld(d.x, d.y, vw, vh);
      var alpha = d.life / 50;
      var s = 0.03 + alpha * 0.05;

      dummy.position.set(pos.x, pos.y, 0.05);
      dummy.scale.setScalar(s);
      dummy.rotation.set(d.life * 0.3, d.life * 0.5, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(idx, dummy.matrix);
      tempColor.setHSL(d.hue / 360, 0.8, 0.3 + alpha * 0.4);
      meshRef.current.setColorAt(idx, tempColor);
      idx++;
    }

    while (idx < MAX_DEBRIS) {
      dummy.position.set(0, 0, -100);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(idx, dummy.matrix);
      idx++;
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, MAX_DEBRIS]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        transparent
        opacity={0.8}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

export default function R3FFacebricks({ visible }) {
  if (!visible) return null;

  return (
    <div
      data-mode-overlay="facebricks"
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
        <pointLight position={[0, 2, 4]} intensity={2} />
        <pointLight position={[-3, -1, 3]} intensity={0.8} color="#4488ff" />
        <BrickField />
        <FacePaddle />
        <Ball />
        <DebrisParticles />
      </Canvas>
    </div>
  );
}
