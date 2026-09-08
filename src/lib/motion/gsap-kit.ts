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
