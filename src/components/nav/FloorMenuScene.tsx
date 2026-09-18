import { useEffect } from 'react';
import { surfaceStore } from '../../lib/motion/surface-store';
import type { SurfaceStateId } from '../../lib/motion/surface-materials';
import {
  NAV_MENU_FINISH_EVENT,
  NAV_MENU_STATE_EVENT,
  type FloorFinishKey,
  type NavMenuFinishDetail,
  type NavMenuStateDetail,
} from './nav-destinations';

/**
 * The live floor behind the full-screen menu.
 *
 * WHAT THIS FILE USED TO BE. A 350-line R3F scene with its own `MeshPhysicalMaterial`,
 * its own `onBeforeCompile` chunk (`ffePearl` / `ffeWarmGrey` / `ffeSaltPepper` /
 * `ffeCobaltMetallic` / `ffeBaseFloor` / `ffeKeepLegible`), its own PMREM environment,
 * its own `uSweep` tween and its own `<Canvas>` — a second WebGL context and a second
 * material system describing the same floors `SURFACE_MATERIALS` already describes.
 *
 * WHAT IT IS NOW. The bridge between the menu's two events and the surface store:
 * the menu claims a rectangle of the one canvas, and a hover is a `morphTo` on the
 * shared material. The rendering is `SurfaceFloor`'s `nav-floor` view — the same
 * plane, the same clearcoat, the same flake shader, a closer lens.
 *
 * Nothing was lost that the shared material does not already do, with one named
 * exception: `ffeKeepLegible`, which lifted any finish toward white so menu type
 * stayed readable on it. Its job is now geometry plus the shared material's own
 * `uPlaneOpacity`/fade ramp, and the menu's contrast is measured in nav.spec.
 *
 * The CSS floor in nav-menu.css remains the whole floor at `balanced`/`still`, after
 * a lost context, and for anyone the surface plane never admitted — this file
 * registers nothing in those cases, so the gradient simply stays visible.
 */

/**
 * Destination finish -> shared material state.
 *
 * `pearl` is the cured pour (2), `warm-grey-flake` the flake broadcast (3),
 * `salt-pepper-flake` the ground speckle (1), `cobalt-metallic` the metallic pour (5)
 * and `paper` the palette's own paper (7) — the "no finish here" answer for
 * /resources. Every id is an index into SURFACE_MATERIALS, so the table in
 * surface-materials.ts stays the only description of what a floor looks like.
 */
export const FLOOR_FINISH_STATES: Readonly<Record<FloorFinishKey, SurfaceStateId>> = Object.freeze({
  pearl: 2,
  'warm-grey-flake': 3,
  'salt-pepper-flake': 1,
  'cobalt-metallic': 5,
  paper: 7,
});

/** The floor an open menu rests on before anything is hovered: the cured pour. */
export const MENU_IDLE_STATE: SurfaceStateId = 2;

export function floorFinishState(finish: FloorFinishKey | null): SurfaceStateId {
  return finish === null ? MENU_IDLE_STATE : FLOOR_FINISH_STATES[finish];
}

export default function FloorMenuScene() {
  useEffect(() => {
    // Releasing is all it takes to put the page's floor back: the store parked the
    // journey's target when the menu claimed the plane.
    const release = () => surfaceStore.setMenuFloor(null);

    const onState = (event: Event) => {
      const detail = (event as CustomEvent<NavMenuStateDetail>).detail;
      if (!detail.open) {
        release();
        return;
      }
      const floor = document.querySelector<HTMLElement>('[data-nav-menu-floor]');
      if (!floor) return;
      surfaceStore.setMenuFloor(floor);
      surfaceStore.morphTo(MENU_IDLE_STATE);
      // One traverse of the specular band as the menu arrives, not a `repeat: -1`
      // loop: a menu left open must be able to reach zero frames like everything else.
      surfaceStore.sweep(2.6);
    };

    const onFinish = (event: Event) => {
      if (surfaceStore.getSnapshot().menuOpen !== true) return;
      surfaceStore.morphTo(floorFinishState((event as CustomEvent<NavMenuFinishDetail>).detail.finish));
    };

    window.addEventListener(NAV_MENU_STATE_EVENT, onState);
    window.addEventListener(NAV_MENU_FINISH_EVENT, onFinish);
    return () => {
      window.removeEventListener(NAV_MENU_STATE_EVENT, onState);
      window.removeEventListener(NAV_MENU_FINISH_EVENT, onFinish);
      release();
    };
  }, []);

  return null;
}
