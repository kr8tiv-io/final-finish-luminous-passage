import{t as e}from"./finish-shader.CXLkh9x_.js";function t(e,t,n=.12){let r=t-n,i=t+n,a=Math.min(1,Math.max(0,(e-r)/Math.max(2**-52,i-r)));return a*a*(3-2*a)}var n=Object.freeze({portico:`/videos/follow-floor/1080/epoxy-pour-pearl.mp4`,foundation:`/videos/follow-floor/1080/epoxy-walkway-pearl.mp4`});function r(e,{viewportWidth:t,tier:r}){return r!==`full`||!Number.isFinite(t)||t<1440?null:n[e]??null}var i=new Set([`foundation`]);function a(e,t){return t===`still`?!1:t===`full`||!i.has(e)}var o=new Set([`ArrowDown`,`ArrowUp`,`PageDown`,`PageUp`,`Home`,`End`,` `,`Spacebar`]);function s(e){return o.has(e)}function c({currentTime:e,desiredTime:t,seeking:n,tolerance:r=.12}){return n||!Number.isFinite(e)||!Number.isFinite(t)?null:Math.abs(e-t)>r?t:null}var l=[`portico`,`foundation`,`garage`,`vault`,`mancave`,`proof`,`archive`,`finish-hall`,`commercial`,`consultation`];function u(e){e.querySelector(`.journey`)?.removeAttribute(`data-journey-enhanced`)}var d=.12,f=e=>Math.min(1,Math.max(0,e)),p=e=>!!(e&&l.includes(e)),m=Object.freeze({revision:0,activeChapter:`portico`,activeIndex:0,fromChapter:`portico`,fromIndex:0,toChapter:`foundation`,toIndex:1,chapterProgress:0,transitionProgress:0,journeyProgress:0,scrollY:0,viewportWidth:0,viewportHeight:0,visible:!1,documentVisible:!0,whiteStageActive:!1,scrollDirection:0,transitionFromWhite:!1,readingChapter:null,whiteTarget:null,boundaryKey:null,mediaOwner:`from`,handoff:0,bayProgress:0});function h(e,t){return t.chapters.findIndex(t=>t.id===e)>=0?l.indexOf(e):0}function g(e,t,n,r){let i=e.length-1;if(i<1)return 0;let a=e.map(e=>t.find(t=>t.id===e)),o=a[0],s=a[i];if(!o||!s||r<=o.start)return 0;if(r>=s.end)return 1;for(let t=0;t<=i;t+=1){let o=a[t];if(!o||r>=o.end)continue;if(r>=o.start)return t/i;let s=n.find(({from:n,to:r})=>n===e[t-1]&&r===e[t]),c=s?f((r-s.start)/Math.max(1,s.end-s.start)):0;return(t-1+c)/i}return 1}var _=.25;function v({viewportHeight:e,actSpan:t}){let n=Math.min(420,Math.max(180,e*.34)),r=Number.isFinite(t)&&t>0?t*_:1/0;return Math.min(n,r)}function y(e,t,n){let r=Math.max(t,e.start-n/2);return Math.max(1,e.end-n/2-r)}function b(e,t){return e.chapters.reduce((e,n)=>{let r=(n.start+n.end)/2,i=(e.start+e.end)/2;return Math.abs(r-t)<Math.abs(i-t)?n:e},e.chapters[0])}function x(e,n,r,i,a,o=0,s=n,c=0,l=null){let u=[...e.chapters].sort((e,t)=>e.start-t.start);if(u.length===0)return Object.freeze({...m,revision:a,documentVisible:i,scrollY:n,viewportWidth:o,viewportHeight:r});let p=n+r/2,_=!!e.whiteStages?.some(({start:e,end:t})=>p>=e&&p<t),v=n-s,y=v===0?c:Math.sign(v),x=n+r>e.top&&n<e.bottom,S=Math.max(1,e.bottom-e.top-r),C=f((n-e.top)/S),w=e.transitions.find(({start:e,end:t})=>p>=e&&p<=t),T=e.whiteTargets?.find(({start:e,end:t})=>p>=e&&p<=t),E=T?Object.freeze({id:T.id,from:T.from,progress:f((p-T.start)/Math.max(1,T.end-T.start))}):null,D=u.find(({start:e,end:t})=>p>=e&&p<t)??b({...e,chapters:u},p),O=D,k=u[Math.min(u.length-1,u.indexOf(D)+1)]??D,A=0,j=!1,M=null,N=0,P=!1;p>=u.at(-1).end?(D=u.at(-1),O=D,k=D):w&&(O=u.find(e=>e.id===w.from)??D,k=u.find(e=>e.id===w.to)??O,A=f((p-w.start)/Math.max(1,w.end-w.start)),j=!!w.fromWhiteStage,M=`${O.id}:${k.id}`,N=t(A,.5,d),P=A>0&&A<1,D=N<.5?O:k),E&&(M=`${E.id}:white-target`,N=0,P=E.progress>0&&E.progress<1);let ee=P&&M!==null&&l===M?`veil`:N<.5?`from`:`to`,F=h(D.id,e),te=n+r*.66,I=n+r*.12,L=e.readings?e.readings.find(({start:e,end:t})=>e<=te&&t>=I)?.id??null:D.id,R=Math.max(e.top,D.start-r/2),z=D.end-r/2;return Object.freeze({revision:a,activeChapter:D.id,activeIndex:F,fromChapter:O.id,fromIndex:h(O.id,e),toChapter:k.id,toIndex:h(k.id,e),chapterProgress:f((n-R)/Math.max(1,z-R)),transitionProgress:A,journeyProgress:C,scrollY:n,viewportWidth:o,viewportHeight:r,visible:x,documentVisible:i,whiteStageActive:_,scrollDirection:y,transitionFromWhite:j,readingChapter:L,whiteTarget:E,boundaryKey:M,mediaOwner:ee,handoff:N,bayProgress:g(e.bay?.rooms??[],u,e.transitions,p)})}function S(e,t){return e.activeChapter!==t.activeChapter||e.fromChapter!==t.fromChapter||e.toChapter!==t.toChapter||e.chapterProgress!==t.chapterProgress||e.transitionProgress!==t.transitionProgress||e.journeyProgress!==t.journeyProgress||e.scrollY!==t.scrollY||e.viewportWidth!==t.viewportWidth||e.viewportHeight!==t.viewportHeight||e.visible!==t.visible||e.documentVisible!==t.documentVisible||e.whiteStageActive!==t.whiteStageActive||e.scrollDirection!==t.scrollDirection||e.transitionFromWhite!==t.transitionFromWhite||e.readingChapter!==t.readingChapter||e.boundaryKey!==t.boundaryKey||e.mediaOwner!==t.mediaOwner||e.handoff!==t.handoff||e.bayProgress!==t.bayProgress||e.whiteTarget?.id!==t.whiteTarget?.id||e.whiteTarget?.from!==t.whiteTarget?.from||e.whiteTarget?.progress!==t.whiteTarget?.progress}function C(e={}){let t=e.journeySelector??`.journey`,n=new Set,r=m,i=null,a=null,o=!1,s=0,c=0,u=null,d=null,f=()=>{if(s=0,!o||!i)return;let e=x(i,window.scrollY,window.innerHeight,document.visibilityState!==`hidden`,r.revision+1,window.innerWidth,r.scrollY,r.scrollDirection,d);S(r,e)&&(r=e,n.forEach(e=>e()))},h=()=>{!o||s||document.visibilityState===`hidden`||(s=window.requestAnimationFrame(f))},g=(e,t)=>{let n=t?e:e===null||d===e?null:d;n!==d&&(d=n,h())},_=()=>{if(c=0,!o||!a)return;s&&=(window.cancelAnimationFrame(s),0);let e=window.scrollY,t=a.getBoundingClientRect(),n=[...a.querySelectorAll(`.journey-chapter[data-journey-chapter]`)],r=new Map(n.map(e=>[e.dataset.journeyChapter,e])),u=l.flatMap(t=>{let n=r.get(t);if(!n)return[];let i=n.getBoundingClientRect();return[{id:t,start:i.top+e,end:i.bottom+e}]}),d=l.flatMap(t=>{let n=r.get(t)?.querySelector(`.chapter-content > .display-title, .chapter-content > .chapter-copy-surface > .chapter-title`);if(!n)return[];let i=n.getBoundingClientRect();return[{id:t,start:i.top+e,end:i.bottom+e}]}),m=[...a.querySelectorAll(`.journey-breath[data-hall-from][data-hall-to]`)].flatMap(t=>{let n=t.dataset.hallFrom,r=t.dataset.hallTo;if(!p(n)||!p(r))return[];let i=t.getBoundingClientRect(),a=t.hasAttribute(`data-hall-from-white`)||t.previousElementSibling?.hasAttribute(`data-journey-white-stage`)===!0;return[{from:n,to:r,start:i.top+e,end:i.bottom+e,fromWhiteStage:a}]}),h=[...a.querySelectorAll(`[data-journey-white-stage]`)].map(t=>{let n=t.getBoundingClientRect();return{start:n.top+e,end:n.bottom+e}}),g=t.top+e,_=u.find(e=>e.id===`portico`),b=_?y(_,g,window.innerHeight):1/0,x=[...a.querySelectorAll(`#customer-reviews[data-journey-white-stage]`)].map(t=>{let n=t.getBoundingClientRect().top+e;return{id:`customer-reviews`,from:`portico`,start:n-v({viewportHeight:window.innerHeight,actSpan:b}),end:n}}),S=[...a.querySelectorAll(`[data-reclaim-bay] [data-bay-room]`)].map(e=>e.dataset.bayRoom).filter(p);i=Object.freeze({top:g,bottom:t.bottom+e,chapters:Object.freeze(u),transitions:Object.freeze(m),whiteStages:Object.freeze(h),readings:Object.freeze(d),whiteTargets:Object.freeze(x),bay:Object.freeze({rooms:Object.freeze(S)})}),f()},b=()=>{!o||c||(c=window.requestAnimationFrame(_))},C=()=>h(),w=()=>{if(document.visibilityState===`hidden`){if(s&&window.cancelAnimationFrame(s),s=0,i){let e=x(i,window.scrollY,window.innerHeight,!1,r.revision+1,window.innerWidth,r.scrollY,r.scrollDirection,d);S(r,e)&&(r=e,n.forEach(e=>e()))}return}b()};return{start:()=>{o||typeof window>`u`||typeof document>`u`||(a=document.querySelector(t),a&&(o=!0,window.addEventListener(`scroll`,C,{passive:!0}),window.addEventListener(`resize`,b,{passive:!0}),window.addEventListener(`orientationchange`,b,{passive:!0}),document.addEventListener(`visibilitychange`,w),document.addEventListener(`load`,b,!0),typeof ResizeObserver<`u`&&(u=new ResizeObserver(b),u.observe(a),a.querySelectorAll(`.journey-chapter, .journey-breath, [data-journey-white-stage]`).forEach(e=>u?.observe(e))),document.fonts?.ready.then(b),b()))},stop:()=>{!o||typeof window>`u`||typeof document>`u`||(o=!1,window.removeEventListener(`scroll`,C),window.removeEventListener(`resize`,b),window.removeEventListener(`orientationchange`,b),document.removeEventListener(`visibilitychange`,w),document.removeEventListener(`load`,b,!0),u?.disconnect(),u=null,s&&window.cancelAnimationFrame(s),c&&window.cancelAnimationFrame(c),s=0,c=0,i=null,a=null,d=null)},reportVeil:g,subscribe:e=>(n.add(e),()=>n.delete(e)),getSnapshot:()=>r,getServerSnapshot:()=>m,invalidateGeometry:b,scrollToChapter:(e,n=`smooth`)=>{typeof document>`u`||document.querySelector(`${t} [data-journey-chapter="${e}"]`)?.scrollIntoView({behavior:n,block:`start`})}}}var w=C(),T=Object.freeze([{id:0,name:`liquid-pearl`,colors:[`#e7e3da`,`#cfd7de`,`#164f83`],roughness:.06,metalness:.02,clearcoat:1,clearcoatRoughness:.04,opacity:.46,fallback:`linear-gradient(180deg, rgba(22,79,131,.20), rgba(231,227,218,.34) 46%, rgba(207,215,222,.16))`},{id:1,name:`ground-concrete`,colors:[`#8d8a83`,`#767268`,`#5d686c`],roughness:.94,metalness:0,clearcoat:0,clearcoatRoughness:1,opacity:.58,fallback:`linear-gradient(180deg, rgba(93,104,108,.26), rgba(141,138,131,.20) 52%, rgba(118,114,104,.10))`},{id:2,name:`cured-pearl`,colors:[`#e4e0d7`,`#f1efea`,`#6fa6ca`],roughness:.14,metalness:.03,clearcoat:1,clearcoatRoughness:.08,opacity:.42,fallback:`linear-gradient(180deg, rgba(111,166,202,.18), rgba(222,217,207,.26) 50%, rgba(236,234,228,.12))`},{id:3,name:`flake`,colors:[`#c6bdaa`,`#49555b`,`#164f83`],roughness:.34,metalness:.08,clearcoat:1,clearcoatRoughness:.1,opacity:.6,fallback:`linear-gradient(180deg, rgba(22,79,131,.20), rgba(216,209,195,.28) 48%, rgba(93,104,108,.14))`},{id:4,name:`photograph`,colors:[`#9a9a97`,`#8f8f8c`,`#a5a5a1`],roughness:.55,metalness:0,clearcoat:.35,clearcoatRoughness:.3,opacity:.56,fallback:`linear-gradient(180deg, rgba(154,154,151,.26), rgba(143,143,140,.20) 55%, rgba(165,165,161,.10))`},{id:5,name:`metallic`,colors:[`#2b3640`,`#164f83`,`#a9bfd0`],roughness:.18,metalness:.55,clearcoat:1,clearcoatRoughness:.06,opacity:.66,fallback:`linear-gradient(180deg, rgba(43,54,64,.30), rgba(22,79,131,.26) 47%, rgba(169,191,208,.12))`},{id:6,name:`satin-commercial`,colors:[`#9aa0a3`,`#b3b7b8`,`#7d8688`],roughness:.35,metalness:.02,clearcoat:.25,clearcoatRoughness:.4,opacity:.5,fallback:`linear-gradient(180deg, rgba(125,134,136,.24), rgba(154,160,163,.18) 52%, rgba(179,183,184,.09))`},{id:7,name:`paper`,colors:[`#faf9f6`,`#faf9f6`,`#faf9f6`],roughness:1,metalness:0,clearcoat:0,clearcoatRoughness:1,opacity:0,fallback:`linear-gradient(180deg, rgba(250,249,246,0), rgba(250,249,246,0))`}]),E=`#164f83`,D=.6,O=`power2.inOut`,k=.5;function A(e){return typeof e==`number`&&Number.isInteger(e)&&e>=0&&e<=7}function j(e,t,n){return Math.min(1,Math.max(0,n))<.5?e:t}function M(e){let t=e.replace(`#`,``);return[0,2,4].map(e=>Number.parseInt(t.slice(e,e+2),16)/255).map(e=>e<=.04045?e/12.92:((e+.055)/1.055)**2.4)}function N(e){return`vec3(${M(e).map(e=>e.toFixed(5)).join(`, `)})`}function P(){return T.map(e=>[`const vec3 FFE_A${e.id} = ${N(e.colors[0])};`,`const vec3 FFE_B${e.id} = ${N(e.colors[1])};`,`const vec3 FFE_C${e.id} = ${N(e.colors[2])};`,`const vec4 FFE_S${e.id} = vec4(${e.roughness.toFixed(3)}, ${e.metalness.toFixed(3)}, ${e.clearcoat.toFixed(3)}, ${e.clearcoatRoughness.toFixed(3)});`,`const float FFE_O${e.id} = ${e.opacity.toFixed(4)};`].join(`
`)).join(`
`)}var ee=`
${e}

${P()}

struct FfeSurface {
  vec3 albedo;
  float roughness;
  float metalness;
  float clearcoat;
  float coatRoughness;
  float opacity;
};

// Specular sweep: a highlight that travels from the viewer's feet out to the horizon,
// measured in normalised view depth so it reads the same at either camera height.
// uSweep only advances while a morph or an explicit sweep is running, so an idle page
// renders zero frames.
float ffeSweep(float depth01, float sweep) {
  float head = fract(sweep) * 1.4 - 0.2;
  return exp(-pow((depth01 - head) / 0.15, 2.0));
}

vec3 ffeMetallicSwirl(vec2 uv, vec3 graphite, vec3 cobalt, vec3 sheen) {
  float base = fbm(uv * 2.1);
  vec2 warped = uv * vec2(1.7, 3.4) + vec2(base * 1.4, 0.0);
  // Anisotropic-looking: stretched along x so the highlight smears the way a
  // trowelled metallic floor does, never a symmetrical blob.
  float grain = sin(warped.x * 5.5 + fbm(warped * 1.9) * 6.0);
  vec3 col = mix(graphite, cobalt, 0.35 + 0.45 * base);
  col = mix(col, sheen, smoothstep(0.25, 0.95, grain * 0.5 + 0.5) * 0.55);
  col += sheen * pow(max(grain, 0.0), 8.0) * 0.35;
  return col;
}

vec3 ffeConcrete(vec2 uv, vec3 base, vec3 mid, vec3 shadow) {
  float coarse = fbm(uv * 9.0);
  float pits = pow(noise(uv * 46.0), 3.0);
  vec3 col = mix(base, mid, coarse);
  col = mix(col, shadow, pits * 0.55);
  return col;
}

vec3 ffeSatin(vec2 uv, vec3 base, vec3 light, vec3 dark) {
  float n = fbm(uv * 5.5);
  vec3 col = mix(dark, base, 0.4 + 0.5 * n);
  col = mix(col, light, smoothstep(0.55, 1.0, n) * 0.4);
  return col;
}

vec3 ffeLiquidPearl(vec2 uv, vec3 base, vec3 mid, vec3 subsurface, float sweep) {
  float flow = fbm(uv * 2.2 + vec2(sweep * 0.12, 0.0));
  vec3 col = mix(base, mid, flow);
  // Cobalt reads from underneath, not on top: the tint grows with depth into the pour.
  col = mix(col, subsurface, pow(clamp(flow, 0.0, 1.0), 1.6) * 0.42);
  float interference = 0.5 + 0.5 * sin(flow * 13.0 + sweep * 4.2);
  col += mix(vec3(0.0), subsurface, interference * 0.12);
  return col;
}

FfeSurface ffeSurfaceSample(float state, vec2 uv, float sweep, vec3 photo) {
  FfeSurface surface;
  vec4 params;
  vec3 albedo;
  float opacity;

  if (state < 0.5) {
    albedo = ffeLiquidPearl(uv, FFE_A0, FFE_B0, FFE_C0, sweep);
    params = FFE_S0;
    opacity = FFE_O0;
  } else if (state < 1.5) {
    albedo = ffeConcrete(uv, FFE_A1, FFE_B1, FFE_C1);
    params = FFE_S1;
    opacity = FFE_O1;
  } else if (state < 2.5) {
    albedo = ffeLiquidPearl(uv, FFE_A2, FFE_B2, FFE_C2, sweep * 0.35);
    params = FFE_S2;
    opacity = FFE_O2;
  } else if (state < 3.5) {
    // The visualizer's own flake field, uA/uB/uC bound to the state-3 palette.
    // Sampled finer than the other states so the chips land at real broadcast size.
    albedo = flakeField(uv * 4.0, uDensity, 1.0);
    params = FFE_S3;
    opacity = FFE_O3;
  } else if (state < 4.5) {
    albedo = photo;
    params = FFE_S4;
    opacity = FFE_O4;
  } else if (state < 5.5) {
    albedo = ffeMetallicSwirl(uv, FFE_A5, FFE_B5, FFE_C5);
    params = FFE_S5;
    opacity = FFE_O5;
  } else if (state < 6.5) {
    albedo = ffeSatin(uv, FFE_A6, FFE_B6, FFE_C6);
    params = FFE_S6;
    opacity = FFE_O6;
  } else {
    albedo = FFE_A7;
    params = FFE_S7;
    opacity = FFE_O7;
  }

  surface.albedo = albedo;
  surface.roughness = params.x;
  surface.metalness = params.y;
  surface.clearcoat = params.z;
  surface.coatRoughness = params.w;
  surface.opacity = opacity;
  return surface;
}

FfeSurface ffeSurfaceBlend(float a, float b, float mixAmount, vec2 uv, float sweep, vec3 photo) {
  FfeSurface sa = ffeSurfaceSample(a, uv, sweep, photo);
  FfeSurface sb = ffeSurfaceSample(b, uv, sweep, photo);
  float m = clamp(mixAmount, 0.0, 1.0);
  FfeSurface blended;
  blended.albedo = mix(sa.albedo, sb.albedo, m);
  blended.roughness = mix(sa.roughness, sb.roughness, m);
  blended.metalness = mix(sa.metalness, sb.metalness, m);
  blended.clearcoat = mix(sa.clearcoat, sb.clearcoat, m);
  blended.coatRoughness = mix(sa.coatRoughness, sb.coatRoughness, m);
  blended.opacity = mix(sa.opacity, sb.opacity, m);
  return blended;
}
`;Object.freeze([`uMaterialA`,`uMaterialB`,`uMix`,`uSweep`,`uPlaneOpacity`,`uPlanePresence`,`uEdgeFeather`,`uGlossLift`,`uTiling`,`uNearFade`,`uFarFade`,`uPhoto`,`uPhotoReady`,`uViewport`,`uA`,`uB`,`uC`,`uDensity`,`uPattern`,`uReveal`,`uLight`]);var F=`
uniform float uTiling;
varying vec2 vSurfaceUv;
varying float vSurfaceDepth;
`,te=`
vSurfaceUv = uv * uTiling;
vSurfaceDepth = -(modelViewMatrix * vec4(position, 1.0)).z;
`,I=`
uniform float uMaterialA;
uniform float uMaterialB;
uniform float uMix;
uniform float uSweep;
uniform float uPlaneOpacity;
uniform float uPlanePresence;
uniform float uEdgeFeather;
uniform float uGlossLift;
uniform float uNearFade;
uniform float uFarFade;
uniform sampler2D uPhoto;
uniform float uPhotoReady;
/** (origin x, origin y, width, height) in device pixels — the view's own rectangle. */
uniform vec4 uViewport;
varying vec2 vSurfaceUv;
varying float vSurfaceDepth;
${ee}
`,L=.6,R=.62,z=.05,ne=.3,re=`
float ffeT = clamp((vSurfaceDepth - uNearFade) / max(0.0001, uFarFade - uNearFade), 0.0, 1.0);
float ffeScreen = clamp((gl_FragCoord.y - uViewport.y) / max(1.0, uViewport.w), 0.0, 1.0);
float ffeAcross = clamp((gl_FragCoord.x - uViewport.x) / max(1.0, uViewport.z), 0.0, 1.0);
float ffeEdgeWidth = max(0.001, uEdgeFeather);
float ffeDepthAlpha = smoothstep(0.02, ${L.toFixed(2)}, ffeT)
  * (1.0 - smoothstep(${R.toFixed(2)}, 0.99, ffeScreen))
  * (1.0 - smoothstep(${.6799999999999999.toFixed(2)}, 1.0, ffeT))
  * smoothstep(0.0, ffeEdgeWidth, ffeAcross)
  * smoothstep(0.0, ffeEdgeWidth, 1.0 - ffeAcross);
vec3 ffePhoto = mix(vec3(0.34, 0.34, 0.335), texture2D(uPhoto, fract(vSurfaceUv)).rgb, uPhotoReady);
FfeSurface ffeSurface = ffeSurfaceBlend(uMaterialA, uMaterialB, uMix, vSurfaceUv, uSweep, ffePhoto);
float ffeSweepGain = ffeSweep(ffeT, uSweep);
diffuseColor.rgb = ffeSurface.albedo + ffeSurface.albedo * ffeSweepGain * 0.45;
diffuseColor.a = ffeSurface.opacity * uPlaneOpacity * uPlanePresence * ffeDepthAlpha;
`,ie=`
gl_FragColor.rgb *= gl_FragColor.a;
gl_FragColor.a *= 1.0 - clamp(uGlossLift, 0.0, 1.0);
`,ae=`
roughnessFactor = clamp(ffeSurface.roughness, 0.02, 1.0);
`,oe=`
metalnessFactor = clamp(ffeSurface.metalness, 0.0, 1.0);
`,se=`
#ifdef USE_CLEARCOAT
material.clearcoat = clamp(ffeSurface.clearcoat, 0.0, 1.0);
material.clearcoatRoughness = clamp(ffeSurface.coatRoughness, 0.0, 1.0);
#endif
`,ce=`
varying vec2 vHorizonUv;
void main() {
  vHorizonUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,le=`
