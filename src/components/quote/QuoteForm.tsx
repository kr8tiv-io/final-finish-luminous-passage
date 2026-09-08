import { useEffect, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { QuoteRequest } from '../../lib/quote/schema';

type QuoteDraft = Omit<QuoteRequest, 'consent' | 'photos'> & {
  consent: boolean;
  photos: NonNullable<QuoteRequest['photos']>;
};

const initialRequest: QuoteDraft = {
  location: '',
  spaceType: 'garage',
  sizeBand: 'unknown',
  conditions: [],
  finishInterest: 'not-sure',
  timeline: 'researching',
  name: '',
  email: '',
  phone: '',
  contactPreference: 'phone',
  consent: false,
  website: '',
  notes: '',
  visualizerFinishId: '',
  photos: [],
};

const spaceOptions = [
  ['garage', 'Garage'], ['barn', 'Barn'], ['workshop', 'Workshop'], ['other-residential', 'Other residential space'],
  ['warehouse', 'Warehouse'], ['showroom', 'Showroom'], ['industrial', 'Industrial facility'],
] as const;
const sizeOptions = [
  ['single-car', 'Single-car garage'], ['two-car', 'Two-car garage'], ['three-plus-car', 'Three-plus-car garage'],
  ['under-1000', 'Commercial — under 1,000 sq. ft.'], ['over-1000', 'Commercial — over 1,000 sq. ft.'], ['unknown', 'Not sure yet'],
] as const;
const conditionOptions = [
  ['cracks', 'Cracks'], ['pitting', 'Pitting or spalling'], ['oil', 'Oil staining'], ['old-coating', 'Old coating'],
  ['road-salt', 'Road-salt wear'], ['moisture', 'Possible moisture'], ['not-sure', 'Not sure'],
] as const;

async function compressPhoto(file: File): Promise<{ name: string; type: 'image/jpeg'; data: string }> {
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not compress photo.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', 0.72);
  bitmap.close();
  return { name: file.name.replace(/\.[^.]+$/, '.jpg'), type: 'image/jpeg', data };
}

const stepEase = [0.22, 0.7, 0.2, 1] as const;

export default function QuoteForm() {
  const reduceMotion = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(1);
  const [request, setRequest] = useState<QuoteDraft>(initialRequest);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [reference, setReference] = useState('');
  const [photoNote, setPhotoNote] = useState('');
  const stepMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
        transition: { duration: 0.36, ease: stepEase },
      };

  useEffect(() => {
    setHydrated(true);
    const finish = new URLSearchParams(window.location.search).get('finish');
    if (finish) setRequest((current) => ({ ...current, visualizerFinishId: finish, finishInterest: 'flake' }));
  }, []);

  const update = <Key extends keyof QuoteDraft>(key: Key, value: QuoteDraft[Key]) => {
    setRequest((current) => ({ ...current, [key]: value }));
  };

  const toggleCondition = (condition: QuoteDraft['conditions'][number]) => {
    update('conditions', request.conditions.includes(condition)
      ? request.conditions.filter((item) => item !== condition)
      : [...request.conditions, condition]);
  };

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].slice(0, 6 - request.photos.length);
    if (!files.length) return;
    try {
      const next = await Promise.all(files.map(compressPhoto));
      update('photos', [...request.photos, ...next].slice(0, 6));
      setPhotoNote(`${Math.min(6, request.photos.length + next.length)} photo(s) attached.`);
    } catch {
      setPhotoNote('One of those photos could not be read. Try a JPG or PNG.');
    }
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!request.consent) return;
    setStatus('sending');
    try {
      const payload: QuoteRequest = {
        ...request,
        consent: true,
        photos: request.photos.length ? request.photos : undefined,
        visualizerFinishId: request.visualizerFinishId || undefined,
        website: request.website || undefined,
      };
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Quote request could not be delivered.');
      const result = await response.json() as { reference: string };
      setReference(result.reference);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <motion.div className="quote-success" role="status" initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: stepEase }}>
        <p className="eyebrow">Request received</p>
        <h2>Your project is in Denis’s inbox.</h2>
        <p>Reference <strong>{reference}</strong>. Check that the email landed, then add anything extra by phone if you need to.</p>
        <a href="tel:+17809911651">Need to add something? Call Denis.</a>
      </motion.div>
    );
  }

  const canContinue = step === 1 ? request.location.trim().length >= 2 : true;

  return (
    <form className="quote-form quote-desk" aria-label="Request an epoxy flooring quote" onSubmit={submit}>
      <div className="quote-progress">
        <p>Step {step} of 6</p>
        <progress max="6" value={step}>{step} of 6</progress>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} {...stepMotion}>
          {step === 1 && (
            <fieldset>
              <legend>Where is the project?</legend>
              <p>Start with the city or postal code. This helps confirm whether the project is within the current service area.</p>
              <label>City or postal code<input disabled={!hydrated} value={request.location} onChange={(event) => update('location', event.target.value)} autoComplete="postal-code" placeholder="Edmonton, AB" /></label>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset>
              <legend>What kind of space is it?</legend>
              <p>Choose the closest fit. You can add context before sending.</p>
              <div className="choice-grid">
                {spaceOptions.map(([value, label]) => <label key={value}><input type="radio" name="spaceType" value={value} checked={request.spaceType === value} onChange={() => update('spaceType', value)} />{label}</label>)}
              </div>
            </fieldset>
          )}

          {step === 3 && (
            <fieldset>
              <legend>How large—and what is the concrete doing?</legend>
              <p>Square footage, moisture, oil, old coating, cove, and stairs all change the number. An estimate is enough to start.</p>
              <div className="choice-grid">
                {sizeOptions.map(([value, label]) => <label key={value}><input type="radio" name="sizeBand" value={value} checked={request.sizeBand === value} onChange={() => update('sizeBand', value)} />{label}</label>)}
              </div>
              <h3>Visible condition</h3>
              <div className="choice-grid compact">
                {conditionOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={request.conditions.includes(value)} onChange={() => toggleCondition(value)} />{label}</label>)}
              </div>
            </fieldset>
          )}

          {step === 4 && (
            <fieldset>
              <legend>Which finish direction interests you?</legend>
              <p>This is a starting point, not a locked selection.</p>
              <div className="choice-grid">
                {[['flake', 'Decorative flake'], ['solid', 'Solid colour'], ['metallic', 'Metallic'], ['not-sure', 'Not sure yet']].map(([value, label]) => <label key={value}><input type="radio" name="finishInterest" value={value} checked={request.finishInterest === value} onChange={() => update('finishInterest', value as QuoteRequest['finishInterest'])} />{label}</label>)}
              </div>
            </fieldset>
          )}

          {step === 5 && (
            <fieldset>
              <legend>When are you considering the work?</legend>
              <p>A rough window helps with the next conversation. Optional photos of the slab, oil, cracks, or stairs save a second text thread.</p>
              <div className="choice-grid">
                {[['as-soon-as-possible', 'As soon as possible'], ['1-3-months', 'Within 1–3 months'], ['3-6-months', 'Within 3–6 months'], ['researching', 'I am researching']].map(([value, label]) => <label key={value}><input type="radio" name="timeline" value={value} checked={request.timeline === value} onChange={() => update('timeline', value as QuoteRequest['timeline'])} />{label}</label>)}
              </div>
              <label>Anything Denis should know?<textarea value={request.notes} onChange={(event) => update('notes', event.target.value)} rows={4} placeholder="Access, old coating, repairs, timing, or a finish you liked…" /></label>
              <label>Photos of the floor (optional, up to 6)
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!hydrated || request.photos.length >= 6} onChange={addPhotos} />
              </label>
              {photoNote && <p>{photoNote}</p>}
            </fieldset>
          )}

          {step === 6 && (
            <fieldset>
              <legend>How should Denis reach you?</legend>
              <label className="quote-honeypot" aria-hidden="true">
                Leave this field empty
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={request.website ?? ''}
                  onChange={(event) => update('website', event.target.value)}
                />
              </label>
              <div className="contact-fields">
                <label>Name<input value={request.name} onChange={(event) => update('name', event.target.value)} autoComplete="name" required /></label>
                <label>Email<input type="email" value={request.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" required /></label>
                <label>Phone<input type="tel" value={request.phone} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" required /></label>
              </div>
              <div className="choice-grid compact">
                {[['phone', 'Phone call'], ['email', 'Email'], ['text', 'Text message']].map(([value, label]) => <label key={value}><input type="radio" name="contactPreference" value={value} checked={request.contactPreference === value} onChange={() => update('contactPreference', value as QuoteRequest['contactPreference'])} />{label}</label>)}
              </div>
              <label className="consent-row"><input type="checkbox" checked={request.consent} onChange={(event) => update('consent', event.target.checked)} />I agree Final Finish may contact me about this request.</label>
            </fieldset>
          )}
        </motion.div>
      </AnimatePresence>

      {status === 'error' && <p className="form-error" role="alert">The request could not be sent. Please try again or call Denis at (780) 991-1651.</p>}

      <div className="quote-actions">
        {step > 1 && <button className="back-button" type="button" onClick={() => setStep((current) => current - 1)}>Back</button>}
        {step < 6 ? (
          <button type="button" disabled={!hydrated || !canContinue} onClick={() => setStep((current) => current + 1)}>
            {step === 1 ? 'Continue to space type' : step === 2 ? 'Continue to size and condition' : step === 3 ? 'Continue to finish' : step === 4 ? 'Continue to timing' : 'Continue to contact details'}
          </button>
        ) : (
          <button type="submit" disabled={!hydrated || status === 'sending' || !request.consent || request.name.length < 2 || !request.email || request.phone.length < 7}>{status === 'sending' ? 'Sending…' : 'Send quote request'}</button>
        )}
      </div>
    </form>
  );
}
