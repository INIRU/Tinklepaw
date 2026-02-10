'use client';

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
  spin: number;
  wobble: number;
  heat: number;
  pulse: number;
  lift: number;
  impact: number;
  dent: number;
  tilt: number;
  charge: number;
  sparkBurst: number;
  tint: number;
};

type SparkSeed = {
  orbit: number;
  rise: number;
  speed: number;
  offset: number;
  drift: number;
};

const SPARK_COUNT = 84;

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

  const rigRef = useRef<THREE.Group>(null);
  const canRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const emberRingRef = useRef<THREE.Mesh>(null);
  const sparkRef = useRef<THREE.Points>(null);

  const bodyMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const labelMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const lidMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const tabMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const platformMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const auraMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const shockwaveMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const emberMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const sparkMatRef = useRef<THREE.PointsMaterial>(null);

  const sparkAttrRef = useRef<THREE.BufferAttribute>(null);
  const sparkPositions = useMemo(() => new Float32Array(SPARK_COUNT * 3), []);
  const sparkSeeds = useMemo<SparkSeed[]>(
    () =>
      Array.from({ length: SPARK_COUNT }, (_, index) => {
        const progress = index / SPARK_COUNT;
        return {
          orbit: 0.28 + Math.random() * 0.64,
          rise: 0.12 + Math.random() * 0.95,
          speed: 0.65 + Math.random() * 1.85,
          offset: Math.random() * Math.PI * 2,
          drift: 0.012 + progress * 0.035 + Math.random() * 0.02,
        };
      }),
    []
  );

  const motion = useRef<MotionState>({
    spin: 0.16,
    wobble: 0,
    heat: 0.18,
    pulse: 0,
    lift: 0,
    impact: 0,
    dent: 0,
    tilt: 0,
    charge: 0,
    sparkBurst: 0,
    tint: 0,
  });
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const responsiveScaleRef = useRef(1);

  const palette = useMemo(
    () => ({
      neutral: new THREE.Color('#f1f5f9'),
      bodyCool: new THREE.Color('#dbe6f2'),
      labelBase: new THREE.Color('#1f6fe5'),
      heat: new THREE.Color('#fb923c'),
      ember: new THREE.Color('#f97316'),
      success: new THREE.Color('#facc15'),
      fail: new THREE.Color('#ef4444'),
      steel: new THREE.Color('#cbd5e1'),
      white: new THREE.Color('#ffffff'),
    }),
    []
  );

  const bodyBase = useMemo(() => {
    if (level >= 21) return new THREE.Color('#f1f5f9');
    if (level >= 15) return new THREE.Color('#e6edf6');
    if (level >= 10) return new THREE.Color('#dce5f1');
    return new THREE.Color('#d1dde9');
  }, [level]);

  const labelBase = useMemo(() => {
    if (level >= 21) return new THREE.Color('#f59e0b');
    if (level >= 15) return new THREE.Color('#2563eb');
    if (level >= 10) return new THREE.Color('#1d4ed8');
    return palette.labelBase;
  }, [level, palette.labelBase]);

  const workColorRef = useRef(new THREE.Color('#ffffff'));
  const tintColorRef = useRef(new THREE.Color('#ffffff'));

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    let nextScale = 1;

    if (aspect <= 0.55) nextScale = 0.58;
    else if (aspect <= 0.72) nextScale = 0.66;
    else if (aspect <= 0.9) nextScale = 0.74;
    else if (aspect <= 1.1) nextScale = 0.82;
    else if (aspect <= 1.35) nextScale = 0.9;

    if (size.width < 420) nextScale *= 0.88;
    else if (size.width < 560) nextScale *= 0.94;

    responsiveScaleRef.current = Math.max(0.52, Math.min(1.04, nextScale));
  }, [size.height, size.width]);

  useEffect(() => {
    timelineRef.current?.kill();
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    if (phase === 'charging') {
      tl.to(motion.current, {
        duration: 0.55,
        spin: 0.62,
        wobble: 0.045,
        heat: 0.72,
        pulse: 0.34,
        lift: 0.08,
        impact: 0.16,
        dent: 0,
        tilt: 0.05,
        charge: 1,
        sparkBurst: 0.48,
        tint: 0,
      }).to(motion.current, {
        duration: 0.95,
        spin: 0.88,
        wobble: 0.085,
        heat: 0.96,
        pulse: 0.84,
        lift: 0.14,
        impact: 0.22,
        tilt: 0.1,
        sparkBurst: 0.88,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    } else if (phase === 'success') {
      tl.to(motion.current, {
        duration: 0.22,
        spin: 1.02,
        wobble: 0.06,
        heat: 1,
        pulse: 1,
        lift: 0.2,
        impact: 1,
        dent: 0,
        tilt: 0.02,
        charge: 0.72,
        sparkBurst: 1,
        tint: 1,
        ease: 'power3.in',
      })
        .to(motion.current, {
          duration: 0.55,
          spin: 0.46,
          wobble: 0.03,
          heat: 0.66,
          pulse: 0.48,
          lift: 0.05,
          impact: 0.22,
          charge: 0.2,
          sparkBurst: 0.35,
          tint: 0.58,
          ease: 'power3.out',
        })
        .to(motion.current, {
          duration: 0.8,
          spin: 0.16,
          wobble: 0,
          heat: 0.18,
          pulse: 0,
          lift: 0,
          impact: 0,
          dent: 0,
          tilt: 0,
          charge: 0,
          sparkBurst: 0,
          tint: 0,
          ease: 'sine.out',
        });
    } else if (phase === 'downgrade') {
      tl.to(motion.current, {
        duration: 0.2,
        spin: 0.78,
        wobble: 0.16,
        heat: 0.7,
        pulse: 0.8,
        lift: 0.06,
        impact: 0.74,
        dent: 0.24,
        tilt: 0.14,
        charge: 0.25,
        sparkBurst: 0.82,
        tint: 1,
        ease: 'power2.in',
      })
        .to(motion.current, {
          duration: 0.65,
          spin: 0.3,
          wobble: 0.04,
          heat: 0.34,
          pulse: 0.22,
          lift: 0,
          impact: 0.18,
          dent: 0.08,
          tilt: 0.04,
          charge: 0,
          sparkBurst: 0.2,
          tint: 0.44,
          ease: 'power3.out',
        })
        .to(motion.current, {
          duration: 0.7,
          spin: 0.16,
          wobble: 0,
          heat: 0.18,
          pulse: 0,
          impact: 0,
          dent: 0,
          tilt: 0,
          sparkBurst: 0,
          tint: 0,
          ease: 'sine.out',
        });
    } else if (phase === 'destroy' || phase === 'error') {
      tl.to(motion.current, {
        duration: 0.2,
        spin: 0.86,
        wobble: 0.22,
        heat: 0.82,
        pulse: 0.94,
        lift: 0.02,
        impact: 0.92,
        dent: 0.42,
        tilt: 0.2,
        charge: 0.08,
        sparkBurst: 1,
        tint: 1,
        ease: 'power3.in',
      })
        .to(motion.current, {
          duration: 0.7,
          spin: 0.24,
          wobble: 0.06,
          heat: 0.28,
          pulse: 0.18,
          lift: -0.02,
          impact: 0.22,
          dent: 0.14,
          tilt: 0.05,
          sparkBurst: 0.22,
          tint: 0.5,
          ease: 'power3.out',
        })
        .to(motion.current, {
          duration: 0.85,
          spin: 0.16,
          wobble: 0,
          heat: 0.18,
          pulse: 0,
          lift: 0,
          impact: 0,
          dent: 0,
          tilt: 0,
          charge: 0,
          sparkBurst: 0,
          tint: 0,
          ease: 'sine.out',
        });
    } else {
      tl.to(motion.current, {
        duration: 0.42,
        spin: 0.16,
        wobble: 0,
        heat: 0.18,
        pulse: 0,
        lift: 0,
        impact: 0,
        dent: 0,
        tilt: 0,
        charge: 0,
        sparkBurst: 0,
        tint: 0,
        ease: 'sine.out',
      });
    }

    timelineRef.current = tl;
    return () => {
      tl.kill();
    };
  }, [phase]);

  useFrame((state, delta) => {
    const rig = rigRef.current;
    const can = canRef.current;
    const aura = auraRef.current;
    const shockwave = shockwaveRef.current;
    const emberRing = emberRingRef.current;

    const bodyMat = bodyMatRef.current;
    const labelMat = labelMatRef.current;
    const lidMat = lidMatRef.current;
    const tabMat = tabMatRef.current;
    const platformMat = platformMatRef.current;
    const auraMat = auraMatRef.current;
    const shockwaveMat = shockwaveMatRef.current;
    const emberMat = emberMatRef.current;
    const sparkMat = sparkMatRef.current;

    if (
      !rig ||
      !can ||
      !aura ||
      !shockwave ||
      !emberRing ||
      !bodyMat ||
      !labelMat ||
      !lidMat ||
      !tabMat ||
      !platformMat ||
      !auraMat ||
      !shockwaveMat ||
      !emberMat ||
      !sparkMat
    ) {
      return;
    }

    const t = state.clock.getElapsedTime();
    const targetScale = responsiveScaleRef.current;

    const rigTargetScaleXz = targetScale * (1 + motion.current.impact * 0.035);
    const rigTargetScaleY = targetScale * (1 - motion.current.impact * 0.028);
    rig.scale.x += (rigTargetScaleXz - rig.scale.x) * 0.16;
    rig.scale.y += (rigTargetScaleY - rig.scale.y) * 0.16;
    rig.scale.z += (rigTargetScaleXz - rig.scale.z) * 0.16;

    rig.rotation.y += delta * (0.11 + motion.current.spin * 0.54);
    rig.rotation.z = Math.sin(t * 1.7) * 0.01 + Math.sin(t * 17) * motion.current.wobble * 0.015;
    rig.position.y = Math.sin(t * 1.45) * 0.03 + motion.current.lift;

    const canScaleY = 1 - motion.current.impact * 0.07 - motion.current.dent * 0.08;
    const canScaleXz = 1 + motion.current.impact * 0.05 + motion.current.dent * 0.045;
    can.scale.set(canScaleXz, canScaleY, canScaleXz);
    can.rotation.x = -motion.current.tilt * 0.16 + Math.sin(t * 0.9) * 0.01;
    can.rotation.z = Math.sin(t * 1.35) * 0.012 + motion.current.wobble * 0.024;
    can.position.x = Math.sin(t * 15.5) * motion.current.wobble * 0.015;

    const outcomeColor =
      phase === 'success'
        ? palette.success
        : phase === 'downgrade' || phase === 'destroy' || phase === 'error'
          ? palette.fail
          : palette.neutral;

    tintColorRef.current.copy(palette.neutral).lerp(outcomeColor, motion.current.tint);
    workColorRef.current.copy(bodyBase).lerp(palette.heat, motion.current.heat * 0.24 + motion.current.pulse * 0.08);

    const themeEnergyScale = isDark ? 0.8 : 0.56;

    bodyMat.color.copy(workColorRef.current);
    bodyMat.emissive.copy(tintColorRef.current);
    bodyMat.emissiveIntensity = (0.08 + motion.current.heat * 0.28 + motion.current.pulse * 0.32) * themeEnergyScale;
    bodyMat.roughness = Math.max(0.13, 0.24 - motion.current.heat * 0.08);
    bodyMat.metalness = Math.min(0.98, 0.9 + level * 0.0025);

    lidMat.color.copy(palette.steel);
    lidMat.emissive.copy(tintColorRef.current);
    lidMat.emissiveIntensity = (0.04 + motion.current.heat * 0.2 + motion.current.pulse * 0.22) * themeEnergyScale;

    labelMat.color.copy(labelBase).lerp(tintColorRef.current, motion.current.tint * 0.22);
    labelMat.emissive.copy(tintColorRef.current);
    labelMat.emissiveIntensity = (0.12 + motion.current.heat * 0.24 + motion.current.pulse * 0.2) * themeEnergyScale;

    tabMat.emissive.copy(tintColorRef.current);
    tabMat.emissiveIntensity = (0.03 + motion.current.heat * 0.16 + motion.current.pulse * 0.16) * themeEnergyScale;

    platformMat.color.copy(palette.bodyCool).lerp(palette.heat, motion.current.heat * 0.18);
    platformMat.emissive.copy(palette.ember).lerp(tintColorRef.current, motion.current.tint * 0.28);
    platformMat.emissiveIntensity = (0.06 + motion.current.heat * 0.16 + motion.current.pulse * 0.16) * themeEnergyScale;

    auraMat.color.copy(tintColorRef.current).lerp(palette.white, motion.current.pulse * 0.2);
    auraMat.opacity = (0.02 + motion.current.heat * 0.16 + motion.current.pulse * 0.14) * (isDark ? 0.9 : 0.68);

    shockwaveMat.color.copy(tintColorRef.current);
    shockwaveMat.opacity = (0.012 + motion.current.impact * 0.2 + motion.current.sparkBurst * 0.13) * (isDark ? 0.86 : 0.6);
    const shockScale = 1 + motion.current.impact * 0.66 + motion.current.pulse * 0.2;
    shockwave.scale.setScalar(shockScale);
    shockwave.visible = shockwaveMat.opacity > 0.02;

    emberMat.color.copy(palette.ember).lerp(tintColorRef.current, motion.current.tint * 0.36);
    emberMat.opacity = (0.12 + motion.current.heat * 0.3 + motion.current.pulse * 0.22) * (isDark ? 0.9 : 0.64);
    const emberScale = 1 + motion.current.pulse * 0.05;
    emberRing.scale.set(emberScale, emberScale, emberScale);

    const sparkEnergy = 0.12 + motion.current.charge * 0.75 + motion.current.sparkBurst * 0.6;
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      const seed = sparkSeeds[i];
      const idx = i * 3;
      const orbitSpeed = seed.speed * (0.36 + motion.current.charge * 0.82 + motion.current.spin * 0.2);
      const swirl = seed.offset + t * orbitSpeed;
      const radial = seed.orbit * (0.7 + motion.current.charge * 0.35 + motion.current.impact * 0.2);
      const jitter = Math.sin(t * 11 + seed.offset * 3.2) * seed.drift * (1 + motion.current.wobble * 1.8);

      let x = Math.cos(swirl) * radial + jitter;
      let z = Math.sin(swirl) * radial + jitter * 0.8;
      let y =
        -0.76 +
        seed.rise * (0.2 + sparkEnergy * 0.88) +
        Math.abs(Math.sin(t * (1.8 + seed.speed) + seed.offset)) * (0.08 + sparkEnergy * 0.18);

      if (phase === 'destroy' || phase === 'error') {
        const burst = 1 + motion.current.sparkBurst * 0.4;
        x *= burst;
        z *= burst;
        y *= 0.88;
      }

      sparkPositions[idx] = x;
      sparkPositions[idx + 1] = y + motion.current.lift * 0.35;
      sparkPositions[idx + 2] = z;
    }

    if (sparkAttrRef.current) {
      sparkAttrRef.current.needsUpdate = true;
    }

    sparkMat.color.copy(
      phase === 'success'
        ? palette.success
        : phase === 'downgrade' || phase === 'destroy' || phase === 'error'
          ? palette.fail
          : palette.heat
    );
    sparkMat.opacity = (0.12 + sparkEnergy * 0.6) * (isDark ? 0.94 : 0.72);
    sparkMat.size = 0.012 + sparkEnergy * 0.028;

    if (sparkRef.current) {
      sparkRef.current.rotation.y += delta * (0.09 + motion.current.spin * 0.36);
    }
  });

  return (
    <group ref={rigRef}>
      <mesh position={[0, -0.98, 0]}>
        <cylinderGeometry args={[1.86, 2.08, 0.56, 80]} />
        <meshStandardMaterial ref={platformMatRef} color="#d7e3ef" metalness={0.62} roughness={0.42} />
      </mesh>

      <mesh ref={emberRingRef} position={[0, -0.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.42, 0.07, 20, 92]} />
        <meshBasicMaterial
          ref={emberMatRef}
          color="#f97316"
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <group ref={canRef} position={[0, 0.08, 0]}>
        <mesh>
          <cylinderGeometry args={[0.83, 0.83, 1.32, 72]} />
          <meshPhysicalMaterial
            ref={bodyMatRef}
            color="#dce7f3"
            metalness={0.92}
            roughness={0.22}
            clearcoat={0.56}
            clearcoatRoughness={0.3}
          />
        </mesh>

        <mesh>
          <cylinderGeometry args={[0.845, 0.845, 0.64, 72, 1, true]} />
          <meshStandardMaterial ref={labelMatRef} color="#1f6fe5" metalness={0.28} roughness={0.46} />
        </mesh>

        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.84, 0.84, 0.09, 72]} />
          <meshStandardMaterial ref={lidMatRef} color="#dbe5f0" metalness={0.96} roughness={0.2} />
        </mesh>

        <mesh position={[0, -0.7, 0]}>
          <cylinderGeometry args={[0.84, 0.84, 0.09, 72]} />
          <meshStandardMaterial color="#d3dfea" metalness={0.94} roughness={0.22} />
        </mesh>

        <mesh position={[0, 0.39, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.825, 0.024, 14, 80]} />
          <meshStandardMaterial color="#d9e4ef" metalness={0.92} roughness={0.26} />
        </mesh>

        <mesh position={[0, -0.39, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.825, 0.024, 14, 80]} />
          <meshStandardMaterial color="#d9e4ef" metalness={0.92} roughness={0.26} />
        </mesh>

        <mesh position={[0.03, 0.74, 0.02]} rotation={[Math.PI / 2, 0.2, 0.1]}>
          <torusGeometry args={[0.24, 0.046, 20, 58]} />
          <meshStandardMaterial ref={tabMatRef} color="#e5e7eb" metalness={0.9} roughness={0.24} />
        </mesh>

        <mesh position={[0.21, 0.735, 0.05]} rotation={[0.06, 0.25, 0]}>
          <boxGeometry args={[0.19, 0.05, 0.1]} />
          <meshStandardMaterial color="#dde5ef" metalness={0.88} roughness={0.26} />
        </mesh>
      </group>

      <mesh ref={auraRef} position={[0, 0.12, 0]}>
        <sphereGeometry args={[1.02, 36, 28]} />
        <meshBasicMaterial
          ref={auraMatRef}
          color="#ffffff"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={shockwaveRef} position={[0, -0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.06, 18, 88]} />
        <meshBasicMaterial
          ref={shockwaveMatRef}
          color="#ffffff"
          transparent
          opacity={0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <points ref={sparkRef} position={[0, 0, 0]}>
        <bufferGeometry>
          <bufferAttribute ref={sparkAttrRef} attach="attributes-position" args={[sparkPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={sparkMatRef}
          size={0.028}
          color="#fb923c"
          transparent
          opacity={0.72}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

export default function ForgeScene({ phase, level }: ForgeSceneProps) {
  const isDark = useIsDarkTheme();

  const isFailure = phase === 'downgrade' || phase === 'destroy' || phase === 'error';
  const isSuccess = phase === 'success';

  const bloomIntensity =
    (isSuccess ? 1.12 : isFailure ? 0.92 : phase === 'charging' ? 0.78 : 0.28) * (isDark ? 0.74 : 0.48);

  const keyLightBoost = isSuccess ? 1.18 : isFailure ? 0.96 : phase === 'charging' ? 1.08 : 0.9;
  const forgeLightColor = isSuccess ? '#facc15' : isFailure ? '#ef4444' : '#fb923c';

  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_52%_42%,rgba(251,146,60,0.16)_0%,rgba(15,23,42,0)_58%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_84%,rgba(56,189,248,0.13)_0%,rgba(15,23,42,0)_64%)]" />

      <Canvas
        camera={{ position: [0, 0.72, 5.05], fov: 34 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={isDark ? 0.34 : 0.24} />
        <hemisphereLight
          intensity={(isDark ? 0.38 : 0.28) * keyLightBoost}
          color={isDark ? '#eff6ff' : '#f8fafc'}
          groundColor={isDark ? '#1e293b' : '#cbd5e1'}
        />

        <spotLight
          position={[2.7, 4, 2.8]}
          angle={0.48}
          penumbra={0.72}
          intensity={(isDark ? 1.15 : 0.76) * keyLightBoost}
          color="#e2e8f0"
        />

        <pointLight
          position={[-2.3, 0.58, 1.86]}
          intensity={(isDark ? 0.62 : 0.42) * keyLightBoost}
          color={forgeLightColor}
        />
        <pointLight position={[0, -0.5, 0.5]} intensity={isDark ? 0.28 : 0.2} color="#fb923c" />

        <TunaCanModel phase={phase} level={level} isDark={isDark} />

        <EffectComposer enableNormalPass={false}>
          <Bloom intensity={bloomIntensity} luminanceThreshold={0.08} luminanceSmoothing={0.2} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
