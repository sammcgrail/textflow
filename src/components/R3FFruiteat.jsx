// R3FFruiteat — React Three Fiber overlay for fruiteat mode
// Renders 3D fruits that drift around the screen

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fruitState } from '../modes/fruiteat.js';

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

// Fruit colors: apple(red), orange, banana(yellow), grape(purple), watermelon(green), strawberry(pink)
var FRUIT_COLORS = [
  new THREE.Color(0.9, 0.15, 0.1),   // apple - red
  new THREE.Color(1.0, 0.55, 0.05),   // orange
  new THREE.Color(1.0, 0.9, 0.2),     // banana - yellow
  new THREE.Color(0.5, 0.15, 0.7),    // grape - purple
  new THREE.Color(0.2, 0.7, 0.3),     // watermelon - green
  new THREE.Color(0.95, 0.3, 0.4)     // strawberry - pink
];

var STEM_COLOR = new THREE.Color(0.3, 0.5, 0.15);
var LEAF_COLOR = new THREE.Color(0.2, 0.6, 0.1);

function Fruit({ index }) {
  var meshRef = useRef();
  var stemRef = useRef();
  var leafRef = useRef();

  var fruitType = useRef(0);
  var eatenProgress = useRef(0);
  var wasEaten = useRef(false);

  var geo = useMemo(function() { return new THREE.SphereGeometry(0.22, 16, 16); }, []);
  var stemGeo = useMemo(function() { return new THREE.CylinderGeometry(0.015, 0.02, 0.1, 6); }, []);
  var leafGeo = useMemo(function() { return new THREE.SphereGeometry(0.06, 6, 4); }, []);

  useFrame(function(frameState, delta) {
    if (!meshRef.current) return;
    var fruits = fruitState.fruits;
    if (!fruits || index >= fruits.length) {
      meshRef.current.visible = false;
      return;
    }

    var fruit = fruits[index];
    fruitType.current = fruit.type;

    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;
    var wc = toWorldCoords(fruit.x, fruit.y, vw, vh);

    // World scale for fruit radius
    var worldR = fruit.radius * 2 * 5 * TAN_HALF_FOV * 2.5;

    if (fruit.eaten) {
      if (!wasEaten.current) {
        eatenProgress.current = 0;
        wasEaten.current = true;
      }
      eatenProgress.current += delta * 2; // 0.5s animation

      if (eatenProgress.current >= 1) {
        meshRef.current.visible = false;
        if (stemRef.current) stemRef.current.visible = false;
        if (leafRef.current) leafRef.current.visible = false;
        return;
      }

      // Shrink + spin + fade
      var p = eatenProgress.current;
      var shrink = 1 - p;
      meshRef.current.position.set(wc.x, wc.y, 0);
      meshRef.current.scale.setScalar(worldR * shrink);
      meshRef.current.rotation.y += delta * 15;
      meshRef.current.rotation.z += delta * 10;
      meshRef.current.material.opacity = shrink;
      meshRef.current.material.transparent = true;
      meshRef.current.visible = true;

      if (stemRef.current) stemRef.current.visible = false;
      if (leafRef.current) leafRef.current.visible = false;
      return;
    }

    wasEaten.current = false;
    eatenProgress.current = 0;

    // Bob animation
    var bob = Math.sin(frameState.clock.elapsedTime * 2 + index * 1.5) * 0.05;

    meshRef.current.position.set(wc.x, wc.y + bob, 0);

    // Banana is elongated
    if (fruit.type === 2) {
      meshRef.current.scale.set(worldR * 0.8, worldR * 1.5, worldR * 0.8);
      meshRef.current.rotation.z = 0.3;
    } else if (fruit.type === 3) {
      // Grape is smaller
      meshRef.current.scale.setScalar(worldR * 0.7);
    } else {
      meshRef.current.scale.setScalar(worldR);
    }

    meshRef.current.material.opacity = 1;
    meshRef.current.material.transparent = false;
    meshRef.current.material.color.copy(FRUIT_COLORS[fruit.type]);
    meshRef.current.material.emissive.copy(FRUIT_COLORS[fruit.type]).multiplyScalar(0.3);
    meshRef.current.visible = true;

    // Gentle rotation
    meshRef.current.rotation.y = Math.sin(frameState.clock.elapsedTime * 0.5 + index) * 0.3;

    // Stem
    if (stemRef.current) {
      stemRef.current.position.set(wc.x, wc.y + bob + worldR * 0.9, 0);
      stemRef.current.scale.set(worldR, worldR, worldR);
      stemRef.current.visible = true;
    }

    // Leaf
    if (leafRef.current) {
      leafRef.current.position.set(wc.x + worldR * 0.15, wc.y + bob + worldR * 0.85, 0);
      leafRef.current.scale.set(worldR * 1.5, worldR * 0.5, worldR * 0.3);
      leafRef.current.visible = true;
    }
  });

  return (
    <>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial
          color={FRUIT_COLORS[0]}
          emissive={FRUIT_COLORS[0]}
          emissiveIntensity={0.3}
          metalness={0.1}
          roughness={0.4}
        />
      </mesh>
      <mesh ref={stemRef}>
        <cylinderGeometry args={[0.015, 0.02, 0.1, 6]} />
        <meshStandardMaterial color={STEM_COLOR} />
      </mesh>
      <mesh ref={leafRef}>
        <sphereGeometry args={[0.06, 6, 4]} />
        <meshStandardMaterial color={LEAF_COLOR} />
      </mesh>
    </>
  );
}

