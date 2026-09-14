import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { quoteRequestSchema, type QuoteRequest } from '../../lib/quote/schema';
import { isBoundedJpegDataUrl, QUOTE_BODY_BYTES } from '../../lib/quote/limits';
import { finishPresets } from '../../lib/visualizer/finishes';
import { decodePhotoBitmap, resolvePhotoType } from '../../lib/visualizer/photo-header';

type QuoteDraft = Omit<QuoteRequest, 'consent' | 'photos'> & { consent: boolean; photos: NonNullable<QuoteRequest['photos']> };
const initialRequest: QuoteDraft = {
  location: '', spaceType: 'garage', sizeBand: 'unknown', conditions: [],
  finishInterest: 'not-sure', timeline: 'researching', name: '', email: '', phone: '',
  contactPreference: 'phone', consent: false, website: '', notes: '', visualizerFinishId: '', photos: [],
};
const spaceOptions = [['garage', 'Garage'], ['basement', 'Basement'], ['workshop', 'Workshop'], ['barn', 'Barn'], ['other-residential', 'Other home space'], ['warehouse', 'Warehouse'], ['showroom', 'Showroom'], ['industrial', 'Industrial facility']] as const;
const conditions = [['cracks', 'Cracks'], ['pitting', 'Pitting'], ['oil', 'Oil staining'], ['old-coating', 'Old coating'], ['road-salt', 'Winter residue'], ['moisture', 'Possible moisture'], ['not-sure', 'Not sure']] as const;

async function compressPhoto(file: File): Promise<QuoteDraft['photos'][number]> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(resolvePhotoType(file) ?? '')) throw new Error('Please export HEIC photos as JPEG, or choose a PNG or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MiB.');
  const bitmap = await decodePhotoBitmap(file).catch((error: unknown) => {
    if (error instanceof Error && error.message === 'IMAGE_TOO_MANY_PIXELS') throw new Error('Choose a photo no larger than 48 megapixels.');
    if (error instanceof Error && error.message === 'ANIMATED_IMAGE_UNSUPPORTED') throw new Error('Choose a still photograph; animated PNG and WebP files are not supported.');
    throw new Error('This photo could not be decoded safely. Please choose a JPEG, PNG, or WebP export.');
  });
  try {
    if (bitmap.width * bitmap.height > 48_000_000) throw new Error('Choose a photo smaller than 48 megapixels.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the photo.');
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, (1280 * 0.8 ** attempt) / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', .72);
      if (isBoundedJpegDataUrl(data)) return { name: file.name.replace(/\.[^.]+$/, '.jpg').slice(-120), type: 'image/jpeg', data };
    }
    throw new Error('This photo could not be reduced safely. Please choose a smaller JPEG.');
  } finally { bitmap.close(); }
}

