import { useEffect, useRef, useState } from 'react';

function createShopTone(context: AudioContext) {
  const noise = context.createBufferSource();
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.22;
  noise.buffer = buffer;
  noise.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 280;
  const gain = context.createGain();
  gain.gain.value = 0.045;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  return { noise, gain };
}

export function ShopSound() {
  const [on, setOn] = useState(false);
  const engine = useRef<{ context: AudioContext; noise: AudioBufferSourceNode } | null>(null);

  useEffect(() => () => {
    engine.current?.noise.stop();
    void engine.current?.context.close();
  }, []);

  const toggle = async () => {
    if (on) {
      engine.current?.noise.stop();
      void engine.current?.context.close();
      engine.current = null;
      setOn(false);
      return;
    }
    const context = new AudioContext();
    const { noise } = createShopTone(context);
    noise.start();
    engine.current = { context, noise };
    setOn(true);
  };

  return (
    <button type="button" className={`shop-sound ${on ? 'is-on' : ''}`} onClick={() => void toggle()} aria-pressed={on}>
      {on ? 'Sound on' : 'Shop tone'}
    </button>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      className={className}
      src="/images/brand/final-finish-epoxy-mark.png"
      alt=""
      width={67}
      height={52}
    />
  );
}

export default function SiteChrome() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const root = document.documentElement;
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      root.style.setProperty('--spec-x', `${(event.clientX / window.innerWidth) * 100}%`);
      root.style.setProperty('--spec-y', `${(event.clientY / window.innerHeight) * 100}%`);
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    return () => window.removeEventListener('pointermove', onPointer);
  }, []);

  return <ShopSound />;
}
