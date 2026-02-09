'use client';

import { Float } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import gsap from 'gsap';
import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';

type ForgePhase = 'idle' | 'charging' | 'success' | 'downgrade' | 'destroy' | 'error';

type ForgeSceneProps = {
  phase: ForgePhase;
  level: number;
};

type TunaCanModelProps = ForgeSceneProps & {
  isDark: boolean;
};

type MotionState = {
  spinBoost: number;
  shake: number;
  glow: number;
  flash: number;
  lift: number;
  particlePull: number;
  tintMix: number;
};

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const syncTheme = () => {
      setIsDark(root.dataset.theme === 'dark');
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function TunaCanModel({ phase, level, isDark }: TunaCanModelProps) {
  const { size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const glowMeshRef = useRef<THREE.Mesh>(null);
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const lidMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const bandMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const tabMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const particleMatRef = useRef<THREE.PointsMaterial>(null);

  const motion = useRef<MotionState>({
    spinBoost: 0.12,
    shake: 0,
    glow: 0.35,
    flash: 0,
    lift: 0,
    particlePull: 0,
    tintMix: 0,
  });
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const responsiveScale = useRef(1);

  const whiteColor = useMemo(() => new THREE.Color('#ffffff'), []);
  const tempColor = useRef(new THREE.Color('#ffffff'));
  const tintColor = useRef(new THREE.Color('#f8fafc'));

  const baseCanColor = useMemo(() => {
    if (level >= 15) return new THREE.Color('#d7dde8');
    if (level >= 10) return new THREE.Color('#cfd8e6');
    if (level >= 5) return new THREE.Color('#c6d2e3');
    return new THREE.Color('#bccbde');
  }, [level]);

  const bandBaseColor = useMemo(() => {
    if (level >= 12) return new THREE.Color('#1d4ed8');
    if (level >= 6) return new THREE.Color('#2563eb');
    return new THREE.Color('#3b82f6');
  }, [level]);

  const outcomePalette = useMemo(
    () => ({
      success: new THREE.Color('#facc15'),
      fail: new THREE.Color('#ef4444'),
      neutral: new THREE.Color('#f8fafc'),
    }),
    []
  );

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    let nextScale = 1;

    if (aspect <= 0.55) nextScale = 0.62;
    else if (aspect <= 0.7) nextScale = 0.7;
    else if (aspect <= 0.85) nextScale = 0.78;
    else if (aspect <= 1.05) nextScale = 0.86;
    else if (aspect <= 1.3) nextScale = 0.93;

    if (size.width < 430) nextScale *= 0.9;
    else if (size.width < 560) nextScale *= 0.95;

    responsiveScale.current = Math.min(1, Math.max(0.56, nextScale));
  }, [size.height, size.width]);

  const particleData = useMemo(() => {
    const count = 220;
    const starts = new Float32Array(count * 3);
    const targets = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const si = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 1.7 + Math.random() * 1.35;

      starts[si] = Math.sin(phi) * Math.cos(theta) * radius;
      starts[si + 1] = Math.cos(phi) * radius * 0.85;
      starts[si + 2] = Math.sin(phi) * Math.sin(theta) * radius;

      const tTheta = Math.random() * Math.PI * 2;
      const tRadius = 0.6 + Math.random() * 0.24;
      targets[si] = Math.cos(tTheta) * tRadius;
      targets[si + 1] = (Math.random() - 0.5) * 1.05;
      targets[si + 2] = Math.sin(tTheta) * tRadius;
    }

    return { count, starts, targets };
  }, []);

  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particleData.starts), 3));
    return geometry;
  }, [particleData]);
  const particlePositions = useMemo(
    () => particleGeometry.getAttribute('position') as THREE.BufferAttribute,
    [particleGeometry]
  );
  const particleArray = useMemo(() => particlePositions.array as Float32Array, [particlePositions]);

  useEffect(() => {
    return () => {
      particleGeometry.dispose();
    };
  }, [particleGeometry]);

  useEffect(() => {
    timelineRef.current?.kill();
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    if (phase === 'charging') {
      tl.to(motion.current, {
        duration: 0.42,
        spinBoost: 0.36,
        shake: 0.04,
        glow: 0.36,
        flash: 0.02,
        particlePull: 0.45,
        lift: 0.03,
        tintMix: 0,
        ease: 'sine.out',
      })
        .to(motion.current, {
          duration: 0.58,
          spinBoost: 0.74,
          shake: 0.14,
          glow: 0.72,
          flash: 0.1,
          particlePull: 1,
          lift: 0.06,
          ease: 'expo.out',
        })
        .to(
          motion.current,
          {
            duration: 1.0,
            shake: 0.05,
            flash: 0.16,
            glow: 0.68,
            spinBoost: 0.62,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          },
          '>-0.08'
        );
    } else if (phase === 'success' || phase === 'downgrade' || phase === 'destroy' || phase === 'error') {
      const isSuccess = phase === 'success';
      const isDowngrade = phase === 'downgrade';
      const impactFlash = isSuccess ? 0.82 : isDowngrade ? 0.68 : 0.74;
      const impactGlow = isSuccess ? 1.02 : isDowngrade ? 0.78 : 0.86;
      const impactShake = isSuccess ? 0.16 : isDowngrade ? 0.23 : 0.32;
      const settleGlow = isSuccess ? 0.78 : isDowngrade ? 0.62 : 0.68;
      const settleSpin = isSuccess ? 0.3 : isDowngrade ? 0.2 : 0.18;
      const settleLift = isSuccess ? 0.08 : isDowngrade ? 0.04 : 0.02;
      const fadeDuration = isSuccess ? 0.78 : isDowngrade ? 0.9 : 1.0;
      tl.to(motion.current, {
        duration: 0.18,
        flash: impactFlash,
        glow: impactGlow,
        spinBoost: 0.78,
        shake: impactShake,
        lift: 0.13,
        particlePull: 1,
        tintMix: 0,
        ease: 'power2.in',
      })
        .to(motion.current, {
          duration: 0.32,
          flash: 0.06,
          glow: settleGlow,
          spinBoost: settleSpin,
          shake: 0.04,
          lift: settleLift,
          particlePull: 0.15,
          tintMix: 1,
          ease: 'power3.out',
        })
        .to(
          motion.current,
          isSuccess
            ? {
                duration: 0.32,
                glow: 0.66,
                flash: 0.05,
                shake: 0.015,
                yoyo: true,
                repeat: 1,
                ease: 'sine.inOut',
              }
            : {
                duration: 0.24,
                glow: settleGlow * 0.9,
                flash: 0,
                ease: 'sine.out',
              }
        )
        .to(motion.current, {
          duration: fadeDuration,
          flash: 0,
          glow: 0.26,
          spinBoost: 0.12,
          shake: 0,
          lift: 0,
          particlePull: 0,
          tintMix: 0,
          ease: 'sine.out',
        });
    } else {
      tl.to(motion.current, {
        duration: 0.46,
        spinBoost: 0.12,
        shake: 0,
        glow: 0.22,
        flash: 0,
        lift: 0,
        particlePull: 0,
        tintMix: 0,
        ease: 'sine.out',
      });
    }

    timelineRef.current = tl;

    return () => {
      tl.kill();
    };
  }, [phase]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    const glowMesh = glowMeshRef.current;
    const bodyMat = bodyMatRef.current;
    const lidMat = lidMatRef.current;
    const bandMat = bandMatRef.current;
    const tabMat = tabMatRef.current;
    const glowMat = glowMatRef.current;
    const particleMat = particleMatRef.current;
    if (!group || !bodyMat || !lidMat || !bandMat || !tabMat || !glowMat || !particleMat) return;

    const phaseBoost =
      phase === 'success'
        ? 0.78
        : phase === 'destroy' || phase === 'error'
          ? 0.7
          : phase === 'downgrade'
            ? 0.66
            : phase === 'charging'
              ? 0.7
              : 1;
    const glowScale = (isDark ? 0.52 : 0.3) * phaseBoost;
    const targetScale = responsiveScale.current;

    const t = state.clock.getElapsedTime();
    group.scale.x += (targetScale - group.scale.x) * 0.12;
    group.scale.y += (targetScale - group.scale.y) * 0.12;
    group.scale.z += (targetScale - group.scale.z) * 0.12;
    group.rotation.y += delta * (0.18 + motion.current.spinBoost * 0.44);
    group.rotation.z = Math.sin(t * 1.1) * 0.016 + Math.sin(t * 20) * motion.current.shake * 0.012;
    group.rotation.x = Math.sin(t * 0.82) * 0.025;
    group.position.y = Math.sin(t * 1.4) * 0.06 + motion.current.lift + Math.sin(t * 6.2) * motion.current.flash * 0.004;
    group.position.x = Math.sin(t * 18) * motion.current.shake * 0.012;

    if (glowMesh) {
      const orbScale = 1 + motion.current.glow * 0.18 + motion.current.flash * 0.08;
      glowMesh.scale.setScalar(orbScale);
    }

    const outcomeColor =
      phase === 'success' ? outcomePalette.success : phase === 'downgrade' || phase === 'destroy' || phase === 'error' ? outcomePalette.fail : outcomePalette.neutral;
    tintColor.current.copy(whiteColor).lerp(outcomeColor, motion.current.tintMix);

    const emissiveColor = tempColor.current.copy(tintColor.current);
    if (motion.current.flash > 0.2) {
      emissiveColor.lerp(whiteColor, Math.min(1, motion.current.flash * 0.1));
    }

    bodyMat.color.lerp(baseCanColor, 0.12);
    bodyMat.emissive.copy(emissiveColor);
    bodyMat.emissiveIntensity = (0.04 + motion.current.glow * 0.2 + motion.current.flash * 0.24) * glowScale;

    lidMat.color.set('#dbe5f0');
    lidMat.emissive.copy(emissiveColor);
    lidMat.emissiveIntensity = (0.03 + motion.current.glow * 0.14 + motion.current.flash * 0.18) * glowScale;

    bandMat.color.lerp(bandBaseColor, 0.1);
    bandMat.emissive.copy(tintColor.current);
    bandMat.emissiveIntensity = (0.08 + motion.current.glow * 0.18) * glowScale;

    tabMat.emissive.copy(emissiveColor);
    tabMat.emissiveIntensity = (0.03 + motion.current.glow * 0.1 + motion.current.flash * 0.12) * glowScale;

    glowMat.color.copy(emissiveColor);
    glowMat.opacity = (0.02 + motion.current.glow * 0.11 + motion.current.flash * 0.06) * glowScale;

    particleMat.color.copy(tintColor.current);
    particleMat.opacity = (0.16 + motion.current.glow * 0.18 + motion.current.flash * 0.08) * (isDark ? 0.66 : 0.46);
    particleMat.size = 0.039 + motion.current.glow * 0.008 + motion.current.flash * 0.003;

    const pull = motion.current.particlePull;

    for (let i = 0; i < particleData.count; i += 1) {
      const si = i * 3;
      const sx = particleData.starts[si];
      const sy = particleData.starts[si + 1];
      const sz = particleData.starts[si + 2];
      const tx = particleData.targets[si];
      const ty = particleData.targets[si + 1];
      const tz = particleData.targets[si + 2];

      const swirl = (1 - pull) * (0.05 + (i % 7) * 0.004);
      const ang = t * (0.8 + (i % 5) * 0.06) + i * 0.31;

      particleArray[si] = sx * (1 - pull) + tx * pull + Math.cos(ang) * swirl;
      particleArray[si + 1] = sy * (1 - pull) + ty * pull + Math.sin(ang * 1.1) * swirl;
      particleArray[si + 2] = sz * (1 - pull) + tz * pull + Math.sin(ang) * swirl;
    }

    particlePositions.needsUpdate = true;
  });

  return (
    <group>
      <points geometry={particleGeometry}>
        <pointsMaterial
          ref={particleMatRef}
          color="#dbeafe"
          size={0.05}
          sizeAttenuation
          transparent
          opacity={0.34}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>

      <group ref={groupRef}>
        <Float speed={1.9} rotationIntensity={0.15} floatIntensity={0.32}>
          <mesh>
            <cylinderGeometry args={[0.88, 0.88, 1.34, 64]} />
            <meshStandardMaterial ref={bodyMatRef} color="#cbd5e1" metalness={0.9} roughness={0.22} />
          </mesh>

          <mesh position={[0, 0.69, 0]}>
            <cylinderGeometry args={[0.89, 0.89, 0.09, 64]} />
            <meshStandardMaterial ref={lidMatRef} color="#dbe5f0" metalness={0.95} roughness={0.18} />
          </mesh>

          <mesh position={[0, -0.69, 0]}>
            <cylinderGeometry args={[0.89, 0.89, 0.09, 64]} />
            <meshStandardMaterial color="#d5e0ed" metalness={0.95} roughness={0.2} />
          </mesh>

          <mesh>
            <cylinderGeometry args={[0.905, 0.905, 0.74, 64, 1, true]} />
            <meshStandardMaterial ref={bandMatRef} color="#2563eb" metalness={0.35} roughness={0.48} />
          </mesh>

          <mesh position={[0, 0.77, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.24, 0.05, 18, 54]} />
            <meshStandardMaterial ref={tabMatRef} color="#e2e8f0" metalness={0.9} roughness={0.26} />
          </mesh>

          <mesh position={[0.16, 0.77, 0]}>
            <boxGeometry args={[0.22, 0.06, 0.1]} />
            <meshStandardMaterial color="#d8e1eb" metalness={0.9} roughness={0.24} />
          </mesh>

          <mesh ref={glowMeshRef} position={[0, 0, 0.26]}>
            <sphereGeometry args={[0.58, 32, 24]} />
            <meshBasicMaterial
              ref={glowMatRef}
              color="#ffffff"
              transparent
              opacity={0.15}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </Float>
      </group>
    </group>
  );
}

