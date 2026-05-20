'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';

const NODES: { id: number; pos: [number, number, number] }[] = [
  { id: 0, pos: [-3.0,  1.6,  0.2] },
  { id: 1, pos: [-0.8,  2.8,  0.4] },
  { id: 2, pos: [ 0.6,  0.6, -0.6] },
  { id: 3, pos: [ 2.6,  2.2,  0.2] },
  { id: 4, pos: [-1.8, -1.0,  0.6] },
  { id: 5, pos: [ 1.2, -1.4, -0.4] },
  { id: 6, pos: [ 3.4, -0.2,  0.0] },
];

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [1, 3], [2, 4], [2, 5], [3, 6], [5, 6],
];

function TravellingDot({
  start,
  end,
  offset,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  offset: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.28 + offset) % 1;
    ref.current.position.lerpVectors(start, end, t);
    const mat = ref.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.3 + 0.5 * Math.sin(t * Math.PI);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.065, 8, 8]} />
      {/* @ts-ignore */}
      <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
    </mesh>
  );
}

function NodeSphere({ pos, i }: { pos: [number, number, number]; i: number }) {
  return (
    <Float speed={1.0 + i * 0.22} rotationIntensity={0.08} floatIntensity={0.35}>
      <group position={pos}>
        <mesh>
          <sphereGeometry args={[0.17, 32, 32]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0.22}
            metalness={0.75}
            roughness={0.12}
          />
        </mesh>
        <mesh>
          <torusGeometry args={[0.25, 0.009, 8, 64]} />
          {/* @ts-ignore */}
          <meshBasicMaterial color="#ffffff" transparent opacity={0.16} />
        </mesh>
      </group>
    </Float>
  );
}

function Scene() {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame((_, delta) => {
    groupRef.current.rotation.y += delta * 0.07;
  });

  const vecs = NODES.map((n) => new THREE.Vector3(...n.pos));

  return (
    <group ref={groupRef}>
      {EDGES.map(([a, b], i) => (
        <group key={i}>
          <Line
            points={[vecs[a], vecs[b]]}
            color="#ffffff"
            lineWidth={0.5}
            opacity={0.09}
            transparent
          />
          <TravellingDot start={vecs[a]} end={vecs[b]} offset={i / EDGES.length} />
        </group>
      ))}

      {NODES.map((node, i) => (
        <NodeSphere key={node.id} pos={node.pos} i={i} />
      ))}

      <ambientLight intensity={0.55} />
      <pointLight position={[5, 5, 5]} intensity={1.6} color="#ffffff" />
      <pointLight position={[-5, -4, -2]} intensity={0.4} color="#777777" />
    </group>
  );
}

export default function WorkflowScene3D({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0.5, 9.5], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <Scene />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          maxPolarAngle={Math.PI * 0.68}
          minPolarAngle={Math.PI * 0.32}
        />
      </Canvas>
    </div>
  );
}
