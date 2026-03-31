// R3FHandsmash — React Three Fiber wrecking ball overlay for handsmash mode
// Reads ball state from smashState exported by ../modes/handsmash.js

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { smashState } from '../modes/handsmash.js';

var TRAIL_COUNT = 60;

function WreckingBall() {
  var groupRef = useRef();
  var innerRef = useRef();
  var materialRef = useRef();
  var innerMaterialRef = useRef();

  var { viewport } = useThree();

  useFrame(function(_, delta) {
    if (!groupRef.current) return;

    // Convert normalized coords to R3F world coords
    // Camera at z=5, fov=45 => worldHeight = 2 * 5 * tan(22.5deg)
    var worldHeight = 2 * 5 * Math.tan(22.5 * Math.PI / 180);
    var worldWidth = worldHeight * (viewport.width / viewport.height);

    var worldX = (smashState.ballX - 0.5) * worldWidth;
    var worldY = -(smashState.ballY - 0.5) * worldHeight;

    groupRef.current.position.x = worldX;
    groupRef.current.position.y = worldY;

    // Pulse scale with glow
    var baseScale = 0.35 + smashState.ballGlow * 0.15;
    groupRef.current.scale.setScalar(baseScale);

    // Update emissive intensity based on glow
    if (materialRef.current) {
      var glowIntensity = 0.5 + smashState.ballGlow * 2.5;
      materialRef.current.emissiveIntensity = glowIntensity;
      materialRef.current.opacity = 0.75 + smashState.ballGlow * 0.2;
    }

    if (innerMaterialRef.current) {
      innerMaterialRef.current.emissiveIntensity = 1.0 + smashState.ballGlow * 3.0;
    }

    // Rotate inner core
    if (innerRef.current) {
      innerRef.current.rotation.x += delta * 1.5;
      innerRef.current.rotation.y += delta * 2.0;
      innerRef.current.rotation.z += delta * 0.8;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Main glowing sphere */}
      <mesh>
        <sphereGeometry args={[1, 32, 32]} />
        <meshPhysicalMaterial
          ref={materialRef}
          color="#ff6622"
          emissive="#ff4400"
          emissiveIntensity={0.5}
          metalness={0.3}
          roughness={0.2}
          transparent
          opacity={0.75}
          side={THREE.DoubleSide}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* Wireframe shell */}
      <mesh>
        <sphereGeometry args={[1.05, 16, 16]} />
        <meshBasicMaterial
          color="#ff8844"
          wireframe
          transparent
          opacity={0.2}
        />
      </mesh>

      {/* Inner rotating core */}
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[0.45, 1]} />
        <meshPhysicalMaterial
          ref={innerMaterialRef}
          color="#ffcc00"
          emissive="#ff6600"
          emissiveIntensity={1.0}
          metalness={0.9}
          roughness={0}
        />
      </mesh>
    </group>
  );
}

function Trail() {
  var meshRef = useRef();
  var dummy = useMemo(function() { return new THREE.Object3D(); }, []);
  var trailPositions = useRef([]);

  var { viewport } = useThree();

  useFrame(function() {
    if (!meshRef.current) return;

    var worldHeight = 2 * 5 * Math.tan(22.5 * Math.PI / 180);
    var worldWidth = worldHeight * (viewport.width / viewport.height);

    var worldX = (smashState.ballX - 0.5) * worldWidth;
    var worldY = -(smashState.ballY - 0.5) * worldHeight;

    // Add current position to trail
    var trail = trailPositions.current;
    trail.push({ x: worldX, y: worldY });
    if (trail.length > TRAIL_COUNT) trail.shift();

    // Update instanced mesh
    for (var i = 0; i < TRAIL_COUNT; i++) {
      if (i < trail.length) {
        var tp = trail[i];
        var fade = i / trail.length;
        dummy.position.set(tp.x, tp.y, -0.1);
        dummy.scale.setScalar(0.03 + fade * 0.08);
      } else {
        dummy.position.set(0, 0, -100);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, TRAIL_COUNT]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#ff6622" transparent opacity={0.4} />
    </instancedMesh>
  );
}

export default function R3FHandsmash({ visible }) {
  if (!visible) return null;

  return (
    <div
      data-mode-overlay="handsmash"
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
        <ambientLight intensity={0.4} color="#553322" />
        <directionalLight position={[3, 4, 5]} intensity={1.5} color="#ffaa66" />
        <directionalLight position={[-2, -3, 3]} intensity={0.8} color="#ff6644" />
        <pointLight position={[0, 0, 3]} intensity={2.0} color="#ff4400" />
        <WreckingBall />
        <Trail />
      </Canvas>
    </div>
  );
}
