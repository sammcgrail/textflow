// R3FGem — React Three Fiber rendered crystalline gem overlay
// This is the first mode that uses R3F declaratively (not raw three.js)

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function Crystal({ time }) {
  const groupRef = useRef();
  const innerRef = useRef();

  // Create icosahedron geometry variants
  const mainGeo = useMemo(() => new THREE.IcosahedronGeometry(1.2, 1), []);
  const innerGeo = useMemo(() => new THREE.IcosahedronGeometry(0.6, 0), []);


  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.x += delta * 0.3;
      groupRef.current.rotation.y += delta * 0.5;
      groupRef.current.rotation.z += delta * 0.1;
    }
    if (innerRef.current) {
      innerRef.current.rotation.x -= delta * 0.8;
      innerRef.current.rotation.y -= delta * 0.4;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Main crystal body */}
      <mesh geometry={mainGeo}>
        <meshPhysicalMaterial
          color="#4488ff"
          metalness={0.1}
          roughness={0.05}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          envMapIntensity={2}
        />
      </mesh>

      {/* Wireframe overlay */}
      <mesh geometry={mainGeo}>
        <meshBasicMaterial
          color="#88ccff"
          wireframe
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Inner rotating core */}
      <mesh ref={innerRef} geometry={innerGeo}>
        <meshPhysicalMaterial
          color="#ffffff"
          emissive="#2266cc"
          emissiveIntensity={1.5}
          metalness={0.8}
          roughness={0}
        />
      </mesh>

      {/* Floating particles around the gem */}
      <Particles count={60} />
    </group>
  );
}

function Particles({ count }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.8 + Math.random() * 1.2;
      arr.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        speed: 0.3 + Math.random() * 0.7,
        offset: Math.random() * Math.PI * 2,
      });
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    particles.forEach((p, i) => {
      const s = Math.sin(t * p.speed + p.offset);
      dummy.position.set(
        p.x + s * 0.3,
        p.y + Math.cos(t * p.speed * 0.7 + p.offset) * 0.3,
        p.z + s * 0.2
      );
      dummy.scale.setScalar(0.02 + Math.abs(s) * 0.03);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#88ccff" transparent opacity={0.8} />
    </instancedMesh>
  );
}

export default function R3FGem({ visible }) {
  if (!visible) return null;

  return (
    <div
      data-mode-overlay="r3fgem"
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
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.8} color="#667799" />
        <directionalLight position={[3, 4, 5]} intensity={2} />
        <directionalLight position={[-3, -2, 3]} intensity={1} color="#8888ff" />
        <pointLight position={[0, 0, 3]} intensity={1.5} color="#4488ff" />
        <Crystal />
      </Canvas>
    </div>
  );
}
