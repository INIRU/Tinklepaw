'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Sparkles, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import * as THREE from 'three';

type GachaSceneProps = {
  isDrawing: boolean;
  rarity?: string | null;
  onAnimationCompleteAction?: () => void;
  poolBannerUrl?: string | null;
  poolName?: string | null;
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
const BASE_LABEL_COLOR = new THREE.Color('#f8f4ff');
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
  shell: number;
  focus: number;
  drift: number;
  open: number;
  core: number;
  burst: number;
  flash: number;
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
  shell: 0,
  focus: 0,
  drift: 0,
  open: 0,
  core: 0,
  burst: 0,
  flash: 0,
});

function createFallbackLabelTexture(poolName: string | null | undefined) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.wrapS = THREE.RepeatWrapping;
    fallback.wrapT = THREE.ClampToEdgeWrapping;
    fallback.repeat.set(1, 1);
    return fallback;
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#2f2449');
  gradient.addColorStop(0.5, '#61336d');
  gradient.addColorStop(1, '#3d1f42');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.22;
  for (let i = -1; i <= 6; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ffd4ef';
    ctx.fillRect(i * 180, 0, 90, canvas.height);
  }
  ctx.globalAlpha = 1;

  const title = (poolName?.trim() || 'BANGULNYANG DRAW').slice(0, 26);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '700 44px ui-sans-serif, system-ui, -apple-system';
  ctx.shadowColor = 'rgba(0,0,0,0.36)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#fff8ff';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 8);

  ctx.shadowBlur = 0;
  ctx.font = '600 24px ui-sans-serif, system-ui, -apple-system';
  ctx.fillStyle = 'rgba(255, 232, 248, 0.92)';
  ctx.fillText('LIMITED GACHA', canvas.width / 2, canvas.height / 2 + 54);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function CinematicCapsule({
  isDrawing,
  rarity,
  cameraRef,
  labelTexture,
  onComplete,
}: {
  isDrawing: boolean;
  rarity?: string | null;
  cameraRef: { current: THREE.PerspectiveCamera | null };
  labelTexture: THREE.Texture | null;
  onComplete?: () => void;
}) {
  const { viewport } = useThree();
  const isMobile = viewport.width < 3;
  const baseScale = isMobile ? 0.55 : 1;
  const motionScale = isMobile ? 0.8 : 1;

  const isSSS = rarity === 'SSS';

  const group = useRef<THREE.Group>(null);
  const topRef = useRef<THREE.Mesh>(null);
  const bottomRef = useRef<THREE.Mesh>(null);
  const bandRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const shockRef = useRef<THREE.Mesh>(null);
  const shockEchoRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const labelWrapRef = useRef<THREE.Mesh>(null);

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
      ring: 0.45,
      drift: 0.2,
      duration: 0.45 * pacing,
      ease: 'power2.out',
    })
      .to(
        motion.current,
        {
          shake: 0.45 * tensionBoost,
          crack: 0.4,
          glow: 0.45,
          heartbeat: 0.4,
          ring: 0.75,
          shell: 0.35,
          focus: 0.28,
          duration: 0.7 * pacing,
          ease: 'sine.inOut',
        },
        '<',
      )
      .to(motion.current, {
        shake: 1.15 * tensionBoost,
        crack: 1,
        glow: 1,
        heartbeat: 1,
        ring: 1,
        shell: 0.92,
        focus: 0.68,
        duration: 1.2 * pacing,
        ease: 'power2.inOut',
      })
      .to(motion.current, {
        fakePause: 1,
        shake: 0.08,
        crack: 0.22,
        heartbeat: 0.14,
        ring: 0.82,
        focus: 0.42,
        duration: 0.14 * pacing,
        ease: 'power2.out',
      })
      .to(motion.current, {
        fakePause: 0,
        shake: 1.85 * tensionBoost,
        crack: 1.35,
        glow: 1.4,
        heartbeat: 1.45,
        shell: 1.2,
        focus: 1,
        drift: 1,
        duration: 0.42 * pacing,
        ease: 'power3.in',
      })
      .to(motion.current, {
        open: 1,
        core: 1,
        burst: 1,
        flash: 1,
        shake: 0.02,
        heartbeat: 0,
        duration: (isSSS ? 0.98 : 0.86) * pacing,
        ease: 'expo.in',
      })
      .to(
        motion.current,
        {
          flash: 0,
          ring: 0,
          shell: 0.12,
          focus: 0.2,
          duration: 0.32 * pacing,
          ease: 'sine.out',
        },
        '-=0.2',
      )
      .to(motion.current, {
        burst: 0.25,
        shell: 0,
        focus: 0,
        drift: 0,
        duration: 0.25,
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
    const camera = cameraRef.current;
    if (!group.current || !topRef.current || !bottomRef.current || !bandRef.current || !coreRef.current || !camera) {
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
    const shellMat = shellRef.current ? (shellRef.current.material as THREE.MeshStandardMaterial) : null;
    const labelWrapMat = labelWrapRef.current ? (labelWrapRef.current.material as THREE.MeshStandardMaterial) : null;

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

      if (labelWrapRef.current && labelWrapMat) {
        const idleWrapScale = THREE.MathUtils.lerp(labelWrapRef.current.scale.x, 1, delta * 6);
        labelWrapRef.current.scale.setScalar(idleWrapScale);
        labelWrapMat.color.lerp(BASE_LABEL_COLOR, delta * 4);
        labelWrapMat.emissive.lerp(BLACK, delta * 4);
        labelWrapMat.emissiveIntensity = THREE.MathUtils.lerp(labelWrapMat.emissiveIntensity, 0.06, delta * 6);
        labelWrapMat.opacity = THREE.MathUtils.lerp(labelWrapMat.opacity, 0.92, delta * 6);
      }

      coreRef.current.scale.setScalar(THREE.MathUtils.lerp(coreRef.current.scale.x, 0, delta * 6));
      coreMat.color.copy(BLACK);
      coreMat.emissive.copy(BLACK);
      coreMat.emissiveIntensity = THREE.MathUtils.lerp(coreMat.emissiveIntensity, 0, delta * 6);

      if (shellRef.current && shellMat) {
        const shellScale = THREE.MathUtils.lerp(shellRef.current.scale.x, 0.001, delta * 5);
        shellRef.current.scale.setScalar(shellScale);
        shellMat.opacity = THREE.MathUtils.lerp(shellMat.opacity, 0, delta * 5);
        shellMat.emissiveIntensity = THREE.MathUtils.lerp(shellMat.emissiveIntensity, 0, delta * 5);
      }

      if (shockRef.current) {
        const shockMat = shockRef.current.material as THREE.MeshBasicMaterial;
        const currentScale = THREE.MathUtils.lerp(shockRef.current.scale.x, 0, delta * 4);
        shockRef.current.scale.setScalar(currentScale);
        shockMat.opacity = THREE.MathUtils.lerp(shockMat.opacity, 0, delta * 4);
      }

      if (shockEchoRef.current) {
        const shockEchoMat = shockEchoRef.current.material as THREE.MeshBasicMaterial;
        const currentScale = THREE.MathUtils.lerp(shockEchoRef.current.scale.x, 0, delta * 4);
        shockEchoRef.current.scale.setScalar(currentScale);
        shockEchoMat.opacity = THREE.MathUtils.lerp(shockEchoMat.opacity, 0, delta * 4);
      }

      if (flashRef.current) {
        const flashMat = flashRef.current.material as THREE.MeshBasicMaterial;
        const flashScale = THREE.MathUtils.lerp(flashRef.current.scale.x, 0, delta * 5);
        flashRef.current.scale.setScalar(flashScale);
        flashMat.opacity = THREE.MathUtils.lerp(flashMat.opacity, 0, delta * 5);
      }

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, delta * 5);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0, delta * 5);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, 5, delta * 4);

      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const perspectiveCamera = camera as THREE.PerspectiveCamera;
        perspectiveCamera.fov = THREE.MathUtils.lerp(perspectiveCamera.fov, 50, delta * 4);
        perspectiveCamera.updateProjectionMatrix();
      }

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
    const orbitAmount = anim.drift * (isSSS ? 0.09 : 0.07) * (reduced ? 0.6 : 1);
    const orbitX = Math.sin(elapsed * (isSSS ? 2.8 : 2.4)) * orbitAmount;
    const orbitY = Math.cos(elapsed * (isSSS ? 2.4 : 2.1)) * orbitAmount * 0.7;

    group.current.position.x = jitterX + orbitX;
    group.current.position.y = jitterY + orbitY + Math.sin(elapsed * 6) * 0.01 * heartbeatPulse;
    group.current.position.z = THREE.MathUtils.lerp(
      group.current.position.z,
      -0.15 * anim.center - 0.32 * anim.open - anim.focus * 0.12 + anim.fakePause * 0.04,
      delta * 6,
    );

    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      0.06 + Math.sin(elapsed * 4) * 0.02 * heartbeatPulse + anim.focus * 0.05,
      delta * 7,
    );
    group.current.rotation.y += delta * (1.2 + anim.spin * (isSSS ? 14.5 : 10.5) - anim.fakePause * 0.6);
    group.current.rotation.z = THREE.MathUtils.lerp(
      group.current.rotation.z,
      Math.PI / 4 - anim.center * 0.7 + Math.sin(elapsed * 7.5) * 0.035 * anim.focus,
      delta * 6,
    );

    const cinematicZoom =
      1 + anim.glow * 0.06 + anim.focus * 0.05 + anim.burst * 0.24 - anim.fakePause * 0.04;
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
      anim.open * (isSSS ? 2.4 : 1.9) +
      anim.shell * 0.45;

    topMat.color.copy(BASE_TOP_COLOR).lerp(targetThreeColor, colorMix);
    topMat.emissive.copy(targetThreeColor);
    topMat.emissiveIntensity = emissiveStrength;

    bottomMat.color.copy(BASE_BOTTOM_COLOR).lerp(targetThreeColor, colorMix);
    bottomMat.emissive.copy(targetThreeColor);
    bottomMat.emissiveIntensity = emissiveStrength;

    const ringScale = Math.max(0.001, 1 - anim.open * 0.96 + heartbeatPulse * 0.05 - anim.fakePause * 0.04);
    bandRef.current.scale.setScalar(ringScale);
    bandMat.color.copy(BASE_BAND_COLOR).lerp(targetThreeColor, 0.22 + anim.ring * 0.74);
    bandMat.emissive.copy(targetThreeColor);
    bandMat.emissiveIntensity = 0.12 + anim.ring * 2.6 + heartbeatPulse * 0.6;

    if (labelWrapRef.current && labelWrapMat) {
      const wrapPulse = 1 + anim.glow * 0.05 + heartbeatPulse * 0.02;
      const wrapCollapse = Math.max(0.001, 1 - anim.crack * 0.52 - anim.open * 1.12 - anim.burst * 0.36);
      const wrapScale = wrapPulse * wrapCollapse;
      const currentWrapScale = THREE.MathUtils.lerp(labelWrapRef.current.scale.x, wrapScale, delta * 10);
      labelWrapRef.current.scale.setScalar(currentWrapScale);
      labelWrapMat.color.copy(BASE_LABEL_COLOR).lerp(targetThreeColor, 0.06 + anim.glow * 0.2);
      labelWrapMat.emissive.copy(targetThreeColor);
      labelWrapMat.emissiveIntensity = Math.max(
        0,
        0.08 + anim.glow * 0.52 - anim.crack * 0.28 - anim.open * 0.64 - anim.burst * 0.42,
      );
      labelWrapMat.opacity = THREE.MathUtils.clamp(
        0.9 + anim.glow * 0.04 - anim.crack * 0.38 - anim.open * 0.98 - anim.burst * 0.48,
        0,
        0.95,
      );
    }

    const coreScale =
      0.08 +
      anim.glow * 0.75 +
      anim.core * (isSSS ? 10.6 : 9.1) +
      anim.focus * 0.18 +
      anim.burst * (isSSS ? 1.6 : 1.2);
    coreRef.current.scale.setScalar(coreScale);
    coreMat.color.copy(targetThreeColor);
    coreMat.emissive.copy(targetThreeColor);
    coreMat.emissiveIntensity =
      0.3 + anim.glow * 2 + anim.core * (isSSS ? 7 : 5.5) + anim.burst * (isSSS ? 6 : 4.4);

    if (shellRef.current && shellMat) {
      const shellPulse = (Math.sin(elapsed * 11) + 1) * 0.5;
      const shellScale =
        1.04 +
        anim.shell * (isSSS ? 0.52 : 0.4) +
        shellPulse * 0.06 * anim.heartbeat +
        anim.burst * (isSSS ? 1.3 : 0.9);
      shellRef.current.scale.setScalar(shellScale);
      shellRef.current.rotation.x += delta * (0.5 + anim.shell * 2.1);
      shellRef.current.rotation.y += delta * (0.8 + anim.shell * 2.5);
      shellMat.color.copy(targetThreeColor);
      shellMat.emissive.copy(targetThreeColor);
      shellMat.emissiveIntensity =
        0.18 + anim.shell * (isSSS ? 1.8 : 1.2) + anim.burst * (isSSS ? 1.3 : 1);
      shellMat.opacity = THREE.MathUtils.clamp(
        0.03 + anim.shell * (isSSS ? 0.3 : 0.24) + anim.burst * (isSSS ? 0.32 : 0.22),
        0,
        0.78,
      );
    }

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

    if (shockEchoRef.current) {
      const shockEchoMat = shockEchoRef.current.material as THREE.MeshBasicMaterial;
      const echoBurst = Math.max(anim.burst - 0.12, 0);
      const shockEchoScale = 1.45 + echoBurst * (isSSS ? 9.5 : 7);
      shockEchoRef.current.scale.setScalar(shockEchoScale);
      shockEchoMat.opacity = THREE.MathUtils.clamp(
        (isSSS ? 0.32 : 0.2) * echoBurst * (1 - anim.open * 0.35),
        0,
        0.65,
      );
      shockEchoMat.color.set(isSSS ? COLORS.SSS : targetColor);
    }

    if (flashRef.current) {
      const flashMat = flashRef.current.material as THREE.MeshBasicMaterial;
      const flashScale = 0.8 + anim.flash * (isSSS ? 8.5 : 6.5) + anim.burst * 2.2;
      flashRef.current.scale.setScalar(flashScale);
      flashMat.opacity = THREE.MathUtils.clamp(
        anim.flash * (isSSS ? 0.72 : 0.55) + anim.burst * (isSSS ? 0.18 : 0.12),
        0,
        0.9,
      );
      flashMat.color.set(isSSS ? COLORS.SSS : targetColor);
    }

    const cameraJolt = anim.focus * (isSSS ? 0.45 : 0.34);
    camera.position.x = THREE.MathUtils.lerp(
      camera.position.x,
      jitterX * 0.35 + orbitX * 0.4 + Math.sin(elapsed * 17) * 0.01 * cameraJolt,
      delta * 7,
    );
    camera.position.y = THREE.MathUtils.lerp(
      camera.position.y,
      jitterY * 0.3 + orbitY * 0.35 + Math.cos(elapsed * 15) * 0.012 * cameraJolt,
      delta * 7,
    );
    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z,
      5 - anim.center * 0.35 - anim.open * 1.35 - anim.focus * 0.42 + anim.fakePause * 0.14,
      delta * 6,
    );

    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspectiveCamera = camera as THREE.PerspectiveCamera;
      const targetFov =
        50 - anim.focus * (isSSS ? 8.5 : 7) + anim.burst * (isSSS ? 8 : 6.5) + anim.fakePause * 1.4;
      perspectiveCamera.fov = THREE.MathUtils.lerp(perspectiveCamera.fov, targetFov, delta * 8);
      perspectiveCamera.updateProjectionMatrix();
    }

    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <group ref={group} rotation={[0, 0, Math.PI / 4]}>
        {/* Top Half (Darker Plastic) */}
        <mesh ref={topRef} position={[0, 0, 0]}>
          <sphereGeometry args={[1.2, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2 + 0.08]} />
          <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Bottom Half (Darker Plastic) */}
        <mesh ref={bottomRef} rotation={[Math.PI, 0, 0]} position={[0, 0, 0]}>
          <sphereGeometry args={[1.2, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2 + 0.08]} />
          <meshStandardMaterial color="#999" metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Band (Mechanical Ring) */}
        <mesh ref={bandRef} rotation={[Math.PI / 2, 0, 0]} visible={false}>
          <torusGeometry args={[1.25, 0.1, 16, 100]} />
          <meshStandardMaterial color="#444" metalness={0.8} roughness={0.2} />
        </mesh>

        <mesh ref={labelWrapRef}>
          <sphereGeometry args={[1.212, 96, 64, 0, Math.PI * 2, Math.PI * 0.31, Math.PI * 0.38]} />
          <meshStandardMaterial
            map={labelTexture ?? undefined}
            color="#f8f4ff"
            metalness={0.18}
            roughness={0.44}
            emissive="#000"
            emissiveIntensity={0.06}
            transparent
            opacity={0.92}
          />
        </mesh>

        {/* Inner Core (The Item Light) */}
        <mesh ref={coreRef} scale={[0, 0, 0]}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshStandardMaterial color="#000" emissive="#000" emissiveIntensity={0} />
        </mesh>

        {/* Energy Shell */}
        <mesh ref={shellRef} scale={[0.001, 0.001, 0.001]}>
          <icosahedronGeometry args={[1.32, 2]} />
          <meshStandardMaterial
            color="#000"
            emissive="#000"
            emissiveIntensity={0}
            transparent
            opacity={0}
            wireframe
            depthWrite={false}
          />
        </mesh>

        {/* Primary Shockwave */}
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

        {/* Echo Shockwave */}
        <mesh ref={shockEchoRef} position={[0, 0, 0.2]} scale={[0, 0, 0]}>
          <ringGeometry args={[1.9, 2.08, 64]} />
          <meshBasicMaterial
            color={COLORS.SSS}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Reveal flash */}
      <mesh ref={flashRef} position={[0, 0, 2.15]} scale={[0, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={COLORS.SSS}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

export function GachaScene({
  isDrawing,
  rarity,
  onAnimationCompleteAction,
  poolBannerUrl,
  poolName,
}: GachaSceneProps) {
  const isSSS = rarity === 'SSS';
  const sceneCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [labelTexture, setLabelTexture] = useState<THREE.Texture | null>(null);
  const labelTextureRef = useRef<THREE.Texture | null>(null);

  const setSceneLabelTexture = useCallback((nextTexture: THREE.Texture | null) => {
    const previous = labelTextureRef.current;
    if (previous && previous !== nextTexture) {
      previous.dispose();
    }
    labelTextureRef.current = nextTexture;
    setLabelTexture(nextTexture);
  }, []);

  const sparkleColor = isSSS
    ? COLORS.SSS
    : COLORS[(rarity as keyof typeof COLORS) || 'DEFAULT'];

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const bannerUrl = poolBannerUrl?.trim() ?? '';
    const fallbackTexture = createFallbackLabelTexture(poolName);
    fallbackTexture.needsUpdate = true;

    if (!bannerUrl) {
      setSceneLabelTexture(fallbackTexture);
      return;
    }

    let cancelled = false;
    const textureLoader = new THREE.TextureLoader();

    const onLoadTexture = (loadedTexture: THREE.Texture) => {
      if (cancelled) {
        loadedTexture.dispose();
        return;
      }

      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      loadedTexture.wrapS = THREE.RepeatWrapping;
      loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
      loadedTexture.repeat.set(1, 1);
      loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
      loadedTexture.magFilter = THREE.LinearFilter;
      loadedTexture.generateMipmaps = true;
      loadedTexture.needsUpdate = true;

      fallbackTexture.dispose();
      setSceneLabelTexture(loadedTexture);
    };

    const onErrorTexture = () => {
      if (cancelled) {
        fallbackTexture.dispose();
        return;
      }
      setSceneLabelTexture(fallbackTexture);
    };

    try {
      textureLoader.load(bannerUrl, onLoadTexture, undefined, onErrorTexture);
    } catch {
      onErrorTexture();
    }

    return () => {
      cancelled = true;
    };
  }, [poolBannerUrl, poolName, setSceneLabelTexture]);

  useEffect(() => {
    return () => {
      labelTextureRef.current?.dispose();
      labelTextureRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPrefersReducedMotion(media.matches);

    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const starsSpeed = prefersReducedMotion
    ? 0.15
    : isDrawing
      ? isSSS
        ? 2.2
        : 1.5
      : isSSS
        ? 1.0
        : 0.5;
  const sparkleCount = prefersReducedMotion ? (isSSS ? 28 : 16) : isSSS ? 90 : 45;
  const sparkleScale: [number, number, number] = prefersReducedMotion
    ? isSSS
      ? [4.2, 4.2, 4.2]
      : [3.5, 3.5, 3.5]
    : isSSS
      ? [6, 6, 6]
      : [5, 5, 5];
  const sparkleSpeed = prefersReducedMotion
    ? 0.16
    : isDrawing
      ? isSSS
        ? 1.6
        : 1.05
      : 0.45;
  const sparkleOpacity = prefersReducedMotion
    ? isSSS
      ? 0.24
      : 0.12
    : isDrawing
      ? isSSS
        ? 0.68
        : 0.34
      : isSSS
        ? 0.52
        : 0.18;
  const bloomLuminanceThreshold = prefersReducedMotion
    ? isSSS
      ? 0.32
      : 0.42
    : isDrawing
      ? isSSS
        ? 0.24
        : 0.32
      : isSSS
        ? 0.35
        : 0.5;
  const bloomIntensity = prefersReducedMotion
    ? isSSS
      ? 0.7
      : 0.5
    : isDrawing
      ? isSSS
        ? 1.4
        : 0.9
      : isSSS
        ? 1.0
        : 0.6;
  const bloomRadius = prefersReducedMotion
    ? isSSS
      ? 0.58
      : 0.42
    : isDrawing
      ? isSSS
        ? 0.86
        : 0.64
      : isSSS
        ? 0.7
        : 0.5;

  return (
    <div className="w-full h-full relative">
      <Canvas dpr={[1, 1.8]}>
        <PerspectiveCamera ref={sceneCameraRef} makeDefault position={[0, 0, 5]} />
        
        {/* Cinematic Lighting */}
        <ambientLight intensity={0.8} />
        {/* Rim Light */}
        <spotLight position={[-5, 5, 0]} angle={0.5} penumbra={1} intensity={1.0} color="#fff" />
        {/* Key Light */}
        <directionalLight position={[5, 10, 5]} intensity={0.8} />
        
        {/* Background */}
        <Stars
          radius={100}
          depth={50}
          count={2000}
          factor={3}
          saturation={0}
          fade
          speed={starsSpeed}
        />

        <Sparkles
          count={sparkleCount}
          scale={sparkleScale}
          size={isSSS ? 3 : 2}
          speed={sparkleSpeed}
          opacity={sparkleOpacity}
          color={sparkleColor}
        />
        
        <CinematicCapsule 
          isDrawing={isDrawing} 
          rarity={rarity} 
          cameraRef={sceneCameraRef}
          labelTexture={labelTexture}
          onComplete={onAnimationCompleteAction} 
        />

        <EffectComposer enableNormalPass={false}>
          {/* Subtle Bloom only for the core light */}
          <Bloom
            luminanceThreshold={bloomLuminanceThreshold}
            mipmapBlur
            intensity={bloomIntensity}
            radius={bloomRadius}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