export default function QuoteForm() {
  const reduceMotion = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(1);
  const [transitioning, setTransitioning] = useState(false);
  const [request, setRequest] = useState<QuoteDraft>(initialRequest);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'uncertain'>('idle');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [photoNote, setPhotoNote] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [sendPhotos, setSendPhotos] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const focusAfterNavigation = useRef(false);
  const selectedFinish = finishPresets.find((finish) => finish.id === request.visualizerFinishId);
  useEffect(() => {
    setHydrated(true);
    const query = new URLSearchParams(window.location.search);
    const finish = finishPresets.find((entry) => entry.id === query.get('finish'));
    const space = query.get('space');
    setRequest((current) => ({
      ...current,
      ...(finish ? { visualizerFinishId: finish.id, finishInterest: finish.family } : {}),
      ...(spaceOptions.some(([id]) => id === space) ? { spaceType: space as QuoteRequest['spaceType'] } : {}),
    }));
  }, []);
  const update = <K extends keyof QuoteDraft>(key: K, value: QuoteDraft[K]) => setRequest((current) => ({ ...current, [key]: value }));
  const changeStep = (value: number) => {
    if (transitioning) return;
    focusAfterNavigation.current = true;
    setTransitioning(true);
    setError(''); setStep(value);
  };
  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].slice(0, 6 - request.photos.length);
    if (!files.length || preparing) return;
    setPreparing(true);
    try {
      const photos: QuoteDraft['photos'] = [];
      for (const file of files) photos.push(await compressPhoto(file));
      setRequest((current) => ({ ...current, photos: [...current.photos, ...photos].slice(0, 6) }));
      setPhotoNote('Photos prepared locally. They are sent only if you tick the attachment option and submit.');
    } catch (failure) { setPhotoNote(failure instanceof Error ? failure.message : 'This photo could not be read.'); }
    finally { setPreparing(false); }
  };
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== 'idle' || preparing) return;
    const parsed = quoteRequestSchema.safeParse({
      ...request, photos: sendPhotos && request.photos.length ? request.photos : undefined,
      visualizerFinishId: request.visualizerFinishId || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your project details.');
      return;
    }
    const body = JSON.stringify(parsed.data);
    if (new TextEncoder().encode(body).length > QUOTE_BODY_BYTES) { setError('Please remove a photo before sending.'); return; }
    setStatus('sending'); setError('');
    try {
      const response = await fetch('/api/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        setStatus(response.status >= 500 ? 'uncertain' : 'idle');
        setError(response.status >= 500
          ? 'We could not confirm delivery. Please call Denis before sending again to avoid a duplicate request.'
          : response.status === 429 ? 'Please wait before sending another request, or call Denis.' : 'Please check the project details or call (780) 991-1651.');
        return;
      }
      const result = await response.json() as { reference: string };
      if (typeof result.reference !== 'string') throw new Error('Delivery could not be confirmed. Please call Denis.');
      setReference(result.reference); setStatus('success');
      setRequest((current) => ({ ...current, photos: [] }));
    } catch { setStatus('uncertain'); setError('We could not confirm delivery. Please call Denis before sending again to avoid a duplicate request.'); }
  };

  if (status === 'success') return <div className="quote-success" role="status"><p className="eyebrow">Request sent</p><h2>Thank you. Your project details are on their way.</h2><p>Keep reference <strong>{reference}</strong> if you need to follow up.</p><a href="tel:+17809911651">Call Denis · (780) 991-1651</a></div>;
  return <form className="quote-form quote-desk" aria-label="Request an epoxy flooring quote" aria-busy={transitioning} onSubmit={submit}>
    <div className="quote-progress"><p>Step {step} of 3</p><progress max="3" value={step}>{step} of 3</progress></div>
    {selectedFinish && <p className="quote-selected-finish">Your inspiration: <strong>{selectedFinish.name}</strong><br /><small>Physical sample and availability to confirm with Denis.</small></p>}
    <AnimatePresence mode="wait">
      <motion.div ref={panel} key={step} tabIndex={-1} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }} onAnimationComplete={(definition) => {
        // Exit callbacks must not consume the next panel's focus request.
        if (typeof definition === 'object' && !Array.isArray(definition) && definition.opacity === 1) {
          setTransitioning(false);
          if (focusAfterNavigation.current) {
            panel.current?.focus({ preventScroll: true });
            focusAfterNavigation.current = false;
          }
        }
      }}>
        {step === 1 && <fieldset>
          <legend>Where could your space go?</legend>
          <label>City or postal code<input disabled={!hydrated} value={request.location} onChange={(event) => update('location', event.target.value)} autoComplete="postal-code" placeholder="Edmonton, AB" minLength={2} maxLength={120} /></label>
          <h3>What kind of space?</h3>
          <div className="choice-grid">{spaceOptions.map(([value, label]) => <label key={value}><input type="radio" name="spaceType" checked={request.spaceType === value} onChange={() => update('spaceType', value)} />{label}</label>)}</div>
        </fieldset>}
        {step === 2 && <fieldset>
          <legend>A few details. Nothing needs to be exact.</legend>
          <p>These are optional starting points. Denis can help clarify the scope.</p>
          <label>Approximate size<select value={request.sizeBand} onChange={(event) => update('sizeBand', event.target.value as QuoteRequest['sizeBand'])}>
            <option value="unknown">Not sure yet</option><option value="single-car">Single-car garage</option><option value="two-car">Two-car garage</option><option value="three-plus-car">Three-plus-car garage</option><option value="under-1000">Under 1,000 sq. ft.</option><option value="over-1000">Over 1,000 sq. ft.</option>
          </select></label>
          <details><summary>Anything noticeable about the concrete?</summary><div className="choice-grid compact">{conditions.map(([value, label]) => <label key={value}><input type="checkbox" checked={request.conditions.includes(value)} onChange={() => update('conditions', request.conditions.includes(value) ? request.conditions.filter((item) => item !== value) : [...request.conditions, value])} />{label}</label>)}</div></details>
          <label>Finish direction<select value={request.finishInterest} onChange={(event) => update('finishInterest', event.target.value as QuoteRequest['finishInterest'])}><option value="not-sure">Not sure yet</option><option value="flake">Decorative flake</option><option value="solid">Solid colour</option><option value="metallic">Metallic</option></select></label>
          <label>Timing<select value={request.timeline} onChange={(event) => update('timeline', event.target.value as QuoteRequest['timeline'])}><option value="researching">I’m researching</option><option value="as-soon-as-possible">As soon as possible</option><option value="1-3-months">Within 1–3 months</option><option value="3-6-months">Within 3–6 months</option></select></label>
          <label>Anything else? <span>(optional)</span><textarea value={request.notes} maxLength={2000} rows={3} onChange={(event) => update('notes', event.target.value)} /></label>
          <details><summary>Add floor photographs (optional)</summary>
            <p>JPEG, PNG, or WebP; up to six photos. Each is reduced locally to at most 256 KiB.</p>
            <label>Choose photographs<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={preparing || request.photos.length >= 6} onChange={addPhotos} /></label>
            {photoNote && <p role="status">{photoNote}</p>}
            {request.photos.length > 0 && <><p>{request.photos.length} photos ready. <button type="button" onClick={() => { update('photos', []); setSendPhotos(false); setPhotoNote('Photos removed.'); }}>Remove all</button></p><label className="consent-row"><input type="checkbox" checked={sendPhotos} onChange={(event) => setSendPhotos(event.target.checked)} />Send these photos to Final Finish with my request.</label></>}
          </details>
        </fieldset>}
        {step === 3 && <fieldset>
          <legend>How should Denis reach you?</legend>
          <label className="quote-honeypot" aria-hidden="true">Leave this field empty<input tabIndex={-1} autoComplete="off" value={request.website ?? ''} onChange={(event) => update('website', event.target.value)} /></label>
          <label>Name<input value={request.name} onChange={(event) => update('name', event.target.value)} autoComplete="name" minLength={2} maxLength={100} required /></label>
          <div className="choice-grid compact">{([['phone', 'Phone call'], ['email', 'Email'], ['text', 'Text message']] as const).map(([value, label]) => <label key={value}><input type="radio" name="contactPreference" checked={request.contactPreference === value} onChange={() => update('contactPreference', value)} />{label}</label>)}</div>
          <label>Email {request.contactPreference !== 'email' && '(optional)'}<input type="email" value={request.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" maxLength={180} required={request.contactPreference === 'email'} /></label>
          <label>Phone {request.contactPreference === 'email' && '(optional)'}<input type="tel" value={request.phone} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" maxLength={30} required={request.contactPreference !== 'email'} /></label>
          <label className="consent-row"><input type="checkbox" checked={request.consent} onChange={(event) => update('consent', event.target.checked)} required />I agree Final Finish may contact me about this request.</label>
          {sendPhotos && request.photos.length > 0 && <p>{request.photos.length} photos will be attached.</p>}
        </fieldset>}
      </motion.div>
    </AnimatePresence>
    {error && <p className="form-error" role="alert">{error} {status === 'uncertain' && <a href="tel:+17809911651">Call (780) 991-1651</a>}</p>}
    <div className="quote-actions">
      {step > 1 && <button className="back-button" type="button" disabled={transitioning || status === 'sending'} onClick={() => changeStep(step - 1)}>Back</button>}
      {step < 3 ? <button type="button" disabled={transitioning || !hydrated || preparing || request.location.trim().length < 2} onClick={() => changeStep(step + 1)}>{step === 1 ? 'Continue to project details' : 'Continue to contact details'}</button>
      : <button type="submit" disabled={!hydrated || status !== 'idle' || preparing || !request.consent}>{status === 'sending' ? 'Sending…' : status === 'uncertain' ? 'Please confirm with Denis' : 'Send quote request'}</button>}
    </div>
  </form>;
}
