/** Small inline icons. Decorative unless given a title. */
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export const IconSun = () => (
  <svg {...base}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const IconMoon = () => (
  <svg {...base}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);
export const IconStack = () => (
  <svg {...base}><rect x="3" y="7" width="14" height="13" rx="2" /><path d="M7 3h12a2 2 0 0 1 2 2v12" /></svg>
);
export const IconChevronLeft = () => (
  <svg {...base}><path d="M15 18l-6-6 6-6" /></svg>
);
export const IconChevronRight = () => (
  <svg {...base}><path d="M9 18l6-6-6-6" /></svg>
);
export const IconShuffle = () => (
  <svg {...base}><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
);
export const IconRotate = () => (
  <svg {...base}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
);
export const IconUndo = () => (
  <svg {...base}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
);
export const IconClose = () => (
  <svg {...base}><path d="M18 6L6 18M6 6l12 12" /></svg>
);
export const IconTrash = () => (
  <svg {...base}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
);
export const IconCheck = () => (
  <svg {...base}><path d="M20 6L9 17l-5-5" /></svg>
);
export const IconX = () => (
  <svg {...base}><path d="M18 6L6 18M6 6l12 12" /></svg>
);
export const IconWarning = () => (
  <svg {...base}><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
);
