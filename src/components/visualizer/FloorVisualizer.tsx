import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ErrorInfo,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { finishCssBackground, finishPresets, type FinishPreset } from '../../lib/visualizer/finishes';
import {
  containRect,
  imagePointToStagePercent,
  prepareDetectionPhoto,
  prepareLocalPreviewPhoto,
  stagePointToImage,
  validateLocalPhoto,
  validateMaskGeometry,
  type Size,
} from '../../lib/visualizer/image-geometry';
import {
  appendExclusionPoint,
  beginExclusionStroke,
  clearExclusionMask,
  createExclusionMask,
  undoExclusionStroke,
  type ExclusionMaskDraft,
  type ExclusionMode,
} from '../../lib/visualizer/exclusion-mask';
import { adaptMaskResponse, type MaskDetectionResult } from '../../lib/visualizer/mask-client';
import { createPhotoRevisionGate, type PhotoRevisionGate } from '../../lib/visualizer/photo-revision';
import { validateQuad, type Quad } from '../../lib/visualizer/homography';
import VisualizerMotion, { captureFinishFlip } from './VisualizerMotion';
import './floor-visualizer.css';

const FinishPreview = lazy(() => import('./FinishPreview'));

type NormalizedPoint = readonly [number, number];
type NormalizedPoints = readonly [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];

const DEFAULT_POINTS: NormalizedPoints = [[0.17, 0.48], [0.83, 0.48], [0.99, 0.99], [0.01, 0.99]];
const FEATURED_IDS = new Set(['alabaster-stone', 'salt-pepper', 'blue-hour']);

class PreviewErrorBoundary extends Component<{
  children: ReactNode;
  onError: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function supportsLivePreview(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || connection?.saveData) return false;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2');
  const supported = Boolean(context);
  context?.getExtension('WEBGL_lose_context')?.loseContext();
  canvas.width = 0;
  canvas.height = 0;
  return supported;
}

function asQuad(points: NormalizedPoints): Quad {
  return points.map(([x, y]) => ({ x, y })) as unknown as Quad;
}

function photoErrorMessage(code: string): string {
  if (code === 'ANIMATED_IMAGE_UNSUPPORTED') return 'Choose a still photograph. Animated PNG and WebP files are not supported.';
  if (code === 'HEIC_UNSUPPORTED') return 'HEIC photos are not supported here yet. Export the photo as JPEG, PNG, or WebP and try again.';
  if (code === 'IMAGE_TOO_LARGE') return 'Please choose an image no larger than 20 MiB.';
  if (code === 'IMAGE_TOO_MANY_PIXELS') return 'Please choose an image no larger than 48 megapixels.';
  return 'Please choose a valid JPEG, PNG, or WebP room photo.';
}