function EatParticles() {
  var ref = useRef();
  var dummy = useMemo(function() { return new THREE.Object3D(); }, []);
  var MAX_PARTICLES = 140; // 7 fruits * 20 particles
  var particleGeo = useMemo(function() { return new THREE.SphereGeometry(0.03, 4, 4); }, []);

  // Internal particle state
  var particleData = useRef([]);
  var lastScore = useRef(0);

  useFrame(function(frameState, delta) {
    if (!ref.current) return;

    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;

    // Check for newly eaten fruits (score increased)
    if (fruitState.score > lastScore.current) {
      lastScore.current = fruitState.score;
      // Find recently eaten fruit
      for (var i = 0; i < fruitState.fruits.length; i++) {
        var fruit = fruitState.fruits[i];
        if (fruit.eaten && (frameState.clock.elapsedTime - fruit.eatenTime) < 0.1) {
          // Actually eatenTime is state.time not clock time, but close enough for burst detection
        }
      }
    }

    // Update existing particles
    var pData = particleData.current;
    for (var p = 0; p < pData.length; p++) {
      pData[p].life -= delta;
      pData[p].x += pData[p].vx * delta;
      pData[p].y += pData[p].vy * delta;
      pData[p].vy += 0.5 * delta; // gravity in world coords
    }
    // Remove dead
    pData = pData.filter(function(pp) { return pp.life > 0; });
    particleData.current = pData;

    // Render
    var idx = 0;
    for (var j = 0; j < pData.length && idx < MAX_PARTICLES; j++) {
      var pp = pData[j];
      var alpha = pp.life / pp.maxLife;
      dummy.position.set(pp.x, pp.y, 0);
      dummy.scale.setScalar(alpha * 0.8);
      dummy.updateMatrix();
      ref.current.setMatrixAt(idx, dummy.matrix);
      ref.current.setColorAt(idx, pp.color);
      idx++;
    }

    // Hide unused
    while (idx < MAX_PARTICLES) {
      dummy.position.set(0, 0, -100);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      ref.current.setMatrixAt(idx, dummy.matrix);
      idx++;
    }

    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[particleGeo, null, MAX_PARTICLES]}>
      <meshBasicMaterial
        transparent
        opacity={0.8}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

function ScoreDisplay() {
  // Score is rendered in ASCII layer, not in 3D
  return null;
}

function FruitScene() {
  // Spawn burst particles when fruit is eaten
  var lastScoreRef = useRef(0);
  var particlesRef = useRef(null);

  // We need a ref to EatParticles' internal data — instead, handle bursts here
  var burstParticles = useRef([]);

  useFrame(function(frameState) {
    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;

    // Detect new eat events
    if (fruitState.score > lastScoreRef.current) {
      var diff = fruitState.score - lastScoreRef.current;
      lastScoreRef.current = fruitState.score;

      // Find which fruit was just eaten
      for (var i = 0; i < fruitState.fruits.length; i++) {
        var fruit = fruitState.fruits[i];
        if (fruit.eaten) {
          var wc = toWorldCoords(fruit.x, fruit.y, vw, vh);
          var color = FRUIT_COLORS[fruit.type];
          // Spawn burst particles
          for (var j = 0; j < 15; j++) {
            var angle = (Math.PI * 2 / 15) * j;
            var speed = 1.5 + Math.random() * 2;
            burstParticles.current.push({
              x: wc.x,
              y: wc.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 0.8,
              maxLife: 0.8,
              color: color.clone()
            });
          }
        }
      }
    }
  });

  return null;
}

export default function R3FFruiteat({ visible }) {
  if (!visible) return null;

  var fruitIndices = useMemo(function() {
    return [0, 1, 2, 3, 4, 5, 6];
  }, []);

  return (
    <div
      data-mode-overlay="fruiteat"
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
        <ambientLight intensity={0.6} />
        <pointLight position={[0, 0, 4]} intensity={2} />
        <pointLight position={[3, 3, 3]} intensity={1} color="#ffaa44" />
        {fruitIndices.map(function(i) {
          return <Fruit key={i} index={i} />;
        })}
        <EatParticles />
        <FruitScene />
      </Canvas>
    </div>
  );
}
