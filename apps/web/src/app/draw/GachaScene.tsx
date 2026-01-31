'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Sparkles, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useRef, useState, useMemo } from 'react';
import * as THREE from 'three';

type GachaSceneProps = {
  isDrawing: boolean;
  rarity?: string | null;
  onAnimationComplete?: () => void;
};

const COLORS = {
  R: '#6b7280',   // Darker Gray
  S: '#3b82f6',   // Blue
  SS: '#a855f7',  // Purple
  SSS: '#ffd700', // Gold
  DEFAULT: '#6b7280'
};

function CinematicCapsule({ isDrawing, rarity, onComplete }: { isDrawing: boolean; rarity?: string | null; onComplete?: () => void }) {
  const { viewport } = useThree();
  const isMobile = viewport.width < 3; 
  const baseScale = isMobile ? 0.55 : 1;

  const isSSS = rarity === 'SSS';

  const group = useRef<THREE.Group>(null);
  const topRef = useRef<THREE.Mesh>(null);
  const bottomRef = useRef<THREE.Mesh>(null);
  const bandRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const shockRef = useRef<THREE.Mesh>(null);
  
  const [phase, setPhase] = useState<'idle' | 'unlocking' | 'tension' | 'opening'>('idle');
  const startTime = useRef(0);
  const wasDrawing = useRef(false);

  const targetColor = useMemo(() => {
    return COLORS[(rarity as keyof typeof COLORS) || 'DEFAULT'];
  }, [rarity]);

  useFrame((state, delta) => {
    if (!group.current || !topRef.current || !bottomRef.current || !bandRef.current || !coreRef.current) return;

    if (isDrawing && !wasDrawing.current) {
      wasDrawing.current = true;
      startTime.current = Date.now();
      setPhase('unlocking');
    } else if (!isDrawing && wasDrawing.current) {
      wasDrawing.current = false;
      setPhase('idle');

      group.current.position.set(0, 0, 0);
      group.current.rotation.set(0, 0, 0);
      group.current.scale.set(baseScale, baseScale, baseScale);
      topRef.current.position.y = 0;
      bottomRef.current.position.y = 0;
      bandRef.current.scale.set(1, 1, 1);
      const mat = bandRef.current.material as THREE.MeshStandardMaterial;
      mat.color.set('#333');
      mat.emissive.set('#000');
      coreRef.current.scale.set(0, 0, 0);

      if (haloRef.current) {
        haloRef.current.scale.set(0, 0, 0);
        const mat = haloRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = 0;
      }
      if (shockRef.current) {
        shockRef.current.scale.set(0, 0, 0);
        const mat = shockRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = 0;
      }
    }

    if (phase === 'idle') {
      // Gentle float
      group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.1 + Math.PI / 4;
      group.current.position.y = Math.sin(state.clock.elapsedTime) * 0.2;
      group.current.scale.lerp(new THREE.Vector3(baseScale, baseScale, baseScale), delta * 2);

      if (isSSS && haloRef.current) {
        const halo = haloRef.current;
        const mat = halo.material as THREE.MeshBasicMaterial;
        const pulse = 0.35 + Math.sin(state.clock.elapsedTime * 2.0) * 0.08;
        halo.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 2);
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, pulse, delta * 2);
      } else if (haloRef.current) {
        const mat = haloRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0, delta * 3);
        haloRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), delta * 3);
      }

      return;
    }

    const elapsed = (Date.now() - startTime.current) / 1000;

    if (phase === 'unlocking') {
      // 0 ~ 1.5s: Mechanical Unlock
      // Capsule moves to center
      group.current.position.lerp(new THREE.Vector3(0, 0, 0), delta * 2);
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, 0, delta * 2);
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, 0, delta * 2);
      group.current.rotation.y += delta * 2; // Spin

      // Band stays mechanical dark
      const bandMat = bandRef.current.material as THREE.MeshStandardMaterial;
      bandMat.emissive.set('#222');

      if (isSSS && haloRef.current) {
        const halo = haloRef.current;
        const mat = halo.material as THREE.MeshBasicMaterial;
        halo.scale.lerp(new THREE.Vector3(1.05, 1.05, 1.05), delta * 4);
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0.35, delta * 3);
      }
      
      if (elapsed > 1.5) setPhase('tension');

    } else if (phase === 'tension') {
      // 1.5s ~ 3.5s: Tension
      // Stop spinning, start shaking
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, 0, delta * 5);
      
      const shakeBase = 0.02 + (elapsed - 1.5) * 0.05; // Increase shake
      const shake = isSSS ? shakeBase * 1.8 : shakeBase;
      group.current.position.x = (Math.random() - 0.5) * shake;
      group.current.position.y = (Math.random() - 0.5) * shake;

      // Crack open slightly to reveal light
      const openAmount = (isSSS ? 0.075 : 0.05) + Math.sin(elapsed * 20) * 0.02;
      topRef.current.position.y = THREE.MathUtils.lerp(topRef.current.position.y, openAmount, delta * 5);
      bottomRef.current.position.y = THREE.MathUtils.lerp(bottomRef.current.position.y, -openAmount, delta * 5);

      // Capsule body turns into rarity color gradually
      const topMat = topRef.current.material as THREE.MeshStandardMaterial;
      const botMat = bottomRef.current.material as THREE.MeshStandardMaterial;
      const tColor = new THREE.Color(targetColor);
      
      topMat.color.lerp(tColor, delta * 3);
      topMat.emissive.lerp(tColor, delta * 3);
      topMat.emissiveIntensity = 0.5 + Math.sin(elapsed * 20) * 0.5;
      
      botMat.color.lerp(tColor, delta * 3);
      botMat.emissive.lerp(tColor, delta * 3);
      botMat.emissiveIntensity = 0.5 + Math.sin(elapsed * 20) * 0.5;

      // Core light leaks
      const coreMat = coreRef.current.material as THREE.MeshStandardMaterial;
      coreRef.current.scale.setScalar(0.8);
      coreMat.color.set(targetColor);
      coreMat.emissive.set(targetColor);
      coreMat.emissiveIntensity = isSSS ? 3 : 2;

      if (isSSS && haloRef.current) {
        const halo = haloRef.current;
        const mat = halo.material as THREE.MeshBasicMaterial;
        const pulse = 0.5 + Math.sin(elapsed * 10) * 0.2;
        halo.scale.lerp(new THREE.Vector3(1.12, 1.12, 1.12), delta * 4);
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, pulse, delta * 6);
      }

      if (elapsed > 3.5) setPhase('opening');

    } else if (phase === 'opening') {
      // 3.5s ~ : Slow Motion Opening
      const openSpeed = delta * 2;
      topRef.current.position.y += openSpeed;
      bottomRef.current.position.y -= openSpeed;
      
      // Core expands and consumes screen
      const coreMat = coreRef.current.material as THREE.MeshStandardMaterial;
      coreRef.current.scale.lerp(new THREE.Vector3(isSSS ? 12 : 10, isSSS ? 12 : 10, isSSS ? 12 : 10), delta * 2);
      coreMat.emissiveIntensity = isSSS ? 8 : 5;

      // Keep capsule glowing
      const topMat = topRef.current.material as THREE.MeshStandardMaterial;
      const botMat = bottomRef.current.material as THREE.MeshStandardMaterial;
      topMat.emissiveIntensity = isSSS ? 3 : 2;
      botMat.emissiveIntensity = isSSS ? 3 : 2;

      // Band scales down/disappears
      bandRef.current.scale.lerp(new THREE.Vector3(0, 0, 0), delta * 5);

      if (isSSS && shockRef.current) {
        const shock = shockRef.current;
        const mat = shock.material as THREE.MeshBasicMaterial;
        shock.scale.lerp(new THREE.Vector3(6, 6, 6), delta * 3);
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0.0, delta * 2);
      }
      if (isSSS && haloRef.current) {
        const halo = haloRef.current;
        const mat = halo.material as THREE.MeshBasicMaterial;
        halo.scale.lerp(new THREE.Vector3(1.25, 1.25, 1.25), delta * 3);
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0, delta * 2);
      }

      if (coreRef.current.scale.x > 8) {
        if (onComplete) onComplete();
        setPhase('idle');
      }
    }
  });

  return (
    <group ref={group} rotation={[0, 0, Math.PI / 4]}>
      {/* Top Half (Darker Plastic) */}
      <mesh ref={topRef} position={[0, 0, 0]}>
        <sphereGeometry args={[1.2, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
      </mesh>
      
      {/* Bottom Half (Darker Plastic) */}
      <mesh ref={bottomRef} rotation={[Math.PI, 0, 0]} position={[0, 0, 0]}>
        <sphereGeometry args={[1.2, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#999" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Band (Mechanical Ring) */}
      <mesh ref={bandRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.25, 0.1, 16, 100]} />
        <meshStandardMaterial color="#444" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Inner Core (The Item Light) */}
      <mesh ref={coreRef} scale={[0, 0, 0]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color="#000" emissive="#000" emissiveIntensity={0} />
      </mesh>

      {/* SSS Halo */}
      <mesh ref={haloRef} position={[0, 0, 0.35]} scale={[0, 0, 0]}>
        <ringGeometry args={[1.35, 1.55, 64]} />
        <meshBasicMaterial
          color={COLORS.SSS}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* SSS Shockwave */}
      <mesh ref={shockRef} position={[0, 0, 0.25]} scale={[0, 0, 0]}>
        <ringGeometry args={[1.55, 1.75, 64]} />
        <meshBasicMaterial
          color={COLORS.SSS}
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function GachaScene({ isDrawing, rarity, onAnimationComplete }: GachaSceneProps) {
  const isSSS = rarity === 'SSS';
  return (
    <div className="w-full h-full relative">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        
        {/* Cinematic Lighting: Bright & Clear */}
        <ambientLight intensity={1.5} />
        {/* Rim Light */}
        <spotLight position={[-5, 5, 0]} angle={0.5} penumbra={1} intensity={2} color="#fff" />
        {/* Key Light */}
        <directionalLight position={[5, 10, 5]} intensity={1.5} />
        
        {/* Background */}
        <Stars radius={100} depth={50} count={2000} factor={3} saturation={0} fade speed={isSSS ? 1.0 : 0.5} />

        {isSSS && (
          <Sparkles
            count={80}
            scale={[6, 6, 6]}
            size={3}
            speed={0.6}
            opacity={0.6}
            color={COLORS.SSS}
          />
        )}
        
        <CinematicCapsule 
          isDrawing={isDrawing} 
          rarity={rarity} 
          onComplete={onAnimationComplete} 
        />

        <EffectComposer enableNormalPass={false}>
          {/* Subtle Bloom only for the core light */}
          <Bloom luminanceThreshold={isSSS ? 0.35 : 0.5} mipmapBlur intensity={isSSS ? 1.8 : 1.0} radius={isSSS ? 0.7 : 0.5} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
