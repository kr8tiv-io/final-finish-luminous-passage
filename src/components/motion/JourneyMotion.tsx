import gsap from 'gsap';
import { useEffect } from 'react';
import { SplitText } from 'gsap/SplitText';
import { journeyControls } from '../../lib/motion/journey-controls';
import {
  JOURNEY_COMPOSITOR_READY_EVENT,
  journeyDirector,
  type JourneyChapterId,
  type JourneySnapshot,
} from '../../lib/motion/journey-director';
import { journeyFilmTime } from '../../lib/motion/journey-film-timing';
import {
  HERO_SUPPORT_TIMING,
  headlineMotionMode,
  headlineMotionSpec,
  headlineStagger,
  headlineStyleForChapter,
  isJourneyMotionOwnedNode,
  wordConvergeFrom,
  type HeadlinePhase,
  type HeadlineStyle,
} from '../../lib/motion/headline-motion';
import {
  journeyMediaResidents,
  pourFilmSource,
  shouldInvalidateForMediaReadiness,
  shouldRequestVideo,
  videoSeekTarget,
  videoVisualReady,
} from '../../lib/motion/journey-media';
import { onRouteTeardown } from '../../lib/motion/route-lifecycle';
import { currentJourneyTier, type JourneyTier } from '../../lib/motion/journey-tier';

gsap.registerPlugin(SplitText);

const saveDataEnabled = () => Boolean(
  (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
);

interface HeadlineRecord {
  animation?: gsap.core.Animation;
  phase: HeadlinePhase;
  split?: SplitText;
  style: HeadlineStyle;
  title: HTMLElement;
}

/**
 * Wait for the face this headline will actually be measured with.
 *
 * `word-converge` splits into words and animates each one from its own direction.
 * `autoSplit` re-splits on a font swap, which is right for a line mask and wrong
 * here: a re-split mid-tween re-seeds every word at its start offset and the
 * headline visibly jumps back.
 *
 * `document.fonts.ready` alone does NOT prevent that. Measured on this build, it
 * resolves at 36 ms — before `#hero-title` has even been parsed — because nothing
 * was pending at that instant. So the face is requested explicitly first
 * (`FontFaceSet.load` resolves when the matching faces are loaded), and only then
 * is the set awaited. Either step failing falls through to splitting immediately,
 * which is one frame of a settled headline, never a stuck start state.
 */
const fontsSettled = (title: HTMLElement): Promise<void> => {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.ready) return Promise.resolve();
  const style = getComputedStyle(title);
  const shorthand = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const requested = typeof fonts.load === 'function'
    ? fonts.load(shorthand, title.textContent ?? '').then(() => undefined, () => undefined)
    : Promise.resolve();
  return requested.then(() => fonts.ready).then(() => undefined, () => undefined);
};

