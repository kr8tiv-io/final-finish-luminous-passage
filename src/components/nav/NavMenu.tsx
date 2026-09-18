import FloorMenuScene from './FloorMenuScene';

/**
 * The menu's floor island.
 *
 * It used to mount a `<Canvas>` on open and tear it down on close, which meant the
 * homepage held two WebGL contexts while the menu was up (three canvases in the
 * document) and every open paid for a context creation, a PMREM bake and a shader
 * link. Step 18a folded that scene into the one layout-level canvas as its
 * `nav-floor` view, so this island now hydrates once, listens, and mounts nothing:
 * `FloorMenuScene` translates the menu's open/close and hover events into the
 * surface store, and `SurfaceFloor` does the drawing.
 *
 * The admission decision moved with it. This file no longer probes WebGL2 or reads
 * the tier: `SurfaceCanvas` already made that call for the whole page, and a second
 * copy of the rule here is exactly the kind of second owner that has broken this
 * codebase before. When the plane was refused (reduced motion, `still`, a coarse
 * pointer, a lost context) no view is registered and the CSS gradient in
 * nav-menu.css is the floor, unchanged.
 */
export default function NavMenuFloor() {
  return <FloorMenuScene />;
}