uniform vec3 uHorizonColor;
uniform float uHorizonOpacity;
uniform float uHorizonWidth;
varying vec2 vHorizonUv;
void main() {
  float edge = 1.0 - vHorizonUv.y;
  float line = 1.0 - step(uHorizonWidth, edge);
  gl_FragColor = vec4(uHorizonColor, line * uHorizonOpacity);
  #include <colorspace_fragment>
}
`,B=e=>Math.min(1,Math.max(0,e));function ue(e){return e.webgl2?e.tier===null?e.colorBufferFloat&&!e.reducedMotion&&!e.saveData&&!e.coarsePointer&&e.motionPreference===`auto`:e.tier===`full`:!1}function de(e,t,n){return e.width<=0||e.height<=0?!1:e.left<t&&e.left+e.width>0&&e.top<n&&e.top+e.height>0}function fe(e,t,n){let r=Math.max(0,Math.round(e.left)),i=Math.min(t,Math.round(e.left+e.width)),a=Math.max(0,Math.round(n-(e.top+e.height))),o=Math.min(n,Math.round(n-e.top));return{x:r,y:a,width:Math.max(0,i-r),height:Math.max(0,o-a)}}var V=Object.freeze({portico:[0,2],foundation:[1,2],garage:[2,2],vault:[3,3],mancave:[5,5],archive:[4,4],"finish-hall":[5,5],commercial:[6,6],proof:[3,3],consultation:[7,7]}),H=.8,U=Object.freeze({sheen:.35,reflection:.06,boundary:.6,full:1}),pe=new Set([`portico`,`foundation`,`garage`,`vault`,`mancave`,`finish-hall`,`commercial`,`consultation`]),me=new Set([`archive`]),W=new Set(`P.H1.H2.H3.H4.H5.H6.LI.BLOCKQUOTE.FIGCAPTION.A.SPAN.BUTTON.LABEL.STRONG.EM.SMALL.TIME.DT.DD.TD.TH.CAPTION.LEGEND.SUMMARY.CITE.CODE.ABBR`.split(`.`)),G=new Set([`INPUT`,`TEXTAREA`,`SELECT`]),K=`data-horizon-avoid`,q=.25,he=[...W,...G].map(e=>e.toLowerCase()).concat(`[${K}]`).join(`,`);function ge(e){return e.avoid||G.has(e.tag)?!0:e.text&&W.has(e.tag)}function _e(e,t,n){return e.right-e.left<1||e.bottom-e.top<1||e.right<=0||e.left>=n?!1:e.top<=t&&e.bottom>=t}function ve(e,t){let n=Math.max(0,Math.min(t-1,e.left)),r=Math.max(0,Math.min(t-1,e.right)),i=Math.round(Math.min(n,r)),a=Math.round(Math.max(n,r));if(a-i<2)return[i];let o=[i+1,Math.round((i+a)/2),a-1];return[...new Set(o)]}function J(e){return V[e]??V.portico}function Y(e,t){let[n,r]=J(e);return t===`start`?n:r}function X(e,t){return e===`portico`?U.sheen*B((t-H)/.19999999999999996):me.has(e)?U.reflection:pe.has(e)?U.sheen:U.full}function Z(e,t){return X(e,t===`start`?0:1)}function ye(e,t){return e===`portico`?B((t-H)/.19999999999999996):e===`foundation`?B(t):0}function be(e){let t=e.whiteStageActive;if(e.transitionProgress>0&&e.transitionProgress<1&&e.fromChapter!==e.toChapter){let n=B(e.transitionProgress),r=Z(e.fromChapter,`end`)*(1-n)+Z(e.toChapter,`start`)*n,i=r+(U.boundary-r)*Math.sin(Math.PI*n);return{a:Y(e.fromChapter,`end`),b:Y(e.toChapter,`start`),mix:n,horizon:t,presence:t?U.reflection:Math.max(r,i)}}let[n,r]=J(e.activeChapter);return{a:n,b:r,mix:ye(e.activeChapter,e.chapterProgress),horizon:t,presence:t?U.reflection:X(e.activeChapter,e.chapterProgress)}}function xe(e){return ne*B((1-B(e))/(1-U.sheen))}function Q(e){return B(e.presence??U.full)}function Se(e,t){return e.a===t.a&&e.b===t.b&&e.mix===t.mix&&e.horizon===t.horizon&&Q(e)===Q(t)}var Ce=Object.freeze([`surface-floor`]),$=Object.freeze({revision:0,a:0,b:0,mix:0,horizon:!1,presence:U.full,horizonClear:!0,camera:`standing`,renderer:`none`,settled:!0,menuOpen:!1});function we(){let e=new Set,t=new Map,n=$,r=null,i=0,a=null,o=null,s=null,c=null,l=t=>{let r=Object.freeze({...n,...t,revision:n.revision+1});(r.a!==n.a||r.b!==n.b||r.mix!==n.mix||r.horizon!==n.horizon||r.presence!==n.presence||r.horizonClear!==n.horizonClear||r.camera!==n.camera||r.renderer!==n.renderer||r.settled!==n.settled||r.menuOpen!==n.menuOpen)&&(n=r,u(),e.forEach(e=>e()))},u=()=>{if(typeof document>`u`)return;let e=a??document.querySelector(`[data-surface-fallback]`);if(!e)return;a=e;let t=j(n.a,n.b,n.mix);e.dataset.surfaceState=String(t),e.dataset.surfaceName=T[t].name,e.dataset.surfaceHorizon=n.horizon?`on`:`off`,e.dataset.horizonLine=n.horizonClear?`visible`:`hidden`,e.style.setProperty(`--surface-presence`,String(n.presence)),document.documentElement.dataset.surface=n.renderer},d={subscribe:t=>(e.add(t),()=>{e.delete(t)}),getSnapshot:()=>n,getServerSnapshot:()=>$,registerView:(e,n,r)=>(t.set(e,{id:e,element:n,render:r.render,priority:r.priority??0}),d.invalidate(),()=>d.unregisterView(e)),unregisterView:e=>{t.delete(e)},unregisterPageViews:(e=Ce)=>{let n=0;for(let r of[...t.keys()])e.includes(r)||(t.delete(r),n+=1);return n>0&&d.invalidate(),n},listViews:()=>[...t.values()].sort((e,t)=>e.priority-t.priority),visibleViews:(e,t)=>d.listViews().flatMap(n=>{let r=n.element.getBoundingClientRect(),i={left:r.left,top:r.top,width:r.width,height:r.height};return de(i,e,t)?[{view:n,rect:i}]:[]}),bindDriver:e=>{r=e,e&&(e.setStates(n.a,n.b),e.setMix(n.mix),e.setPresence(n.presence,0),e.setHorizon(!n.menuOpen&&n.horizon,0),e.setHorizonClear(n.horizonClear,0),e.setCamera(n.camera),e.invalidate())},invalidate:()=>r?.invalidate(),noteFrame:()=>{i+=1},getFrames:()=>i,resetFrames:()=>{i=0},noteWarmup:e=>{s=Object.freeze(e)},getWarmup:()=>s,morphTo:(e,t={})=>{if(!A(e))return;let i=t.duration??.6,a=t.ease??`power2.inOut`;if(e===n.b||e===n.a){let t=+(e===n.b);l({mix:t,settled:!1}),r?.mixTo(t,i,a),r?.sweep(i*1.8);return}let o=j(n.a,n.b,n.mix);l({a:o,b:e,mix:1,settled:!1}),r?.setStates(o,e),r?.setMix(0),r?.mixTo(1,i,a),r?.sweep(i*1.8)},applyTarget:e=>{if(n.menuOpen){c=e;return}let t={a:n.a,b:n.b,mix:n.mix,horizon:n.horizon,presence:n.presence};if(Se(t,e))return;let i=t.horizon!==e.horizon,a=Q(e);l({a:e.a,b:e.b,mix:e.mix,horizon:e.horizon,presence:a,settled:!1}),r?.setStates(e.a,e.b),r?.setMix(e.mix),r?.setPresence(a,i?D:0),i&&r?.setHorizon(e.horizon,D),r?.invalidate()},setMenuFloor:e=>{o=e;let t=e!==null;if(n.menuOpen===t)return;if(t){c={a:n.a,b:n.b,mix:n.mix,horizon:n.horizon,presence:n.presence},l({menuOpen:!0}),r?.setHorizon(!1,D),r?.invalidate();return}l({menuOpen:!1});let i=c;c=null,i&&d.applyTarget(i),r?.setHorizon(i?.horizon??n.horizon,D),r?.invalidate()},getMenuFloor:()=>o,applyJourneySnapshot:e=>{d.applyTarget(be(e))},setCamera:e=>{(e===`standing`||e===`kneeling`)&&(l({camera:e}),r?.setCamera(e),r?.invalidate())},setHorizon:e=>{n.horizon!==e&&(l({horizon:e}),r?.setHorizon(e,D))},setHorizonClear:(e,t=q)=>{n.horizonClear!==e&&(l({horizonClear:e}),r?.setHorizonClear(e,t),r?.invalidate())},settle:(e=k)=>{l({settled:!0}),r?.settle(e)},sweep:(e=1.6)=>{l({settled:!1}),r?.sweep(e)},setRenderer:e=>{l({renderer:e})},syncDocumentState:()=>{a=null,u()},reset:()=>{t.clear(),r=null,i=0,a=null,o=null,c=null,s=null,n=$,e.clear()}};return d}var Te=we();function Ee(e){if(typeof window>`u`||typeof document>`u`)return{tier:null,webgl2:!1,colorBufferFloat:!1,reducedMotion:!0,saveData:!0,coarsePointer:!0,motionPreference:e};let t=document.documentElement.getAttribute(`data-journey-tier`),n=navigator.connection,r=!1,i=!1;try{let e=document.createElement(`canvas`).getContext(`webgl2`);e&&(r=!0,i=!!e.getExtension(`EXT_color_buffer_float`),e.getExtension(`WEBGL_lose_context`)?.loseContext())}catch{r=!1,i=!1}return{tier:t,webgl2:r,colorBufferFloat:i,reducedMotion:window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,saveData:!!n?.saveData,coarsePointer:window.matchMedia(`(pointer: coarse)`).matches,motionPreference:e}}export{w as A,ce as C,te as D,O as E,c as F,a as M,s as N,F as O,r as P,le as S,D as T,I as _,Ee as a,ae as b,_e as c,xe as d,Te as f,re as g,se as h,U as i,u as j,l as k,fe as l,L as m,he as n,ge as o,z as p,q as r,ve as s,K as t,ue as u,ie as v,T as w,E as x,oe as y};