import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Flip } from 'gsap/Flip';
import { Observer } from 'gsap/Observer';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

let ready = false;

export function ensureVisualizerGsap() {
  if (ready) return;
  gsap.registerPlugin(CustomEase, Flip, Observer, ScrollTrigger, SplitText);
  CustomEase.create('alcove', 'M0,0 C0.16,1 0.3,1 1,1');
  ready = true;
}
