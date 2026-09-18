import gsap from 'gsap';
import { journeyControls } from '../lib/motion/journey-controls';
import { NAV_MENU_STATE_EVENT, type NavMenuStateDetail } from '../components/nav/nav-destinations';

/** The highlight moves; links and their hit areas never do. */
export function initializeHeaderRibbon(header:HTMLElement, navigation:HTMLElement) {
  const highlight = navigation.querySelector<HTMLElement>('[data-nav-highlight]');
  const progress = header.querySelector<HTMLElement>('[data-header-progress]');
  if (!highlight) return () => {};
  journeyControls.hydrate();
  const abort = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const links = [...navigation.querySelectorAll<HTMLAnchorElement>('a')];
  const ribbon=document.querySelector<HTMLElement>('[data-hero-ribbon]');
  const hero=document.querySelector<HTMLElement>('#portico');
  let active:HTMLAnchorElement|null = null;
  let frame=0;
  let disposed=false;
  const still=()=>reduced.matches || journeyControls.getSnapshot().motionPreference==='still';
  /** While the full-screen menu owns the links they are no longer header-sized. */
  const menuOpen=()=>header.hasAttribute('data-menu-open')||header.hasAttribute('data-menu-closing');
  const move=(link:HTMLAnchorElement|null)=>{
    active=link;
    if(!link||menuOpen()) { highlight.dataset.active='false'; return; }
    const box=link.getBoundingClientRect();
    const nav=navigation.getBoundingClientRect();
    if(!box.width || !nav.width) return;
    highlight.dataset.active='true';
    highlight.dataset.target=link.getAttribute('href')??'';
    gsap.to(highlight,{x:box.left-nav.left,y:box.top-nav.top,width:box.width,height:box.height,duration:still()?0:.48,ease:'power3.out',overwrite:true});
  };
  const restore=()=>{
    const focused=links.find(link=>link===document.activeElement);
    move(focused??links.find(link=>link.getAttribute('aria-current')==='page')??null);
  };
  links.forEach(link=>{
    link.addEventListener('pointerenter',()=>move(link),{signal:abort.signal});
    link.addEventListener('focus',()=>move(link),{signal:abort.signal});
  });
  navigation.addEventListener('pointerleave',restore,{signal:abort.signal});
  navigation.addEventListener('focusout',()=>queueMicrotask(()=>{if(!disposed) restore();}),{signal:abort.signal});
  const update=()=>{
    frame=0;
    const range=document.documentElement.scrollHeight-innerHeight;
    progress?.style.setProperty('transform',`scaleX(${range>0?Math.min(1,Math.max(0,scrollY/range)):0})`);
    header.toggleAttribute('data-scrolled',scrollY>28);
    if(ribbon&&hero) {
      const rect=hero.getBoundingClientRect();
      const p=Math.min(1,Math.max(0,-rect.top/Math.max(1,rect.height-innerHeight*.35)));
      ribbon.style.setProperty('--ribbon-progress',String(still()?0:p));
    }
  };
  const schedule=()=>{if(!frame) frame=requestAnimationFrame(update);};
  window.addEventListener('scroll',schedule,{passive:true,signal:abort.signal});
  window.addEventListener('resize',()=>{move(active);schedule();},{passive:true,signal:abort.signal});
  const resize=new ResizeObserver(()=>{move(active);schedule();});
  resize.observe(navigation);
  resize.observe(document.body);
  const onPreference=()=>{header.toggleAttribute('data-header-still',still());move(active);schedule();};
  reduced.addEventListener('change',onPreference,{signal:abort.signal});
  // The menu takes the nav out of the header and hands it back; re-seat the
  // highlight once the returning links have settled at header size.
  window.addEventListener(NAV_MENU_STATE_EVENT,(event)=>{
    const detail=(event as CustomEvent<NavMenuStateDetail>).detail;
    if(detail.open) move(null);
    else if(detail.settled&&!disposed) restore();
  },{signal:abort.signal});
  const unsubscribe=journeyControls.subscribe(onPreference);
  void document.fonts.ready.then(()=>{if(!disposed){restore();schedule();}});
  onPreference();restore();update();
  return ()=>{disposed=true;abort.abort();resize.disconnect();unsubscribe();gsap.killTweensOf(highlight);if(frame)cancelAnimationFrame(frame);};
}