export default function ForgeScene({ phase, level }: ForgeSceneProps) {
  const isDark = useIsDarkTheme();

  const bloomBase =
    phase === 'success'
      ? 1.2
      : phase === 'destroy' || phase === 'error'
        ? 1.0
        : phase === 'downgrade'
          ? 0.88
          : phase === 'charging'
            ? 0.86
            : 0.34;
  const bloomIntensity = bloomBase * (isDark ? 0.58 : 0.38);
  const phaseLightBoost =
    phase === 'success'
      ? 1.04
      : phase === 'destroy' || phase === 'error'
        ? 0.9
        : phase === 'downgrade'
          ? 0.84
          : phase === 'charging'
            ? 0.88
            : 0.78;

  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [0, 0.12, 4.8], fov: 40 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={isDark ? 0.42 : 0.28} />
        <directionalLight position={[2.8, 3.4, 2.2]} intensity={isDark ? 0.68 : 0.44} />
        <pointLight
          position={[-2.2, 1.1, 2.4]}
          intensity={(isDark ? 0.38 : 0.24) * phaseLightBoost}
          color={
            phase === 'success'
              ? '#facc15'
              : phase === 'downgrade' || phase === 'destroy' || phase === 'error'
                ? '#ef4444'
                : '#f8fafc'
          }
        />
        <TunaCanModel phase={phase} level={level} isDark={isDark} />
        <EffectComposer enableNormalPass={false}>
          <Bloom intensity={bloomIntensity} luminanceThreshold={0.02} luminanceSmoothing={0.16} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