export default function FloorVisualizer({ detectionEnabled = false }: { detectionEnabled?: boolean }) {
  const shell = useRef<HTMLElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const revisionGate = useRef<PhotoRevisionGate | null>(null);
  const activeBrushPointer = useRef<number | null>(null);
  if (!revisionGate.current) revisionGate.current = createPhotoRevisionGate();

  const [hydrated, setHydrated] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [rendererReady, setRendererReady] = useState(false);
  const [selectedId, setSelectedId] = useState('alabaster-stone');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRevision, setPhotoRevision] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<Size>({ width: 4, height: 3 });
  const [stageSize, setStageSize] = useState<Size>({ width: 1, height: 1 });
  const [compare, setCompare] = useState(100);
  const [aiConsent, setAiConsent] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [mask, setMask] = useState<Extract<MaskDetectionResult, { status: 'detected' }>['mask'] | null>(null);
  const [exclusionMask, setExclusionMask] = useState<ExclusionMaskDraft | null>(null);
  const [brushMode, setBrushMode] = useState<ExclusionMode | null>(null);
  const [points, setPoints] = useState<NormalizedPoints>(DEFAULT_POINTS);
  const [pointHistory, setPointHistory] = useState<NormalizedPoints[]>([]);
  const [notice, setNotice] = useState('Choose a finish, then add a photo when you are ready.');

  const selected = useMemo(
    () => finishPresets.find((finish) => finish.id === selectedId) ?? finishPresets[0],
    [selectedId],
  );
  const imageRect = useMemo(() => containRect(stageSize, photoSize), [photoSize, stageSize]);

  useEffect(() => {
    setHydrated(true);
    setRendererReady(false);
    setEnhanced(supportsLivePreview());
    const finish = new URLSearchParams(window.location.search).get('finish');
    if (finish && finishPresets.some((item) => item.id === finish)) setSelectedId(finish);
  }, []);

  const handlePreviewReady = useCallback(() => setRendererReady(true), []);
  const handlePreviewUnavailable = useCallback(() => {
    setRendererReady(false);
    setEnhanced(false);
    setNotice('Live rendering is unavailable. Your local photo and manual corner controls remain available in the basic preview.');
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) setStageSize({ width: bounds.width, height: bounds.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    revisionGate.current?.dispose();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  const selectFinish = (id: string) => {
    if (id === selectedId) return;
    captureFinishFlip(shell.current);
    setSelectedId(id);
  };

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileValidation = validateLocalPhoto(file);
    if (!fileValidation.ok) {
      setNotice(photoErrorMessage(fileValidation.code));
      return;
    }

    const revision = revisionGate.current!.advance();
    setDetecting(false);
    setNotice('Reading the photo safely on this device…');
    try {
      const prepared = await prepareLocalPreviewPhoto(file, revision.signal);
      if (revision.signal.aborted || !revisionGate.current?.isCurrent(revision.photoRevision)) return;
      const nextUrl = URL.createObjectURL(prepared.blob);
      const previousUrl = objectUrl.current;
      objectUrl.current = nextUrl;
      setPhotoFile(file);
      setPhotoUrl(nextUrl);
      setPhotoRevision(revision.photoRevision);
      setPhotoSize(prepared.size);
      setAiConsent(false);
      setMask(null);
      setExclusionMask(createExclusionMask(revision.photoRevision));
      setBrushMode(null);
      setPoints(DEFAULT_POINTS);
      setPointHistory([]);
      setCompare(100);
      setNotice(
        enhanced
          ? 'Photo added locally. Drag the four corners to follow the floor, then adjust the comparison.'
          : 'Photo added locally. This browser uses a basic aligned color preview; the corner controls remain available for framing.',
      );
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    } catch (error) {
      if (!revision.signal.aborted && revisionGate.current?.isCurrent(revision.photoRevision)) {
        setNotice(error instanceof Error && ['IMAGE_TOO_MANY_PIXELS', 'ANIMATED_IMAGE_UNSUPPORTED'].includes(error.message)
          ? photoErrorMessage(error.message)
          : 'This photo could not be decoded safely. Try a JPEG, PNG, or WebP export.');
      }
    }
  };

  const updatePoint = (index: number, x: number, y: number, record = true) => {
    const next = points.map((point, pointIndex) => pointIndex === index
      ? [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))] as const
      : point) as unknown as NormalizedPoints;
    const validation = validateQuad(asQuad(next));
    if (!validation.ok) {
      setNotice('Keep the four floor corners in order without crossing or collapsing the floor plane.');
      return;
    }
    if (record) setPointHistory((history) => [...history.slice(-19), points]);
    setPoints(next);
  };

  const updatePointFromPointer = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const bounds = stage.current?.getBoundingClientRect();
    if (!bounds) return;
    const point = stagePointToImage({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, imageRect);
    updatePoint(index, point.x, point.y, false);
  };

  const handleCornerKey = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const [x, y] = points[index];
    const step = event.shiftKey ? 0.04 : 0.01;
    const movement: Record<string, NormalizedPoint> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    updatePoint(index, x + delta[0], y + delta[1]);
  };

  const brushPoint = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const beginBrush = (event: PointerEvent<HTMLDivElement>) => {
    if (!brushMode || !photoRevision) return;
    const point = brushPoint(event);
    activeBrushPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setExclusionMask((current) => beginExclusionStroke(
      current ?? createExclusionMask(photoRevision),
      photoRevision,
      brushMode,
      point,
      brushMode === 'erase' ? 0.028 : 0.018,
    ));
  };

  const continueBrush = (event: PointerEvent<HTMLDivElement>) => {
    if (activeBrushPointer.current !== event.pointerId || !photoRevision) return;
    const point = brushPoint(event);
    setExclusionMask((current) => current ? appendExclusionPoint(current, photoRevision, point) : current);
  };

  const endBrush = (event: PointerEvent<HTMLDivElement>) => {
    if (activeBrushPointer.current !== event.pointerId) return;
    activeBrushPointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setNotice('Local object mask updated. Your photo and brush strokes remain on this device.');
  };

  const detectFloor = async () => {
    if (!detectionEnabled || !photoFile || !photoRevision || !aiConsent) return;
    const signal = revisionGate.current!.startTask(photoRevision);
    if (signal.aborted) return;
    setDetecting(true);
    setNotice('Preparing a private, downscaled copy for floor detection…');
    try {
      const prepared = await prepareDetectionPhoto(photoFile, signal);
      const form = new FormData();
      form.append('photo', prepared.file);
      form.append('consent', 'true');
      form.append('photoRevision', photoRevision);

      const sessionResponse = await fetch('/api/visualizer/session', {
        credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' }, signal,
      });
      if (!sessionResponse.ok) throw new Error('Visualizer session unavailable.');
      const session = await sessionResponse.json() as { token?: string };
      if (!session.token) throw new Error('Visualizer session unavailable.');

      const response = await fetch('/api/visualizer/mask', {
        method: 'POST', body: form, credentials: 'same-origin',
        headers: { accept: 'application/json', 'x-visualizer-session': session.token }, signal,
      });
      if (!response.ok) throw new Error('Floor detection failed.');
      const result = await adaptMaskResponse(await response.json(), photoRevision, undefined, signal);
      if (signal.aborted || !revisionGate.current?.isCurrent(photoRevision) || result.photoRevision !== photoRevision) return;
      if (result.status !== 'detected') {
        setMask(null);
        setNotice(result.status === 'no-floor'
          ? 'No floor could be detected confidently. The local four-corner preview is still ready to use.'
          : 'The floor detection was uncertain. Refine the four corners in the local preview.');
        return;
      }
      const geometry = validateMaskGeometry(prepared.size, result.mask);
      if (!geometry.ok) {
        setMask(null);
        setNotice('The detected mask did not align with this photo. The local four-corner preview is unchanged.');
        return;
      }
      setMask(result.mask);
      setNotice('Floor detected. Refine the four corners if needed, then compare the finish with the original.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError') && revisionGate.current?.isCurrent(photoRevision)) {
        setNotice('Automatic detection is unavailable right now. Your local manual preview still works.');
      }
    } finally {
      if (revisionGate.current?.isActiveTask(signal)) setDetecting(false);
    }
  };

  const undoPoints = () => {
    const previous = pointHistory.at(-1);
    if (!previous) return;
    setPoints(previous);
    setPointHistory((history) => history.slice(0, -1));
    setNotice('Previous floor corners restored.');
  };

  const resetPoints = () => {
    if (points !== DEFAULT_POINTS) setPointHistory((history) => [...history.slice(-19), points]);
    setPoints(DEFAULT_POINTS);
    setNotice('Floor corners reset.');
  };

  const copyShareLink = async () => {
    const url = new URL(`${window.location.pathname}?finish=${selected.id}`, window.location.origin).toString();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable.');
      await navigator.clipboard.writeText(url);
      setNotice(`Share link copied for ${selected.name}.`);
    } catch {
      setNotice('The share link could not be copied. You can copy it from the browser address bar.');
    }
  };

  const families: Array<FinishPreset['family']> = ['flake', 'solid', 'metallic'];

  return (
    <section ref={shell} className="visualizer-shell" aria-label="Floor finish visualizer">
      <VisualizerMotion selectedId={selectedId} />
      <div className="visualizer-workspace">
        <div ref={stage} className={`photo-stage ${photoUrl ? 'has-photo' : ''} ${rendererReady ? 'is-live' : ''}`} data-finish-stage data-preview={rendererReady ? 'live' : 'still'}>
          {enhanced ? (
            <div
              className={`preview-viewport preview-viewport--live${photoUrl ? '' : ' preview-viewport--alcove'}`}
              style={photoUrl ? { left: imageRect.x, top: imageRect.y, width: imageRect.width, height: imageRect.height } : undefined}
            >
              <PreviewErrorBoundary onError={handlePreviewUnavailable}>
                <Suspense fallback={null}>
                  <FinishPreview
                    finish={selected}
                    points={points}
                    compare={photoUrl ? compare : 100}
                    photo={Boolean(photoUrl)}
                    photoUrl={photoUrl}
                    photoSize={photoSize}
                    photoRevision={photoRevision}
                    maskUrl={mask?.dataUrl ?? null}
                    exclusionMask={exclusionMask}
                    onReady={handlePreviewReady}
                    onUnavailable={handlePreviewUnavailable}
                  />
                </Suspense>
              </PreviewErrorBoundary>
            </div>
          ) : null}
          {photoUrl ? (
            <div className="photo-frame">
              <img src={photoUrl} alt="Your uploaded room preview" />
              <div className="fallback-viewport" style={{ left: imageRect.x, top: imageRect.y, width: imageRect.width, height: imageRect.height }}>
                <div className="finish-plane" style={{
                  background: finishCssBackground(selected),
                  clipPath: `polygon(${points.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(', ')})`,
                  opacity: compare / 100,
                  ...(mask ? { WebkitMaskImage: `url(${mask.dataUrl})`, maskImage: `url(${mask.dataUrl})` } : {}),
                }} aria-hidden="true" />
              </div>
              <div className="plane-guide">
                {points.map(([x, y], index) => {
                  const position = imagePointToStagePercent({ x, y }, imageRect, stageSize);
                  return (
                    <button
                      key={index}
                      type="button"
                      role="slider"
                      aria-label={`Floor corner ${index + 1}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(x * 100)}
                      aria-valuetext={`${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down`}
                      style={{ left: `${position.x}%`, top: `${position.y}%` }}
                      onKeyDown={(event) => handleCornerKey(index, event)}
                      onPointerDown={(event) => {
                        setPointHistory((history) => [...history.slice(-19), points]);
                        event.currentTarget.setPointerCapture(event.pointerId);
                        updatePointFromPointer(index, event);
                      }}
                      onPointerMove={(event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePointFromPointer(index, event);
                      }}
                      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                    />
                  );
                })}
              </div>
              <div
                className="local-mask-brush-surface"
                data-brush-mode={brushMode ?? 'off'}
                aria-hidden={!brushMode}
                style={{
                  position: 'absolute',
                  left: imageRect.x,
                  top: imageRect.y,
                  width: imageRect.width,
                  height: imageRect.height,
                  zIndex: 5,
                  pointerEvents: rendererReady && brushMode ? 'auto' : 'none',
                  touchAction: 'none',
                  cursor: brushMode ? 'crosshair' : 'default',
                }}
                onPointerDown={beginBrush}
                onPointerMove={continueBrush}
                onPointerUp={endBrush}
                onPointerCancel={endBrush}
              />
            </div>
          ) : (
            <>
              <div className="upload-empty">
                <span className="upload-number">01</span>
                <span className="concept-label">Illustrative concept · coated-floor preview</span>
                <h2>Add a clear room photo</h2>
                <p>Stand near the entrance and include as much of the floor edge as possible.</p>
                <label className="upload-button">
                  Upload a room or garage photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} disabled={!hydrated} />
                </label>
              </div>
            </>
          )}
        </div>

        <div className="workspace-controls">
          {photoUrl && (
            <>
              <div className="photo-actions">
                <label className="replace-photo">Replace photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} disabled={!hydrated} /></label>
                <button type="button" onClick={undoPoints} disabled={pointHistory.length === 0}>Undo corners</button>
                <button type="button" onClick={resetPoints}>Reset corners</button>
              </div>
              <div className="local-mask-tools" aria-label="Local object masking tools">
                <span>Keep tools and objects visible · private, local brush</span>
                <button type="button" aria-pressed={brushMode === 'erase'} disabled={!rendererReady} onClick={() => {
                  setBrushMode((current) => current === 'erase' ? null : 'erase');
                  setNotice('Erase brush: paint over tools or objects that should stay visible. Nothing leaves this device.');
                }}>Erase object</button>
                <button type="button" aria-pressed={brushMode === 'restore'} disabled={!rendererReady} onClick={() => {
                  setBrushMode((current) => current === 'restore' ? null : 'restore');
                  setNotice('Restore brush: paint finish back into an erased area. Nothing leaves this device.');
                }}>Restore finish</button>
                <button type="button" disabled={!exclusionMask?.strokes.length} onClick={() => {
                  setExclusionMask((current) => current ? undoExclusionStroke(current) : current);
                  setNotice('Last local mask stroke undone.');
                }}>Undo stroke</button>
                <button type="button" disabled={!exclusionMask?.strokes.length} onClick={() => {
                  setExclusionMask((current) => current ? clearExclusionMask(current) : current);
                  setNotice('Local object mask cleared.');
                }}>Clear mask</button>
              </div>
              <label className="compare-control">
                <span>Original</span>
                <input type="range" min="0" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} aria-label="Compare original photo with finish preview" />
                <span>Preview</span>
              </label>
              {detectionEnabled ? (
                <div className="ai-detection">
                  <label><input type="checkbox" checked={aiConsent} onChange={(event) => {
                    setAiConsent(event.target.checked);
                    if (!event.target.checked) {
                      revisionGate.current?.cancelTask();
                      setDetecting(false);
                      setNotice('Automatic detection permission withdrawn. The local preview is unchanged.');
                    }
                  }} />I consent to sending a downscaled copy of this photo to the floor-detection provider for this preview.</label>
                  <button type="button" onClick={detectFloor} disabled={!hydrated || !aiConsent || detecting}>{detecting ? 'Detecting floor…' : 'Detect floor with AI'}</button>
                </div>
              ) : (
                <div className="ai-detection ai-detection--disabled"><strong>Automatic detection is not enabled for this preview.</strong><span>The local four-corner visualizer remains private and fully available.</span></div>
              )}
            </>
          )}
          <p className="privacy-note"><strong>Private by default.</strong> Manual mode keeps the photo on this device. Automatic detection only sends a downscaled copy after explicit permission.</p>
          <p className="status-note" role="status">{notice}</p>
        </div>
      </div>

      <aside className="finish-library" aria-label="Inspiration finish library">
        <div className="selected-finish">
          <p>{selected.family} inspiration</p>
          <div className="selected-finish-row"><span className="finish-live-swatch" data-flip-id={`finish-${selected.id}`} style={{ background: finishCssBackground(selected) }} aria-hidden="true" /><h2>{selected.name}</h2></div>
          <span>{selected.description}</span>
        </div>
        <p className="featured-finish-note">Featured · Full-Flake Porcelain · Salt &amp; Pepper · Cobalt Terrazzo</p>
        <div className="finish-grid" tabIndex={0} aria-label="Scroll through 30 finish inspirations">
          {families.map((family) => (
            <div key={family} className="finish-family" data-family={family}>
              <p>{family}</p>
              {finishPresets.filter((finish) => finish.family === family).map((finish) => (
                <button type="button" key={finish.id} disabled={!hydrated} data-featured={FEATURED_IDS.has(finish.id) ? 'true' : undefined} aria-label={`Finish: ${finish.name}`} aria-pressed={finish.id === selected.id} className={finish.id === selected.id ? 'is-selected' : ''} onClick={() => selectFinish(finish.id)}>
                  <span data-flip-id={`finish-${finish.id}`} style={{ background: finishCssBackground(finish) }} aria-hidden="true" />
                  <small>{finish.name}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="share-row">
          <a className="upload-button" href={`/contact?finish=${selected.id}#quote`}>Ask Denis about this finish</a>
          <button type="button" disabled={!hydrated} onClick={copyShareLink}>Copy share link</button>
        </div>
        <p className="visualizer-disclaimer">Visualization for design inspiration. Lighting, screen colour, texture scale, and available systems vary. Confirm the final selection with Final Finish.</p>
      </aside>
    </section>
  );
}
