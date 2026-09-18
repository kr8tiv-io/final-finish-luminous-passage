import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Draggable } from 'gsap/Draggable';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Flip } from 'gsap/Flip';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { Observer } from 'gsap/Observer';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

let ready = false;

export function ensureGsapKit() {
  if (ready) return;
  gsap.registerPlugin(
    CustomEase,
    Draggable,
    DrawSVGPlugin,
    Flip,
    InertiaPlugin,
    MotionPathPlugin,
    Observer,
    ScrambleTextPlugin,
    ScrollTrigger,
    SplitText,
  );
  CustomEase.create('alcove', 'M0,0 C0.16,1 0.3,1 1,1');
  CustomEase.create('filmIn', 'M0,0 C0.11,0.64 0.18,1 1,1');
  CustomEase.create('filmOut', 'M0,0 C0.7,0 0.84,0.36 1,1');
  ready = true;
}

/**
 * Kill every ScrollTrigger in the document, and forget the scroll positions they
 * memorised. Returns how many were killed, so a caller can assert on the number.
 *
 * A client-side navigation replaces the body under GSAP's feet: every trigger that
 * measured the outgoing page is now measuring a detached node, and ScrollTrigger's
 * own `scrollerCache` would hand the next document the previous one's scroll. This
 * is deliberately unconditional — nothing that survives a swap in this project
 * (`SurfaceCanvas`, the header ribbon) uses ScrollTrigger, so "all of them" and
 * "all the outgoing document's" are the same set.
 */
export function killRouteScrollTriggers(): number {
  if (typeof window === 'undefined') return 0;
  const triggers = ScrollTrigger.getAll();
  triggers.forEach((trigger) => trigger.kill());
  ScrollTrigger.clearScrollMemory();
  return triggers.length;
}

/**
 * Kill every ScrollTrigger whose trigger (or pinned) element is no longer in the
 * document. Returns how many were killed.
 *
 * The narrow counterpart to `killRouteScrollTriggers`, for the window *after* a swap.
 * A module script from a document that has been swapped away can still be listening
 * to `<html>` — `resin-reveal.ts` and `preparation-layers.ts` both keep a
 * `MutationObserver` on `data-journey-tier` and rebuild on it — and the swap changes
 * exactly that attribute. Whatever such a listener rebuilds is by definition rooted
 * in a node that is no longer in the document, so it can be identified and killed
 * without knowing which script produced it. Live triggers are never touched: a
 * trigger with no element, or one whose element is still connected, is left alone.
 */
export function killDetachedScrollTriggers(): number {
  if (typeof document === 'undefined') return 0;
  const stale = ScrollTrigger.getAll().filter((trigger) => {
    const element = (trigger.trigger ?? trigger.pin) as Node | undefined;
    return element instanceof Node && !element.isConnected;
  });
  stale.forEach((trigger) => trigger.kill());
  return stale.length;
}

/**
 * Kill every tween whose targets are all DOM nodes that are no longer in the
 * document. Returns how many were killed.
 *
 * The complement of `killRouteScrollTriggers`: a scroll-linked tween dies with its
 * trigger, but a `gsap.to` started from a page script — a hover reversal caught
 * mid-flight, an entrance that had not finished — keeps its targets alive and keeps
 * asking the ticker for frames forever. Called on `astro:after-swap`, which is the
 * first moment the outgoing nodes actually read as disconnected. Tweens on plain
 * objects (every shader uniform in `SurfaceFloor`) have no `Node` targets and are
 * never touched.
 */
export function killDetachedMotion(): number {
  if (typeof document === 'undefined') return 0;
  let killed = 0;
  for (const child of gsap.globalTimeline.getChildren(true, true, false)) {
    const read = (child as gsap.core.Tween).targets;
    if (typeof read !== 'function') continue;
    const targets = read.call(child) as unknown[];
    if (targets.length === 0) continue;
    if (!targets.every((target) => target instanceof Node && !target.isConnected)) continue;
    child.kill();
    killed += 1;
  }
  return killed;
}

export {
  CustomEase,
  Draggable,
  DrawSVGPlugin,
  Flip,
  InertiaPlugin,
  MotionPathPlugin,
  Observer,
  ScrambleTextPlugin,
  ScrollTrigger,
  SplitText,
};