export default function JourneyMotion() {
  useEffect(() => {
    journeyControls.hydrate();
    journeyDirector.start();
    // Registered rather than returned bare: Astro unmounts an outgoing island on
    // `astro:after-swap`, by which point the incoming page's JourneyMotion may
    // already have called `start()` — and this `stop()` would then stop a director
    // nothing restarts. `onRouteTeardown` runs it at `astro:before-swap` and hands
    // back a guarded handle, so React's later unmount call is a no-op.
    return onRouteTeardown(() => journeyDirector.stop());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compactQuery = window.matchMedia('(max-width: 680px)');
    const journey = document.querySelector<HTMLElement>('.journey');
    if (!journey) return;

    const chapters = new Map<JourneyChapterId, HTMLElement>();
    journey.querySelectorAll<HTMLElement>('.journey-chapter[data-journey-chapter]').forEach((chapter) => {
      const id = chapter.dataset.journeyChapter as JourneyChapterId | undefined;
      if (id) chapters.set(id, chapter);
    });
    const videos = new Map<JourneyChapterId, HTMLVideoElement>();
    chapters.forEach((chapter, id) => {
      const video = chapter.querySelector<HTMLVideoElement>('.pour-film, .floor-film-video');
      if (video) videos.set(id, video);
    });
    const headlines = new Map<JourneyChapterId, HeadlineRecord[]>();
    const revealed = new Set<JourneyChapterId>();
    const activeTweens = new Set<gsap.core.Tween>();
    /** The hero's own eyebrow/lead splits, each with the `.sr-only` twin that speaks for it. */
    const supportSplits: Array<{ split: SplitText; spoken: HTMLElement }> = [];
    /** Set at teardown so a deferred `fonts.ready` split cannot land on a dead document. */
    let disposed = false;
    const readyVideos = new WeakMap<HTMLVideoElement, boolean>();
    const requestedVideos = new WeakSet<HTMLVideoElement>();
    const pendingSeeks = new WeakSet<HTMLVideoElement>();
    let tier: JourneyTier = currentJourneyTier(journeyControls.getSnapshot().motionPreference);
    let presentationEnabled = tier !== 'still';

    /**
     * Act 4's horizontal bay. This island already owns `data-media-active` and
     * `--handoff`, so the bay is published from the same render pass rather than
     * from a second writer: one `--bay-progress` (straight off the director's
     * `snapshot.bayProgress`), one phase per room, one strength per crease.
     *
     * The mode itself is the only thing decided here rather than published: the
     * train is a `full`-tier, wide-viewport composition. Everything narrower or
     * weaker stacks the rooms vertically and keeps the DOM crossfade — the
     * storyboard's Act 4 risk row is "never pinned on phone", and a bay that only
     * exists where it can be afforded is how that is honoured.
     *
     * @motion fold-and-shoot-left
     * @motion caption-drift
     */
    const bay = journey.querySelector<HTMLElement>('[data-reclaim-bay]');
    const bayRooms = bay ? [...bay.querySelectorAll<HTMLElement>('[data-bay-room]')] : [];
    const bayIds = bayRooms.map((room) => room.dataset.bayRoom ?? '');
    const baySeams = bay ? [...bay.querySelectorAll<HTMLElement>('[data-bay-seam]')] : [];
    const baySteps = Math.max(1, bayIds.length - 1);
    const bayWideQuery = window.matchMedia('(min-width: 1024px)');
    let bayHorizontal = false;

    const renderBay = (snapshot: JourneySnapshot, interior: boolean) => {
      if (!bay) return;
      journey.dataset.bayMode = bayHorizontal ? 'horizontal' : 'stacked';
      journey.style.setProperty('--bay-progress', snapshot.bayProgress.toFixed(4));
      const live = Math.min(baySteps, Math.max(0, Math.round(snapshot.bayProgress * baySteps)));
      journey.dataset.bayPhase = bayIds[live] ?? '';
      bayRooms.forEach((room, index) => {
        room.dataset.roomPhase = index < live ? 'behind' : index === live ? 'live' : 'ahead';
      });
      // The crease plate is brightest where the fold is deepest and gone at both
      // endpoints, so it can never be the thing that changes when the veil retires.
      const strength = interior ? Math.sin(Math.PI * snapshot.transitionProgress) : 0;
      baySeams.forEach((seam) => {
        const live = interior && seam.dataset.baySeam === snapshot.boundaryKey;
        seam.style.setProperty('--bay-seam-strength', live ? strength.toFixed(3) : '0');
        const swirl = seam.querySelector<HTMLVideoElement>('.reclaim-bay__swirl');
        if (!swirl) return;
        if (live && bayHorizontal && presentationEnabled && !saveDataEnabled()) {
          if (!swirl.dataset.swirlRequested) {
            swirl.dataset.swirlRequested = 'true';
            if (swirl.dataset.swirlPoster) swirl.poster = swirl.dataset.swirlPoster;
            swirl.preload = 'auto';
            swirl.load();
          }
          if (swirl.paused) void swirl.play().catch(() => undefined);
        } else if (!swirl.paused) {
          swirl.pause();
        }
      });
    };

    const trackTween = (tween: gsap.core.Tween) => {
      activeTweens.add(tween);
      tween.eventCallback('onComplete', () => activeTweens.delete(tween));
      return tween;
    };

    const settleHeadline = (record: HeadlineRecord) => {
      record.phase = 'settled';
      record.title.dataset.headlineState = 'settled';
    };

    /** T8: a refused entrance keeps the words — split reverted, `.sr-only` twin removed. */
    const revertSupportSplits = () => {
      supportSplits.splice(0).forEach(({ split, spoken }) => {
        split.revert();
        spoken.remove();
      });
    };

    chapters.forEach((chapter, id) => {
      const records = [...chapter.querySelectorAll<HTMLElement>('.display-title, .chapter-title')]
        .filter((title) => isJourneyMotionOwnedNode(title, chapter))
        .map((title): HeadlineRecord => ({
          phase: 'ready',
          style: headlineStyleForChapter(id),
          title,
        }));
      headlines.set(id, records);
    });

    const createHeadlineSplit = (record: HeadlineRecord) => {
      const words = headlineMotionSpec(record.style, compactQuery.matches).split === 'words';
      record.title.dataset.headlineStyle = record.style;
      record.title.dataset.headlineState = 'entering';
      record.split = SplitText.create(record.title, {
        type: words ? 'words' : 'lines',
        mask: words ? 'words' : 'lines',
        linesClass: 'headline-line',
        wordsClass: 'headline-word',
        aria: 'auto',
        autoSplit: true,
        onSplit: (split) => {
          const units = words ? split.words : split.lines;
          const mode = headlineMotionMode({ presentationEnabled, phase: record.phase });
          if (mode === 'static' || mode === 'settled') {
            record.title.dataset.headlineState = mode;
            const reset = gsap.set(units, { clearProps: 'all' });
            record.animation = reset;
            return reset;
          }

          const spec = headlineMotionSpec(record.style, compactQuery.matches);
          const timeline = gsap.timeline();
          record.animation = timeline;
          const epoxyMask = record.style === 'epoxy-mask';
          const converge = spec.converge ?? 0;
          timeline.fromTo(units, {
            ...spec.from,
            // Act 1 only: the offset is per unit, so it is a function of the word's
            // index rather than one value shared by the whole headline.
            ...(converge > 0 ? {
              x: (index: number) => wordConvergeFrom(index, converge).x,
              y: (index: number) => wordConvergeFrom(index, converge).y,
            } : {}),
            transformOrigin: epoxyMask ? undefined : '50% 80%',
            willChange: epoxyMask ? 'clip-path' : 'transform, opacity',
          }, {
            x: 0,
            xPercent: 0,
            y: 0,
            yPercent: 0,
            z: 0,
            rotationX: 0,
            opacity: 1,
            ...spec.to,
            duration: spec.duration,
            ease: spec.ease,
            stagger: headlineStagger(spec, units.length),
            clearProps: 'transform,opacity,clipPath,willChange',
            overwrite: 'auto',
          });
          timeline.eventCallback('onComplete', () => settleHeadline(record));
          return timeline;
        },
      });
    };

    /**
     * Act 1's supporting copy: `line-rise` on the eyebrow, `line-rise` on the lead
     * 0.12 s behind it, then the CTAs and the phone link fading up last — after the
     * lead has finished arriving, so nothing is still moving under the headline
     * while it converges (storyboard §3, T7).
     *
     * The eyebrow and the lead are `<p>`s, so `aria:'auto'` is out (T3: a generic
     * role prohibits `aria-label`). The approved pattern is `aria:'hidden'` plus one
     * real `.sr-only` string beside the element, removed again on revert.
     * @motion line-rise
     */
    const buildHeroSupport = (chapter: HTMLElement) => {
      const spec = headlineMotionSpec('line-rise', compactQuery.matches);
      const rise = (element: HTMLElement, delay: number) => {
        const spoken = document.createElement('span');
        spoken.className = 'sr-only';
        spoken.textContent = element.textContent?.trim() ?? '';
        element.insertAdjacentElement('afterend', spoken);
        const split = SplitText.create(element, {
          type: 'lines',
          mask: 'lines',
          linesClass: 'headline-line',
          aria: 'hidden',
          autoSplit: true,
          onSplit: (self) => (presentationEnabled
            ? gsap.fromTo(self.lines, { ...spec.from, willChange: 'transform, opacity' }, {
              yPercent: 0,
              opacity: 1,
              duration: spec.duration,
              ease: spec.ease,
              delay,
              stagger: headlineStagger(spec, self.lines.length),
              clearProps: 'transform,opacity,willChange',
              overwrite: 'auto',
            })
            : gsap.set(self.lines, { clearProps: 'all' })),
        });
        supportSplits.push({ split, spoken });
      };

      const eyebrow = chapter.querySelector<HTMLElement>('.hero-content .eyebrow');
      const lead = chapter.querySelector<HTMLElement>('.hero-content .lead');
      if (eyebrow && isJourneyMotionOwnedNode(eyebrow, chapter)) rise(eyebrow, HERO_SUPPORT_TIMING.eyebrowAt);
      if (lead && isJourneyMotionOwnedNode(lead, chapter)) rise(lead, HERO_SUPPORT_TIMING.leadLag);

      // Opacity and a 14 px rise only: a CTA is a hit target, and the row must not
      // travel across the place a pointer is already heading for.
      const actions = [...chapter.querySelectorAll<HTMLElement>('.hero-content .button-row > *')]
        .filter((element) => isJourneyMotionOwnedNode(element, chapter));
      if (actions.length) {
        trackTween(gsap.fromTo(actions, HERO_SUPPORT_TIMING.actionsFrom, {
          y: 0,
          opacity: 1,
          duration: HERO_SUPPORT_TIMING.actionsDuration,
          ease: spec.ease,
          delay: HERO_SUPPORT_TIMING.leadLag + spec.duration + HERO_SUPPORT_TIMING.actionsLag,
          stagger: HERO_SUPPORT_TIMING.actionsStagger,
          clearProps: 'transform,opacity',
          overwrite: 'auto',
        }));
      }
    };

    const revealChapter = (id: JourneyChapterId) => {
      if (!presentationEnabled || revealed.has(id)) return;
      revealed.add(id);
      headlines.get(id)?.forEach((record) => {
        if (record.phase === 'settled') return;
        record.phase = 'entering';
        if (record.split) {
          record.animation?.play(0);
          return;
        }
        // `word-converge` is the one entrance that must not be split before the face
        // it will be measured with has resolved; every other style is split inline.
        if (headlineMotionSpec(record.style, compactQuery.matches).split === 'words') {
          void fontsSettled(record.title).then(() => {
            if (disposed || !presentationEnabled || record.split || record.phase === 'settled') return;
            createHeadlineSplit(record);
          });
          return;
        }
        createHeadlineSplit(record);
      });
      const chapter = chapters.get(id);
      if (!chapter) return;
      if (id === 'portico') {
        buildHeroSupport(chapter);
        return;
      }
      const supporting = [...chapter.querySelectorAll<HTMLElement>('.eyebrow, .lead, .chapter-link')]
        .filter((element) => isJourneyMotionOwnedNode(element, chapter));
      if (supporting.length) {
        const spec = headlineMotionSpec('lateral-curtain', compactQuery.matches, 'label');
        trackTween(gsap.fromTo(supporting, spec.from, {
          xPercent: 0,
          opacity: 1,
          duration: spec.duration,
          ease: spec.ease,
          stagger: spec.stagger,
          clearProps: 'transform,opacity',
          overwrite: 'auto',
        }));
      }
    };

    const updateVideoReadiness = (video: HTMLVideoElement, visible: boolean) => {
      const decoded = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      const previous = readyVideos.get(video) ?? false;
      const decodedVisualReady = previous || decoded;
      readyVideos.set(video, decodedVisualReady);
      const ready = videoVisualReady({ decodedVisualReady, presentationEnabled, visible });
      video.toggleAttribute('data-video-ready', ready);
      video.style.opacity = ready ? '1' : '0';
      if (shouldInvalidateForMediaReadiness(previous, decodedVisualReady)) journeyDirector.invalidateGeometry();
    };

    const settleVideoSeek = (video: HTMLVideoElement) => {
      pendingSeeks.delete(video);
      renderSnapshot();
    };

    const videoCleanups = [...videos.values()].map((video) => {
      const update = () => renderSnapshot();
      const reset = () => {
        readyVideos.set(video, false);
        renderSnapshot();
      };
      const seeking = () => {
        pendingSeeks.add(video);
        renderSnapshot();
      };
      const seeked = () => settleVideoSeek(video);
      ['loadeddata', 'canplay'].forEach((event) => video.addEventListener(event, update));
      ['emptied', 'error'].forEach((event) => video.addEventListener(event, reset));
      video.addEventListener('seeking', seeking);
      video.addEventListener('seeked', seeked);
      return () => {
        ['loadeddata', 'canplay'].forEach((event) => video.removeEventListener(event, update));
        ['emptied', 'error'].forEach((event) => video.removeEventListener(event, reset));
        video.removeEventListener('seeking', seeking);
        video.removeEventListener('seeked', seeked);
      };
    });

    const promoteVideo = (
      id: JourneyChapterId,
      residentChapters: readonly JourneyChapterId[],
      documentActive: boolean,
    ) => {
      if (!presentationEnabled || saveDataEnabled()) return;
      const video = videos.get(id);
      if (!video) return;
      if (shouldRequestVideo(requestedVideos.has(video), id, residentChapters, documentActive)) {
        requestedVideos.add(video);
        // The pour's top rung is chosen here rather than by a `<source media>` query,
        // because the rung depends on the capability tier as well as the viewport and
        // only this module knows the tier. The markup keeps the 480/720 ladder as the
        // no-JS answer; `preload="none"` means nothing has been fetched yet, so
        // naming a `src` now costs no second download.
        if (id === 'portico') {
          const rung = pourFilmSource({ viewportWidth: window.innerWidth, tier });
          if (rung && !video.currentSrc.endsWith(rung)) video.src = rung;
        }
        video.preload = 'auto';
        if (video.readyState < 2) video.load();
      }
    };

    const requestVideoTime = (video: HTMLVideoElement, desiredTime: number) => {
      const target = videoSeekTarget({
        currentTime: video.currentTime,
        desiredTime,
        seeking: video.seeking || pendingSeeks.has(video),
      });
      if (target === null) return;
      pendingSeeks.add(video);
      video.currentTime = target;
    };

    const renderSnapshot = () => {
      const snapshot: JourneySnapshot = journeyDirector.getSnapshot();
      const residentChapters = journeyMediaResidents(snapshot);
      const documentActive = snapshot.visible && snapshot.documentVisible;
      const compositorReady = journey.hasAttribute('data-journey-enhanced');
      // `balanced` never downloads the compositor, so the plates take the stage
      // on the director's word alone; `full` waits for the veil to be live.
      const stageOwned = presentationEnabled && (tier === 'balanced' || compositorReady);
      const transitionInterior = snapshot.transitionProgress > 0 && snapshot.transitionProgress < 1;
      const hideForWhiteExit = snapshot.transitionFromWhite && snapshot.transitionProgress < 1;
      journey.dataset.room = snapshot.activeChapter;
      journey.dataset.journeyRevision = String(snapshot.revision);
      journey.toggleAttribute('data-journey-on-white', snapshot.whiteStageActive);
      journey.dataset.mediaOwner = snapshot.mediaOwner;
      journey.style.setProperty('--handoff', snapshot.handoff.toFixed(4));
      if (stageOwned) journey.dataset.mediaStage = tier;
      else delete journey.dataset.mediaStage;
      renderBay(snapshot, transitionInterior);

      const onStage = new Set<JourneyChapterId>();
      chapters.forEach((chapter, id) => {
        const role = transitionInterior
          ? id === snapshot.toChapter
            ? 'to'
            : id === snapshot.fromChapter && !snapshot.transitionFromWhite ? 'from' : null
          : null;
        const staged = stageOwned && !snapshot.whiteStageActive && (transitionInterior
          ? role !== null
          : !hideForWhiteExit && id === snapshot.activeChapter);
        chapter.toggleAttribute('data-journey-active', id === snapshot.activeChapter);
        chapter.toggleAttribute('data-media-active', staged);
        if (staged && role) chapter.dataset.mediaRole = role;
        else delete chapter.dataset.mediaRole;
        if (staged) onStage.add(id);
      });
      if (snapshot.readingChapter) revealChapter(snapshot.readingChapter);
      residentChapters.forEach((id) => promoteVideo(id, residentChapters, documentActive));
      videos.forEach((video, id) => {
        if (documentActive && residentChapters.includes(id)) return;
        video.pause();
        video.preload = 'none';
      });

      if (presentationEnabled && !saveDataEnabled() && documentActive) {
        if (!transitionInterior) {
          const film = videos.get(snapshot.activeChapter);
          if (film && film.readyState >= 2 && Number.isFinite(film.duration) && film.duration > 0) {
            const time = journeyFilmTime(snapshot.activeChapter, snapshot.chapterProgress, film.duration);
            requestVideoTime(film, time);
          }
        }
        // The incoming room is *held* on frame 0 — which is its poster — for the
        // whole interior, so the p = 1 end of a boundary has no frame to jump to.
        // Holding, not seeding once: a chapter stays resident when the visitor
        // scrolls back into the boundary it just left, and a one-shot seed would
        // leave that plate showing wherever the scrub had reached. `requestVideoTime`
        // no-ops inside its tolerance, so repeating it every frame costs nothing.
        // @motion frame-zero-hold
        if (transitionInterior) {
          const incoming = videos.get(snapshot.toChapter);
          if (incoming && incoming.readyState >= 2) requestVideoTime(incoming, 0);
        }
      }
      // Each staged plate shows its own film through the interior, including the
      // incoming one held on frame 0 above. Hiding the films mid-boundary and
      // falling back to posters was measured worse, not better: the p = 0.5 seam
      // on foundation:garage reads 11.34% of the media area changed with the
      // films hidden against 0.82% with them on stage, because the outgoing
      // plate then swaps its scrubbed frame for a poster part-way through.
      videos.forEach((video, id) => updateVideoReadiness(
        video,
        documentActive && !snapshot.whiteStageActive && onStage.has(id),
      ));
    };

    const applyMotionPreference = () => {
      const wasEnabled = presentationEnabled;
      tier = currentJourneyTier(journeyControls.getSnapshot().motionPreference);
      presentationEnabled = tier !== 'still';
      bayHorizontal = Boolean(bay) && bayIds.length > 1 && tier === 'full' && bayWideQuery.matches;
      root.dataset.journeyTier = tier;
      root.dataset.journeyMotion = presentationEnabled ? 'enhanced' : 'still';
      if (!presentationEnabled) {
        activeTweens.forEach((tween) => tween.kill());
        activeTweens.clear();
        revertSupportSplits();
        headlines.forEach((records) => records.forEach((record) => {
          record.animation?.kill();
          if (record.phase === 'entering') settleHeadline(record);
          record.split?.revert();
          record.animation = undefined;
          record.split = undefined;
          record.title.dataset.headlineState = 'static';
        }));
        chapters.forEach((chapter) => {
          const supporting = [...chapter.querySelectorAll<HTMLElement>('.eyebrow, .lead, .chapter-link')]
            .filter((element) => isJourneyMotionOwnedNode(element, chapter));
          gsap.set(supporting, { clearProps: 'all' });
        });
        videos.forEach((video) => video.pause());
      } else if (!wasEnabled) {
        headlines.forEach((records) => records.forEach((record) => {
          record.title.dataset.headlineState = record.phase === 'settled' ? 'settled' : 'ready';
        }));
      }
      videos.forEach((video) => updateVideoReadiness(video, false));
      renderSnapshot();
    };

    const unsubscribe = journeyDirector.subscribe(renderSnapshot);
    const unsubscribeControls = journeyControls.subscribe(applyMotionPreference);
    reducedQuery.addEventListener('change', applyMotionPreference);
    // A resize across 1024 px changes which composition Act 4 is in, and the
    // director has to re-measure because the rooms change height with it.
    bayWideQuery.addEventListener('change', applyMotionPreference);
    bayWideQuery.addEventListener('change', journeyDirector.invalidateGeometry);
    window.addEventListener(JOURNEY_COMPOSITOR_READY_EVENT, renderSnapshot);
    applyMotionPreference();

    // Same reason as the director above: this whole teardown has to land before the
    // swap, not after it, or the outgoing page's splits and tweens outlive it.
    return onRouteTeardown(() => {
      disposed = true;
      unsubscribe();
      unsubscribeControls();
      reducedQuery.removeEventListener('change', applyMotionPreference);
      bayWideQuery.removeEventListener('change', applyMotionPreference);
      bayWideQuery.removeEventListener('change', journeyDirector.invalidateGeometry);
      window.removeEventListener(JOURNEY_COMPOSITOR_READY_EVENT, renderSnapshot);
      activeTweens.forEach((tween) => tween.kill());
      revertSupportSplits();
      videoCleanups.forEach((cleanup) => cleanup());
      videos.forEach((video) => {
        video.removeAttribute('data-video-ready');
        video.style.removeProperty('opacity');
      });
      headlines.forEach((records) => records.forEach((record) => {
        record.animation?.kill();
        record.split?.revert();
        delete record.title.dataset.headlineStyle;
        delete record.title.dataset.headlineState;
      }));
      chapters.forEach((chapter) => {
        chapter.removeAttribute('data-journey-active');
        chapter.removeAttribute('data-media-active');
        delete chapter.dataset.mediaRole;
      });
      baySeams.forEach((seam) => {
        seam.style.removeProperty('--bay-seam-strength');
        seam.querySelector<HTMLVideoElement>('.reclaim-bay__swirl')?.pause();
      });
      bayRooms.forEach((room) => delete room.dataset.roomPhase);
      journey.removeAttribute('data-journey-on-white');
      journey.style.removeProperty('--handoff');
      journey.style.removeProperty('--bay-progress');
      delete journey.dataset.bayMode;
      delete journey.dataset.bayPhase;
      delete journey.dataset.mediaStage;
      delete journey.dataset.mediaOwner;
      delete journey.dataset.journeyRevision;
      delete root.dataset.journeyMotion;
      delete root.dataset.journeyTier;
    });
  }, []);

  return null;
}
