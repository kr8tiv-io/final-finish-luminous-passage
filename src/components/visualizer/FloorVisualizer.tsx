import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { choosePassageQuality } from '../../lib/motion/passage';
import { finishCssBackground, finishPresets, type FinishPreset } from '../../lib/visualizer/finishes';
import VisualizerMotion, { captureFinishFlip } from './VisualizerMotion';
import './floor-visualizer.css';

const FinishPreview = lazy(() => import('./FinishPreview'));

function detectPreview() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const quality = choosePassageQuality({
    webgl2: Boolean(document.createElement('canvas').getContext('webgl2')),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: Boolean(connection?.saveData),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
  });
  return quality !== 'still';
}

export default function FloorVisualizer() {
  const shell = useRef<HTMLElement | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [selectedId, setSelectedId] = useState(finishPresets[0].id);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoSize, setPhotoSize] = useState({ w: 4, h: 3 });
  const [compare, setCompare] = useState(100);
  const [aiConsent, setAiConsent] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [points, setPoints] = useState<ReadonlyArray<readonly [number, number]>>([[17, 48], [83, 48], [99, 99], [1, 99]]);
  const [notice, setNotice] = useState('Choose a finish, then add a photo when you are ready.');
  const objectUrl = useRef<string | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(
    () => finishPresets.find((finish) => finish.id === selectedId) ?? finishPresets[0],
    [selectedId],
  );

  useEffect(() => {
    setHydrated(true);
    setEnhanced(detectPreview());
    const finish = new URLSearchParams(window.location.search).get('finish');
    if (finish && finishPresets.some((item) => item.id === finish)) setSelectedId(finish);
  }, []);

  const selectFinish = (id: string) => {
    if (id === selectedId) return;
    captureFinishFlip(shell.current);
    setSelectedId(id);
  };

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice('Please choose a JPG, PNG, WebP, or HEIC room photo.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setNotice('Please choose an image smaller than 20 MB.');
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    setPhotoFile(file);
    setPhotoUrl(objectUrl.current);
    setAiConsent(false);
    setMaskUrl(null);
    setPoints([[17, 48], [83, 48], [99, 99], [1, 99]]);
    setNotice('Photo added locally. Drag the four corners to follow the floor, then adjust the comparison.');
    void createImageBitmap(file).then((bitmap) => {
      setPhotoSize({ w: bitmap.width, h: bitmap.height });
      bitmap.close();
    }).catch(() => undefined);
  };

  const updatePoint = (index: number, x: number, y: number) => {
    setPoints((current) => current.map((point, pointIndex) => pointIndex === index
      ? [Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y))] as const
      : point));
  };

  const updatePointFromPointer = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const bounds = stage.current?.querySelector('.photo-frame')?.getBoundingClientRect() ?? stage.current?.getBoundingClientRect();
    if (!bounds) return;
    updatePoint(index, ((event.clientX - bounds.left) / bounds.width) * 100, ((event.clientY - bounds.top) / bounds.height) * 100);
  };

  const handleCornerKey = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const [x, y] = points[index];
    const step = event.shiftKey ? 4 : 1;
    const movement: Record<string, readonly [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    updatePoint(index, x + delta[0], y + delta[1]);
  };

  const detectFloor = async () => {
    if (!photoFile || !aiConsent) return;
    setDetecting(true);
    setNotice('Detecting the floor plane…');
    const form = new FormData();
    form.append('photo', photoFile);
    form.append('consent', aiConsent ? 'true' : 'false');
    try {
      const sessionResponse = await fetch('/api/visualizer/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!sessionResponse.ok) throw new Error('Visualizer session unavailable.');
      const session = await sessionResponse.json() as { token?: string };
      if (!session.token) throw new Error('Visualizer session unavailable.');

      const response = await fetch('/api/visualizer/mask', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        headers: { 'x-visualizer-session': session.token },
      });
      if (!response.ok) throw new Error('Floor detection failed.');
      const result = await response.json() as { masks?: Array<string | { url?: string; image?: { url?: string } }> };
      const firstMask = result.masks?.[0];
      const nextMask = typeof firstMask === 'string' ? firstMask : firstMask?.url ?? firstMask?.image?.url ?? null;
      setMaskUrl(nextMask);
      setNotice('Floor detection complete. Use the four floor points as a visual check, then compare finishes.');
    } catch {
      setNotice('Automatic detection is unavailable right now. Your local manual preview still works.');
    } finally {
      setDetecting(false);
    }
  };

  const families: Array<FinishPreset['family']> = ['flake', 'solid', 'metallic'];

  return (
    <section ref={shell} className="visualizer-shell" aria-label="Floor finish visualizer">
      <VisualizerMotion selectedId={selectedId} />
      <div className="visualizer-workspace">
        <div
          ref={stage}
          className={`photo-stage ${photoUrl ? 'has-photo' : ''} ${enhanced ? 'is-live' : ''}`}
          data-finish-stage
          data-preview={enhanced ? 'live' : 'still'}
        >
          {photoUrl ? (
            <div className="photo-frame" style={{ aspectRatio: `${photoSize.w} / ${photoSize.h}` }}>
              {enhanced ? (
                <Suspense fallback={null}>
                  <FinishPreview finish={selected} points={points} compare={compare} photo />
                </Suspense>
              ) : null}
              <img src={photoUrl} alt="Your uploaded room preview" />
              <div
                className="finish-plane"
                style={{
                  background: finishCssBackground(selected),
                  clipPath: `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(', ')})`,
                  opacity: compare / 100,
                  ...(maskUrl ? { WebkitMaskImage: `url(${maskUrl})`, maskImage: `url(${maskUrl})` } : {}),
                }}
                aria-hidden="true"
              />
              <div className="plane-guide">
                {points.map(([x, y], index) => (
                  <button
                    key={index}
                    type="button"
                    role="slider"
                    aria-label={`Floor corner ${index + 1}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(x)}
                    aria-valuetext={`${Math.round(x)}% across, ${Math.round(y)}% down`}
                    style={{ left: `${x}%`, top: `${y}%` }}
                    onKeyDown={(event) => handleCornerKey(index, event)}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      updatePointFromPointer(index, event);
                    }}
                    onPointerMove={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePointFromPointer(index, event);
                    }}
                    onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {enhanced ? (
                <Suspense fallback={null}>
                  <FinishPreview finish={selected} points={points} compare={100} photo={false} />
                </Suspense>
              ) : null}
            <div className="upload-empty">
              <span className="upload-number">01</span>
              <h2>Add a clear room photo</h2>
              <p>Stand near the entrance and include as much of the floor edge as possible.</p>
              <label className="upload-button">
                Upload a room or garage photo
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handlePhoto} disabled={!hydrated} />
              </label>
            </div>
            </>
          )}
        </div>

        <div className="workspace-controls">
          {photoUrl && (
            <>
              <label className="replace-photo">
                Replace photo
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handlePhoto} disabled={!hydrated} />
              </label>
              <label className="compare-control">
                <span>Original</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={compare}
                  onChange={(event) => setCompare(Number(event.target.value))}
                  aria-label="Compare original photo with finish preview"
                />
                <span>Preview</span>
              </label>
              <div className="ai-detection">
                <label>
                  <input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} />
                  I consent to sending this downscaled photo to the AI floor-detection provider for this preview.
                </label>
                <button type="button" onClick={detectFloor} disabled={!hydrated || !aiConsent || detecting}>
                  {detecting ? 'Detecting floor…' : 'Detect floor with AI'}
                </button>
              </div>
            </>
          )}
          <p className="privacy-note"><strong>Private by default.</strong> Manual mode keeps the photo on this device. AI floor detection will always ask permission before uploading.</p>
          <p className="status-note" role="status">{notice}</p>
        </div>
      </div>

      <aside className="finish-library" aria-label="Inspiration finish library">
        <div className="selected-finish">
          <p>{selected.family} inspiration</p>
          <div className="selected-finish-row">
            <span
              className="finish-live-swatch"
              data-flip-id={`finish-${selected.id}`}
              style={{ background: finishCssBackground(selected) }}
              aria-hidden="true"
            />
            <h2>{selected.name}</h2>
          </div>
          <span>{selected.description}</span>
        </div>

        <div className="finish-grid" tabIndex={0} aria-label="Scroll through 30 finish inspirations">
          {families.map((family) => (
            <div key={family} className="finish-family" data-family={family}>
              <p>{family}</p>
              {finishPresets.filter((finish) => finish.family === family).map((finish) => (
                <button
                  type="button"
                  key={finish.id}
                  disabled={!hydrated}
                  aria-label={`Finish: ${finish.name}`}
                  aria-pressed={finish.id === selected.id}
                  className={finish.id === selected.id ? 'is-selected' : ''}
                  onClick={() => selectFinish(finish.id)}
                >
                  <span data-flip-id={`finish-${finish.id}`} style={{ background: finishCssBackground(finish) }} aria-hidden="true" />
                  <small>{finish.name}</small>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="share-row">
          <a className="upload-button" href={`/contact?finish=${selected.id}#quote`}>Email this finish to Denis</a>
          <button
            type="button"
            disabled={!hydrated}
            onClick={() => {
              const url = `${window.location.pathname}?finish=${selected.id}`;
              void navigator.clipboard?.writeText(new URL(url, window.location.origin).toString());
              setNotice(`Share link ready for ${selected.name}.`);
            }}
          >
            Copy share link
          </button>
        </div>
        <p className="visualizer-disclaimer">Visualization for design inspiration. Lighting, screen colour, texture scale, and available systems vary. Confirm the final selection with Final Finish.</p>
      </aside>
    </section>
  );
}
