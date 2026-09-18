import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import FloorMenuScene from './FloorMenuScene';
import {
  NAV_MENU_FINISH_EVENT,
  NAV_MENU_STATE_EVENT,
  type FloorFinishKey,
  type NavMenuFinishDetail,
  type NavMenuStateDetail,
} from './nav-destinations';

/**
 * The menu's floor island. It hydrates at idle and then does nothing but listen;
 * the <Canvas> is mounted only while the menu is open and unmounted on close, so
 * a closed menu costs one event listener and no WebGL context.
 *
 * Note for Step 15: on the homepage `FilmVeil` already owns a canvas inside
 * <main>, so while this menu is open the document holds two. That is deliberate
 * for this spike — Step 15 re-homes every scene into the layout-level
 * `SurfaceCanvas` with drei <View>s, and this floor becomes one of those views.
 */

function floorIsSupported() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const root = document.documentElement;
  if (root.dataset.journeyTier === 'still' || root.dataset.journeyMotion === 'still') return false;
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

export default function NavMenuFloor() {
  const [mounted, setMounted] = useState(false);
  const [finish, setFinish] = useState<FloorFinishKey | null>(null);
  const contextLost = useRef(false);
  const teardown = useRef(false);
  const frames = useRef<number[]>([]);

  useEffect(() => {
    const cancelFrames = () => {
      frames.current.forEach((handle) => cancelAnimationFrame(handle));
      frames.current = [];
    };

    const onState = (event: Event) => {
      const detail = (event as CustomEvent<NavMenuStateDetail>).detail;
      cancelFrames();
      if (!detail.open) {
        contextLost.current = false;
        teardown.current = true;
        setMounted(false);
        setFinish(null);
        return;
      }
      teardown.current = false;
      if (contextLost.current || !floorIsSupported()) return;
      // Two frames of daylight: the Flip owns the opening moment, the floor
      // blooms in underneath it. Keeps context creation off the open transition.
      frames.current.push(
        requestAnimationFrame(() => {
          frames.current.push(requestAnimationFrame(() => setMounted(true)));
        }),
      );
    };

    const onFinish = (event: Event) => {
      setFinish((event as CustomEvent<NavMenuFinishDetail>).detail.finish);
    };

    window.addEventListener(NAV_MENU_STATE_EVENT, onState);
    window.addEventListener(NAV_MENU_FINISH_EVENT, onFinish);
    return () => {
      cancelFrames();
      window.removeEventListener(NAV_MENU_STATE_EVENT, onState);
      window.removeEventListener(NAV_MENU_FINISH_EVENT, onFinish);
    };
  }, []);

  if (!mounted) return null;

  return (
    <Canvas
      flat
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ fov: 58, near: 0.1, far: 160, position: [0, 1.55, 3.1] }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.domElement.dataset.navFloor = 'live';
        gl.domElement.addEventListener(
          'webglcontextlost',
          (event) => {
            // Hand the floor back to the CSS gradient underneath and keep the
            // menu fully usable. A loss we caused ourselves while tearing the
            // canvas down is not a failure and must not block the next open.
            event.preventDefault();
            if (teardown.current) return;
            contextLost.current = true;
            setMounted(false);
          },
          { once: true },
        );
      }}
    >
      <FloorMenuScene finish={finish} />
    </Canvas>
  );
}
