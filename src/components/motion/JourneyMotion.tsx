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
  type HeadlinePhase,
  type HeadlineStyle,
} from '../../lib/motion/headline-motion';
import {
  openingPourOpacity,
  shouldInvalidateForMediaReadiness,
  shouldRequestVideo,
  videoSeekTarget,
  videoVisualReady,
} from '../../lib/motion/journey-media';

gsap.registerPlugin(SplitText);

const saveDataEnabled = () => Boolean(
  (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
);

interface HeadlineRecord {
  animation?: gsap.core.Animation;
  phase: HeadlinePhase;
  split?: SplitText;
  splitConfig?: SplitText.Vars;
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
    const railItems = [...document.querySelectorAll<HTMLElement>('.journey-rail [data-journey-target]')];
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
    let presentationEnabled = !reducedQuery.matches
      && journeyControls.getSnapshot().motionPreference === 'auto';

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
      const records = [...chapter.querySelectorAll<HTMLElement>('.display-title, .chapter-title')].map((title) => {
        const record: HeadlineRecord = {
          phase: 'ready',
          style: headlineStyleForChapter(id),
          title,
        };
        title.dataset.headlineStyle = record.style;
        title.dataset.headlineState = 'ready';
        const splitConfig: SplitText.Vars = {
          type: 'lines',
          mask: 'lines',
          linesClass: 'headline-line',
          aria: 'auto',
          autoSplit: true,
          onSplit: (split) => {
            const mode = headlineMotionMode({ presentationEnabled, phase: record.phase });
            if (mode === 'static' || mode === 'settled') {
              title.dataset.headlineState = mode;
              const reset = gsap.set(split.lines, { clearProps: 'all' });
              record.animation = reset;
              return reset;
            }

            const spec = headlineMotionSpec(record.style, compactQuery.matches);
            const timeline = gsap.timeline({ paused: mode === 'prepare' });
            record.animation = timeline;
            title.dataset.headlineState = mode === 'prepare' ? 'ready' : 'entering';
            timeline.fromTo(split.lines, {
              ...spec.from,
              transformOrigin: '50% 80%',
              willChange: 'transform, opacity',
            }, {
              x: 0,
              xPercent: 0,
              y: 0,
              yPercent: 0,
              z: 0,
              rotationX: 0,
              opacity: 1,
              duration: spec.duration,
              ease: spec.ease,
              stagger: headlineStagger(spec, split.lines.length),
              clearProps: 'transform,opacity,willChange',
              overwrite: 'auto',
            });
            timeline.eventCallback('onComplete', () => settleHeadline(record));
            return timeline;
          },
        };
        record.splitConfig = splitConfig;
        record.split = SplitText.create(title, splitConfig);
        return record;
      });
      headlines.set(id, records);
    });

    const revealChapter = (id: JourneyChapterId) => {
      if (!presentationEnabled || revealed.has(id)) return;
      revealed.add(id);
      headlines.get(id)?.forEach((record) => {
        if (record.phase === 'settled') return;
        record.phase = 'entering';
        record.title.dataset.headlineState = 'entering';
        if (record.animation) record.animation.play(0);
        else settleHeadline(record);
      });
      const supporting = chapters.get(id)?.querySelectorAll<HTMLElement>('.eyebrow, .lead, .chapter-link, .button-row');
      if (supporting?.length) {
        trackTween(gsap.fromTo(supporting, { y: 12, opacity: 0 }, {
          y: 0,
          opacity: 1,
          duration: 0.58,
          ease: 'power2.out',
          stagger: 0.05,
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

    const promoteVideo = (id: JourneyChapterId) => {
      if (!presentationEnabled || saveDataEnabled()) return;
      const video = videos.get(id);
      if (!video) return;
      if (shouldRequestVideo(requestedVideos.has(video))) {
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
      const compositorReady = journey.hasAttribute('data-journey-enhanced');
      const transitionInterior = snapshot.transitionProgress > 0 && snapshot.transitionProgress < 1;
      const hideForWhiteExit = snapshot.transitionFromWhite && snapshot.transitionProgress < 1;
      journey.dataset.room = snapshot.activeChapter;
      journey.dataset.journeyRevision = String(snapshot.revision);
      journey.toggleAttribute('data-journey-on-white', snapshot.whiteStageActive);
      journey.style.setProperty('--journey-progress', snapshot.journeyProgress.toFixed(4));
      journey.style.setProperty('--chapter-progress', snapshot.chapterProgress.toFixed(4));
      journey.style.setProperty('--dissolve', snapshot.transitionProgress.toFixed(4));
      journey.style.setProperty('--dissolve-from', String(snapshot.fromIndex));
      journey.style.setProperty('--dissolve-to', String(snapshot.toIndex));
      chapters.forEach((chapter, id) => {
        chapter.toggleAttribute('data-journey-active', id === snapshot.activeChapter);
        chapter.toggleAttribute(
          'data-media-active',
          compositorReady && !snapshot.whiteStageActive && !hideForWhiteExit && id === snapshot.activeChapter,
        );
      });
      railItems.forEach((item) => {
        item.setAttribute('aria-current', item.dataset.journeyTarget === snapshot.activeChapter ? 'true' : 'false');
      });
      revealChapter(snapshot.activeChapter);
      promoteVideo(snapshot.activeChapter);
      promoteVideo(snapshot.toChapter);

      const hero = chapters.get('portico');
      hero?.style.setProperty('--pour-opacity', String(openingPourOpacity()));

      if (presentationEnabled && !saveDataEnabled() && !transitionInterior) {
        const film = videos.get(snapshot.activeChapter);
        if (film && film.readyState >= 2 && Number.isFinite(film.duration) && film.duration > 0) {
          const time = journeyFilmTime(snapshot.activeChapter, snapshot.chapterProgress, film.duration);
          requestVideoTime(film, time);
        }
      }
      videos.forEach((video, id) => updateVideoReadiness(
        video,
        id === snapshot.activeChapter && !transitionInterior && !snapshot.whiteStageActive,
      ));
    };

    const applyMotionPreference = () => {
      const wasEnabled = presentationEnabled;
      presentationEnabled = !reducedQuery.matches && journeyControls.getSnapshot().motionPreference === 'auto';
      root.dataset.journeyMotion = presentationEnabled ? 'enhanced' : 'still';
      if (!presentationEnabled) {
        activeTweens.forEach((tween) => tween.kill());
        activeTweens.clear();
        headlines.forEach((records) => records.forEach((record) => {
          record.animation?.pause();
          if (record.phase === 'entering') settleHeadline(record);
          gsap.set(record.split?.lines ?? [record.title], { clearProps: 'all' });
          record.title.dataset.headlineState = 'static';
        }));
        chapters.forEach((chapter) => {
          gsap.set(chapter.querySelectorAll('.eyebrow, .lead, .chapter-link, .button-row'), { clearProps: 'all' });
        });
      } else if (!wasEnabled) {
        headlines.forEach((records) => records.forEach((record) => {
          if (record.phase === 'ready' && record.splitConfig) record.split?.split(record.splitConfig);
          else record.title.dataset.headlineState = 'settled';
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
        record.split?.kill();
        record.split?.revert();
        delete record.title.dataset.headlineStyle;
        delete record.title.dataset.headlineState;
      }));
      chapters.forEach((chapter) => {
        chapter.removeAttribute('data-journey-active');
        chapter.removeAttribute('data-media-active');
      });
      chapters.get('portico')?.style.removeProperty('--pour-opacity');
      journey.removeAttribute('data-journey-on-white');
      delete journey.dataset.journeyRevision;
      delete root.dataset.journeyMotion;
    };
  }, []);

  return null;
}
