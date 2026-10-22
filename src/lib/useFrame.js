import { useEffect, useRef } from 'react';

/** Ejecuta cb(now) en cada frame de animación mientras el componente esté montado. */
export function useFrame(cb) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let id;
    const loop = (t) => {
      ref.current(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

/** Canvas con resolución retina, devuelve [ref, sizeRef]. */
export function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
