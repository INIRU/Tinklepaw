'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Sparkles, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
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

const BASE_TOP_COLOR = new THREE.Color('#888');
const BASE_BOTTOM_COLOR = new THREE.Color('#999');
const BASE_BAND_COLOR = new THREE.Color('#444');
const BLACK = new THREE.Color('#000');

type DrawMotionState = {
  center: number;
  spin: number;
  shake: number;
  crack: number;
  glow: number;
  heartbeat: number;
  fakePause: number;
  ring: number;
  open: number;
  core: number;
  burst: number;
};

const createDrawMotion = (): DrawMotionState => ({
  center: 0,
  spin: 0,
  shake: 0,
  crack: 0,
  glow: 0,
  heartbeat: 0,
  fakePause: 0,
  ring: 0,
  open: 0,
  core: 0,
  burst: 0,
});

function CinematicCapsule({
  isDrawing,
  rarity,
  onComplete,
}: {
  isDrawing: boolean;
  rarity?: string | null;
  onComplete?: () => void;
}) {
  const { viewport, camera } = useThree();
  const isMobile = viewport.width < 3;
  const baseScale = isMobile ? 0.55 : 1;
  const motionScale = isMobile ? 0.8 : 1;

  const isSSS = rarity === 'SSS';

  const group = useRef<THREE.Group>(null);
  const topRef = useRef<THREE.Mesh>(null);
  const bottomRef = useRef<THREE.Mesh>(null);
  const bandRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const shockRef = useRef<THREE.Mesh>(null);

  const motion = useRef<DrawMotionState>(createDrawMotion());
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const reducedMotionRef = useRef(false);
  const completedRef = useRef(false);

  const targetColor = useMemo(() => {
    return COLORS[(rarity as keyof typeof COLORS) || 'DEFAULT'];
  }, [rarity]);
  const targetThreeColor = useMemo(() => new THREE.Color(targetColor), [targetColor]);
  const baseScaleVec = useMemo(() => new THREE.Vector3(baseScale, baseScale, baseScale), [baseScale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => {
      reducedMotionRef.current = media.matches;
    };

    syncPreference();
    media.addEventListener('change', syncPreference);

    return () => media.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    timelineRef.current?.kill();
    timelineRef.current = null;
    completedRef.current = false;
    Object.assign(motion.current, createDrawMotion());

    if (!isDrawing) return;

    const reduced = reducedMotionRef.current;
    const pacing = reduced ? 0.62 : 1;
    const tensionBoost = isSSS ? 1.18 : 1;

    const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });

    tl.to(motion.current, {
      center: 1,
      spin: 1,
      ring: 0.35,
      duration: 0.5 * pacing,
      ease: 'power2.out',
    })
      .to(
        motion.current,
        {
          shake: 0.45 * tensionBoost,
          crack: 0.35,
          glow: 0.4,
          heartbeat: 0.35,
          ring: 0.7,
          duration: 0.68 * pacing,
          ease: 'sine.inOut',
        },
        '<',
      )
      .to(motion.current, {
        shake: 1.05 * tensionBoost,
        crack: 1,
        glow: 1,
        heartbeat: 1,
        ring: 1,
        duration: 1.15 * pacing,
        ease: 'power2.inOut',
      })
      .to(motion.current, {
        fakePause: 1,
        shake: 0.12,
        crack: 0.28,
        heartbeat: 0.2,
        duration: 0.18 * pacing,
        ease: 'power1.out',
      })
      .to(motion.current, {
        fakePause: 0,
        shake: 1.55 * tensionBoost,
        crack: 1.25,
        glow: 1.28,
        heartbeat: 1.25,
        duration: 0.46 * pacing,
        ease: 'power3.in',
      })
      .to(motion.current, {
        open: 1,
        core: 1,
        burst: 1,
        shake: 0.02,
        heartbeat: 0,
        duration: (isSSS ? 0.95 : 0.82) * pacing,
        ease: 'expo.in',
      })
      .to(
        motion.current,
        {
          ring: 0,
          duration: 0.35 * pacing,
          ease: 'sine.out',
        },
        '-=0.25',
      )
      .to(motion.current, {
        burst: 0.2,
        duration: 0.2,
        ease: 'power2.out',
      })
      .call(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onComplete?.();
      });

    timelineRef.current = tl;

    return () => {
      tl.kill();
      if (timelineRef.current === tl) {
        timelineRef.current = null;
      }
    };
  }, [isDrawing, isSSS, onComplete]);

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  useFrame((state, delta) => {
    if (!group.current || !topRef.current || !bottomRef.current || !bandRef.current || !coreRef.current) {
      return;
    }

    const elapsed = state.clock.elapsedTime;
    const anim = motion.current;
    const reduced = reducedMotionRef.current;
    const shakeScale = (reduced ? 0.38 : 1) * motionScale;

    const topMat = topRef.current.material as THREE.MeshStandardMaterial;
    const bottomMat = bottomRef.current.material as THREE.MeshStandardMaterial;
    const bandMat = bandRef.current.material as THREE.MeshStandardMaterial;
    const coreMat = coreRef.current.material as THREE.MeshStandardMaterial;

    if (!isDrawing) {
      group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, 0, delta * 6);
      group.current.position.y = THREE.MathUtils.lerp(
        group.current.position.y,
        Math.sin(elapsed * 1.1) * 0.18,
        delta * 2.4,
      );
      group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, 0, delta * 5);
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        Math.sin(elapsed * 0.5) * 0.05,
        delta * 2,
      );
      group.current.rotation.y += delta * 0.35;
      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        Math.PI / 4 + Math.sin(elapsed * 0.55) * 0.08,
        delta * 2.2,
      );
      group.current.scale.lerp(baseScaleVec, delta * 4);

      topRef.current.position.y = THREE.MathUtils.lerp(topRef.current.position.y, 0, delta * 6);
      bottomRef.current.position.y = THREE.MathUtils.lerp(bottomRef.current.position.y, 0, delta * 6);

      const idleBandScale = THREE.MathUtils.lerp(bandRef.current.scale.x, 1, delta * 6);
      bandRef.current.scale.setScalar(idleBandScale);

      topMat.color.lerp(BASE_TOP_COLOR, delta * 4);
      topMat.emissive.lerp(BLACK, delta * 4);
      topMat.emissiveIntensity = THREE.MathUtils.lerp(topMat.emissiveIntensity, 0.04, delta * 5);

      bottomMat.color.lerp(BASE_BOTTOM_COLOR, delta * 4);
      bottomMat.emissive.lerp(BLACK, delta * 4);
      bottomMat.emissiveIntensity = THREE.MathUtils.lerp(bottomMat.emissiveIntensity, 0.04, delta * 5);

      bandMat.color.lerp(BASE_BAND_COLOR, delta * 4);
      bandMat.emissive.lerp(BLACK, delta * 4);
      bandMat.emissiveIntensity = THREE.MathUtils.lerp(bandMat.emissiveIntensity, 0.06, delta * 5);

      coreRef.current.scale.setScalar(THREE.MathUtils.lerp(coreRef.current.scale.x, 0, delta * 6));
      coreMat.color.copy(BLACK);
      coreMat.emissive.copy(BLACK);
      coreMat.emissiveIntensity = THREE.MathUtils.lerp(coreMat.emissiveIntensity, 0, delta * 6);

      if (shockRef.current) {
        const shockMat = shockRef.current.material as THREE.MeshBasicMaterial;
        const currentScale = THREE.MathUtils.lerp(shockRef.current.scale.x, 0, delta * 4);
        shockRef.current.scale.setScalar(currentScale);
        shockMat.opacity = THREE.MathUtils.lerp(shockMat.opacity, 0, delta * 4);
      }

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, delta * 5);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0, delta * 5);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, 5, delta * 4);
      camera.lookAt(0, 0, 0);

      return;
    }

    const shakeAmount = anim.shake * (isSSS ? 0.055 : 0.04) * shakeScale;
    const jitterX =
      (Math.sin(elapsed * 58) + Math.sin(elapsed * 97) * 0.45) * shakeAmount;
    const jitterY =
      (Math.cos(elapsed * 51) + Math.sin(elapsed * 83) * 0.4) * shakeAmount;
    const heartbeatWave = (Math.sin(elapsed * (isSSS ? 18 : 15)) + 1) * 0.5;
    const heartbeatPulse = anim.heartbeat * heartbeatWave;

    group.current.position.x = jitterX;
    group.current.position.y = jitterY + Math.sin(elapsed * 6) * 0.01 * heartbeatPulse;
    group.current.position.z = THREE.MathUtils.lerp(
      group.current.position.z,
      -0.15 * anim.center - 0.32 * anim.open,
      delta * 6,
    );

    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      0.06 + Math.sin(elapsed * 4) * 0.02 * heartbeatPulse,
      delta * 7,
    );
    group.current.rotation.y += delta * (1.2 + anim.spin * (isSSS ? 15 : 11));
    group.current.rotation.z = THREE.MathUtils.lerp(
      group.current.rotation.z,
      Math.PI / 4 - anim.center * 0.7,
      delta * 6,
    );

    const cinematicZoom = 1 + anim.glow * 0.05 + anim.burst * 0.22 - anim.fakePause * 0.03;
    group.current.scale.setScalar(baseScale * cinematicZoom);

    const crackDistance =
      anim.crack * (isSSS ? 0.16 : 0.12) + heartbeatPulse * (isSSS ? 0.028 : 0.02);
    const openDistance = anim.open * (isSSS ? 1.45 : 1.25);
    const split = crackDistance + openDistance;
    topRef.current.position.y = THREE.MathUtils.lerp(topRef.current.position.y, split, delta * 10);
    bottomRef.current.position.y = THREE.MathUtils.lerp(bottomRef.current.position.y, -split, delta * 10);

    const colorMix = THREE.MathUtils.clamp(0.18 + anim.glow * 0.82, 0, 1);
    const emissiveStrength =
      0.08 +
      anim.glow * (isSSS ? 2.7 : 2.2) +
      heartbeatPulse * 0.8 +
      anim.open * (isSSS ? 2.4 : 1.9);

    topMat.color.copy(BASE_TOP_COLOR).lerp(targetThreeColor, colorMix);
    topMat.emissive.copy(targetThreeColor);
    topMat.emissiveIntensity = emissiveStrength;

    bottomMat.color.copy(BASE_BOTTOM_COLOR).lerp(targetThreeColor, colorMix);
    bottomMat.emissive.copy(targetThreeColor);
    bottomMat.emissiveIntensity = emissiveStrength;

    const ringScale = Math.max(0.001, 1 - anim.open * 0.96 + heartbeatPulse * 0.05);
    bandRef.current.scale.setScalar(ringScale);
    bandMat.color.copy(BASE_BAND_COLOR).lerp(targetThreeColor, 0.22 + anim.ring * 0.74);
    bandMat.emissive.copy(targetThreeColor);
    bandMat.emissiveIntensity = 0.12 + anim.ring * 2.6 + heartbeatPulse * 0.6;

    const coreScale =
      0.08 +
      anim.glow * 0.75 +
      anim.core * (isSSS ? 10.6 : 9.1) +
      anim.burst * (isSSS ? 1.6 : 1.2);
    coreRef.current.scale.setScalar(coreScale);
    coreMat.color.copy(targetThreeColor);
    coreMat.emissive.copy(targetThreeColor);
    coreMat.emissiveIntensity =
      0.3 + anim.glow * 2 + anim.core * (isSSS ? 7 : 5.5) + anim.burst * (isSSS ? 6 : 4.4);

    if (shockRef.current) {
      const shockMat = shockRef.current.material as THREE.MeshBasicMaterial;
      const shockScale = 1.1 + anim.burst * (isSSS ? 8 : 6);
      shockRef.current.scale.setScalar(shockScale);
      shockMat.opacity = THREE.MathUtils.clamp(
        (isSSS ? 0.48 : 0.3) * anim.burst * (1 - anim.open * 0.4),
        0,
        0.8,
      );
      shockMat.color.set(isSSS ? COLORS.SSS : targetColor);
    }

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, jitterX * 0.35, delta * 7);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, jitterY * 0.3, delta * 7);
    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z,
      5 - anim.center * 0.3 - anim.open * 1.2,
      delta * 6,
    );
    camera.lookAt(0, 0, 0);
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
      <Canvas dpr={[1, 1.8]}>
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
