const s = { fill: 'currentColor' };

export const Play = (p) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path {...s} d="M4 2.5v11l9-5.5z" /></svg>
);
export const Pause = (p) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path {...s} d="M4 2.5h3v11H4zM9 2.5h3v11H9z" /></svg>
);
export const Prev = (p) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path {...s} d="M3 2.5h2v11H3zM13 2.5v11L6 8z" /></svg>
);
export const Eject = (p) => (
  <svg viewBox="0 0 16 16" width="12" height="12" {...p}><path {...s} d="M8 3l5 6H3zM3 11h10v2H3z" /></svg>
);
export const Note = (p) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path {...s} d="M11 1.5v9.2a2.3 2.3 0 1 1-1.4-2.1V4.3L6 5.3v6.4a2.3 2.3 0 1 1-1.4-2.1V3.4z" /></svg>
);
export const Pencil = (p) => (
  <svg viewBox="0 0 16 16" width="13" height="13" {...p}><path {...s} d="M11.5 1.8l2.7 2.7-8.6 8.6H2.9v-2.7zM10.4 2.9l2.7 2.7" /></svg>
);
export const Grid = (p) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path {...s} d="M2 2h12v2H2zM2 6h2v8H2zM6 6h2v8H6zM10 6h2v8h-2zM13 6h1v8h-1z" /></svg>
);
export const Gear = (p) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path {...s} d="M7 1h2l.4 1.9 1.3.6 1.7-1 1.4 1.4-1 1.7.6 1.3L15 7v2l-1.9.4-.6 1.3 1 1.7-1.4 1.4-1.7-1-1.3.6L9 15H7l-.4-1.9-1.3-.6-1.7 1-1.4-1.4 1-1.7-.6-1.3L1 9V7l1.9-.4.6-1.3-1-1.7 1.4-1.4 1.7 1 1.3-.6zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" /></svg>
);
export const Search = (p) => (
  <svg viewBox="0 0 16 16" width="12" height="12" {...p}><path {...s} d="M6.5 1a5.5 5.5 0 0 1 4.4 8.8l3.9 3.9-1.1 1.1-3.9-3.9A5.5 5.5 0 1 1 6.5 1zm0 1.6a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8z" /></svg>
);
export const Close = (p) => (
  <svg viewBox="0 0 16 16" width="10" height="10" {...p}><path {...s} d="M3 2l5 5 5-5 1 1-5 5 5 5-1 1-5-5-5 5-1-1 5-5-5-5z" /></svg>
);
export const Sync = (p) => (
  <svg viewBox="0 0 16 16" width="16" height="16" {...p}><path {...s} d="M8 2a6 6 0 0 1 5.8 4.5h-1.6A4.5 4.5 0 0 0 4.3 5.3L6 7H1.5V2.5L3.2 4.2A6 6 0 0 1 8 2zM2.2 9.5h1.6a4.5 4.5 0 0 0 7.9 1.2L10 9h4.5v4.5l-1.7-1.7A6 6 0 0 1 2.2 9.5z" /></svg>
);
export const User = (p) => (
  <svg viewBox="0 0 16 16" width="18" height="18" {...p}><path {...s} d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3.8 12.2A5.3 5.3 0 0 0 12.2 12.2C11.4 10.9 9.8 10 8 10s-3.4.9-4.2 2.2z" /></svg>
);
export const Crate = (p) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path fill="#C08A05" d="M2 4.5L8 2l6 2.5v7L8 14l-6-2.5z" /><path fill="#FFD60A" d="M2 4.5L8 7l6-2.5L8 2z" /><path fill="#8A6404" d="M8 7v7l6-2.5v-7z" /></svg>
);
export const AllIcon = (p) => (
  <svg viewBox="0 0 16 16" width="14" height="14" {...p}><path {...s} d="M8 1l1.4 4.3H14l-3.7 2.7 1.4 4.3L8 9.6l-3.7 2.7 1.4-4.3L2 5.3h4.6z" /></svg>
);
/**
 * Isotipo B2B, construido según el manual de marca:
 * retícula de 10 × 10, X = ancho de barra, 6 barras de extremos redondos,
 * separación 0.4X. DJ A (amarillo) crece desde abajo con alturas 3X · 5X · 7X;
 * DJ B (verde) cae desde arriba con 7X · 5X · 3X. Nunca se tocan.
 */
export const Isotipo = ({ size = 18, ...p }) => {
  const paso = 1.4;                       // ancho de barra + separación
  const abajo = [3, 5, 7];                // DJ A · desde abajo
  const arriba = [7, 5, 3];               // DJ B · desde arriba
  return (
    <svg viewBox="0 0 8 10" width={(size * 8) / 10} height={size} {...p}>
      {abajo.map((h, i) => (
        <rect key={`a${i}`} x={i * paso} y={10 - h} width="1" height={h} rx="0.5" fill="var(--deck-a, #FFD60A)" />
      ))}
      {arriba.map((h, i) => (
        <rect key={`b${i}`} x={(i + 3) * paso} y="0" width="1" height={h} rx="0.5" fill="var(--deck-b, #1FD07F)" />
      ))}
    </svg>
  );
};
export const ListView = (p) => (
  <svg viewBox="0 0 20 14" width="20" height="14" {...p}><path {...s} d="M0 1h20v1.4H0zM0 4.5h20v1.4H0zM0 8h20v1.4H0zM0 11.5h20v1.4H0z" /></svg>
);
export const ArtView = (p) => (
  <svg viewBox="0 0 20 14" width="20" height="14" {...p}><path {...s} d="M0 0h5v4H0zM7 1h13v2H7zM0 5h5v4H0zM7 6h13v2H7zM0 10h5v4H0zM7 11h13v2H7z" /></svg>
);
