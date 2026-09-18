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
  headlineMotionMode,
  headlineMotionSpec,
  headlineStagger,
  headlineStyleForChapter,
  isJourneyMotionOwnedNode,
  type HeadlinePhase,
  type HeadlineStyle,
} from '../../lib/motion/headline-motion';
import {
  journeyMediaResidents,
  shouldInvalidateForMediaReadiness,
  shouldRequestVideo,
  videoSeekTarget,
  videoVisualReady,
} from '../../lib/motion/journey-media';
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

export default function JourneyMotion() {
  useEffect(() => {
    journeyControls.hydrate();
    journeyDirector.start();
    return () => journeyDirector.stop();
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
    const readyVideos = new WeakMap<HTMLVideoElement, boolean>();
    const requestedVideos = new WeakSet<HTMLVideoElement>();
    const pendingSeeks = new WeakSet<HTMLVideoElement>();
    let tier: JourneyTier = currentJourneyTier(journeyControls.getSnapshot().motionPreference);
    let presentationEnabled = tier !== 'still';

    const trackTween = (tween: gsap.core.Tween) => {
      activeTweens.add(tween);
      tween.eventCallback('onComplete', () => activeTweens.delete(tween));
      return tween;
    };

    const settleHeadline = (record: HeadlineRecord) => {
      record.phase = 'settled';
      record.title.dataset.headlineState = 'settled';
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
      record.title.dataset.headlineStyle = record.style;
      record.title.dataset.headlineState = 'entering';
      record.split = SplitText.create(record.title, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'headline-line',
        aria: 'auto',
        autoSplit: true,
        onSplit: (split) => {
          const mode = headlineMotionMode({ presentationEnabled, phase: record.phase });
          if (mode === 'static' || mode === 'settled') {
            record.title.dataset.headlineState = mode;
            const reset = gsap.set(split.lines, { clearProps: 'all' });
            record.animation = reset;
            return reset;
          }

          const spec = headlineMotionSpec(record.style, compactQuery.matches);
          const timeline = gsap.timeline();
          record.animation = timeline;
          const epoxyMask = record.style === 'epoxy-mask';
          timeline.fromTo(split.lines, {
            ...spec.from,
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
            stagger: headlineStagger(spec, split.lines.length),
            clearProps: 'transform,opacity,clipPath,willChange',
            overwrite: 'auto',
          });
          timeline.eventCallback('onComplete', () => settleHeadline(record));
          return timeline;
        },
      });
    };

    const revealChapter = (id: JourneyChapterId) => {
      if (!presentationEnabled || revealed.has(id)) return;
      revealed.add(id);
      headlines.get(id)?.forEach((record) => {
        if (record.phase === 'settled') return;
        record.phase = 'entering';
        if (!record.split) createHeadlineSplit(record);
        else record.animation?.play(0);
      });
      const chapter = chapters.get(id);
      const supporting = chapter
        ? [...chapter.querySelectorAll<HTMLElement>('.eyebrow, .lead, .chapter-link')]
          .filter((element) => isJourneyMotionOwnedNode(element, chapter))
        : [];
      if (supporting?.length) {
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
      root.dataset.journeyTier = tier;
      root.dataset.journeyMotion = presentationEnabled ? 'enhanced' : 'still';
      if (!presentationEnabled) {
        activeTweens.forEach((tween) => tween.kill());
        activeTweens.clear();
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
    window.addEventListener(JOURNEY_COMPOSITOR_READY_EVENT, renderSnapshot);
    applyMotionPreference();

    return () => {
      unsubscribe();
      unsubscribeControls();
      reducedQuery.removeEventListener('change', applyMotionPreference);
      window.removeEventListener(JOURNEY_COMPOSITOR_READY_EVENT, renderSnapshot);
      activeTweens.forEach((tween) => tween.kill());
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
      journey.removeAttribute('data-journey-on-white');
      journey.style.removeProperty('--handoff');
      delete journey.dataset.mediaStage;
      delete journey.dataset.mediaOwner;
      delete journey.dataset.journeyRevision;
      delete root.dataset.journeyMotion;
      delete root.dataset.journeyTier;
    };
  }, []);

  return null;
}
