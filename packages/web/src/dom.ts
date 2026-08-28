export function panel(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `panel ${className}`;
  document.body.appendChild(el);
  return el;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${String(s)} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${String(m)} min`;
  const h = Math.round(m / 60);
  return `${String(h)} h`;
}
