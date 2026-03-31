// R3FFaceballoon — React Three Fiber overlay for faceballoon mode
// Hot air balloon with face texture, floating through a sunset

import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { balloonState } from '../modes/faceballoon.js';

var TAN_HALF_FOV = Math.tan(22.5 * Math.PI / 180);

function BalloonEnvelope() {
  var meshRef = useRef();
  var texRef = useRef(null);
  var canvasRef = useRef(null);
  var deflateRef = useRef(1);

  useEffect(function() {
    var c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    canvasRef.current = c;
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    texRef.current = tex;
  }, []);

  useFrame(function(frameState) {
    if (!meshRef.current) return;
    var elapsed = frameState.clock.elapsedTime;

    // Inflate/deflate based on face visibility
    var targetScale = balloonState.faceVisible ? 1 : 0.4;
    deflateRef.current += (targetScale - deflateRef.current) * 0.02;
    var inflate = deflateRef.current;

    // Gentle floating motion
    var floatY = Math.sin(elapsed * 0.5) * 0.15;
    var floatX = Math.sin(elapsed * 0.3) * 0.1;
    var driftX = Math.sin(elapsed * 0.08) * 0.3;

    // Face-based tilt
    var tiltZ = (balloonState.faceX - 0.5) * -0.4;
    var tiltX = (balloonState.faceY - 0.5) * 0.2;

    // Position balloon in upper-center area
    meshRef.current.position.set(
      driftX + floatX,
      0.8 + floatY + (1 - inflate) * -1.5,
      0
    );
    meshRef.current.scale.set(
      1.0 * inflate,
      1.3 * inflate,
      1.0 * inflate
    );
    meshRef.current.rotation.set(
      tiltX + Math.sin(elapsed * 0.7) * 0.03,
      elapsed * 0.1,
      tiltZ + Math.sin(elapsed * 0.4) * 0.02
    );

    // Update face texture from webcam
    var video = balloonState.webcamVideo;
    if (video && video.readyState >= 2 && canvasRef.current && texRef.current) {
      var ctx = canvasRef.current.getContext('2d');
      var fb = balloonState.faceBounds;

      if (fb) {
        var vw = video.videoWidth || 640;
        var vh = video.videoHeight || 480;
        var sx = (1 - fb.maxX) * vw;
        var sy = fb.minY * vh;
        var sw = (fb.maxX - fb.minX) * vw;
        var sh = (fb.maxY - fb.minY) * vh;

        if (sw > 10 && sh > 10) {
          // Draw face stretched over entire canvas (smushed effect)
          ctx.save();
          ctx.clearRect(0, 0, 256, 256);

          // Circular mask for balloon shape
          ctx.beginPath();
          ctx.arc(128, 128, 128, 0, Math.PI * 2);
          ctx.clip();

          // Stretch face to fill — creates the smushed look
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 256, 256);

          // Add slight warm tint overlay
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = '#ff8844';
          ctx.fillRect(0, 0, 256, 256);

          ctx.restore();
          texRef.current.needsUpdate = true;
        }
      }
    }

    // Update material
    if (meshRef.current.material && texRef.current) {
      meshRef.current.material.map = texRef.current;
      meshRef.current.material.needsUpdate = true;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.7, 32, 32]} />
      <meshStandardMaterial
        color={new THREE.Color(1.0, 0.85, 0.7)}
        emissive={new THREE.Color(0.15, 0.08, 0.02)}
        emissiveIntensity={0.3}
        metalness={0.05}
        roughness={0.7}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Basket() {
  var meshRef = useRef();
  var deflateRef = useRef(1);

  useFrame(function(frameState) {
    if (!meshRef.current) return;
    var elapsed = frameState.clock.elapsedTime;

    var targetScale = balloonState.faceVisible ? 1 : 0.4;
    deflateRef.current += (targetScale - deflateRef.current) * 0.02;
    var inflate = deflateRef.current;

    var floatY = Math.sin(elapsed * 0.5) * 0.15;
    var floatX = Math.sin(elapsed * 0.3) * 0.1;
    var driftX = Math.sin(elapsed * 0.08) * 0.3;

    // Basket hangs below balloon
    meshRef.current.position.set(
      driftX + floatX,
      0.8 + floatY - 1.15 * inflate + (1 - inflate) * -1.5,
      0
    );
    meshRef.current.scale.set(0.25 * inflate, 0.2 * inflate, 0.25 * inflate);

    var tiltZ = (balloonState.faceX - 0.5) * -0.3;
    meshRef.current.rotation.set(0, elapsed * 0.1, tiltZ * 0.5);
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={new THREE.Color(0.45, 0.28, 0.1)}
        roughness={0.9}
        metalness={0.05}
      />
    </mesh>
  );
}

function Ropes() {
  var groupRef = useRef();
  var deflateRef = useRef(1);

  var lineGeo = useMemo(function() {
    // 4 ropes connecting balloon base to basket corners
    var ropePositions = [
      // rope 1: front-left
      [-0.35, 0, 0.35, -0.12, -1.0, 0.12],
      // rope 2: front-right
      [0.35, 0, 0.35, 0.12, -1.0, 0.12],
      // rope 3: back-left
      [-0.35, 0, -0.35, -0.12, -1.0, -0.12],
      // rope 4: back-right
      [0.35, 0, -0.35, 0.12, -1.0, -0.12],
    ];

    var positions = [];
    for (var i = 0; i < ropePositions.length; i++) {
      var r = ropePositions[i];
      positions.push(r[0], r[1], r[2], r[3], r[4], r[5]);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame(function(frameState) {
    if (!groupRef.current) return;
    var elapsed = frameState.clock.elapsedTime;

    var targetScale = balloonState.faceVisible ? 1 : 0.4;
    deflateRef.current += (targetScale - deflateRef.current) * 0.02;
    var inflate = deflateRef.current;

    var floatY = Math.sin(elapsed * 0.5) * 0.15;
    var floatX = Math.sin(elapsed * 0.3) * 0.1;
    var driftX = Math.sin(elapsed * 0.08) * 0.3;

    groupRef.current.position.set(
      driftX + floatX,
      0.8 + floatY + (1 - inflate) * -1.5,
      0
    );
    groupRef.current.scale.setScalar(inflate);

    var tiltZ = (balloonState.faceX - 0.5) * -0.4;
    groupRef.current.rotation.set(0, elapsed * 0.1, tiltZ * 0.3);
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color={new THREE.Color(0.35, 0.22, 0.08)} linewidth={1} />
      </lineSegments>
    </group>
  );
}

function FlameEffect() {
  var meshRef = useRef();
  var deflateRef = useRef(1);

  useFrame(function(frameState) {
    if (!meshRef.current) return;
    var elapsed = frameState.clock.elapsedTime;

    var targetScale = balloonState.faceVisible ? 1 : 0;
    deflateRef.current += (targetScale - deflateRef.current) * 0.05;
    var vis = deflateRef.current;

    var floatY = Math.sin(elapsed * 0.5) * 0.15;
    var floatX = Math.sin(elapsed * 0.3) * 0.1;
    var driftX = Math.sin(elapsed * 0.08) * 0.3;

    // Flame sits between balloon and basket
    var flicker = 0.7 + Math.sin(elapsed * 12) * 0.15 + Math.sin(elapsed * 17) * 0.1;
    meshRef.current.position.set(
      driftX + floatX,
      0.8 + floatY - 0.55 * vis,
      0
    );
    meshRef.current.scale.set(
      0.06 * vis * flicker,
      0.15 * vis * flicker,
      0.06 * vis * flicker
    );
    meshRef.current.visible = vis > 0.1;
  });

  return (
    <mesh ref={meshRef}>
      <coneGeometry args={[1, 1, 8]} />
      <meshBasicMaterial
        color={new THREE.Color(1.0, 0.6, 0.1)}
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function BackgroundBalloon({ offset, color, size }) {
  var meshRef = useRef();

  useFrame(function(frameState) {
    if (!meshRef.current) return;
    var elapsed = frameState.clock.elapsedTime;

    var x = Math.sin(elapsed * 0.1 + offset * 2) * 2 + offset * 1.5;
    var y = Math.sin(elapsed * 0.3 + offset) * 0.2 + 0.3 + offset * 0.3;

    meshRef.current.position.set(x, y, -2 - offset * 1.5);
    meshRef.current.scale.set(size, size * 1.3, size);
    meshRef.current.rotation.y = elapsed * 0.05 + offset;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.15}
        roughness={0.6}
        metalness={0.1}
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}

function BalloonScene() {
  var bgBalloons = useMemo(function() {
    return [
      { offset: -1.2, color: new THREE.Color(0.9, 0.3, 0.3), size: 0.5 },
      { offset: 0.8, color: new THREE.Color(0.3, 0.7, 0.9), size: 0.35 },
      { offset: 2.0, color: new THREE.Color(0.9, 0.8, 0.2), size: 0.45 },
      { offset: -2.5, color: new THREE.Color(0.6, 0.3, 0.8), size: 0.3 },
    ];
  }, []);

  return (
    <>
      <ambientLight intensity={0.4} color={new THREE.Color(1.0, 0.85, 0.7)} />
      <directionalLight
        position={[3, 4, 2]}
        intensity={1.5}
        color={new THREE.Color(1.0, 0.7, 0.4)}
      />
      <pointLight
        position={[-2, 1, 3]}
        intensity={0.6}
        color={new THREE.Color(1.0, 0.5, 0.3)}
      />

      <BalloonEnvelope />
      <Basket />
      <Ropes />
      <FlameEffect />

      {bgBalloons.map(function(b, i) {
        return (
          <BackgroundBalloon
            key={i}
            offset={b.offset}
            color={b.color}
            size={b.size}
          />
        );
      })}
    </>
  );
}

export default function R3FFaceballoon({ visible }) {
  if (!visible) return null;

  return (
    <div
      data-mode-overlay="faceballoon"
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
        <BalloonScene />
      </Canvas>
    </div>
  );
}
