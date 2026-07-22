/** Tiny SVG element factory shared by all flow renderers. */
const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl(
  tag: string,
  attrs: Record<string, string | number>,
  parent?: SVGElement
): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) {
    if (k === 'text') e.textContent = String(attrs[k]);
    else e.setAttribute(k, String(attrs[k]));
  }
  if (parent) parent.appendChild(e);
  return e;
}

/** Truncate a label to fit, with an ellipsis. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Append an icon centered in a `size`×`size` box at (x,y): an agent logo `<image>`
 * when `logoUrl` is set, otherwise a Font Awesome glyph via `<foreignObject>` (FA's
 * global stylesheet renders it; we just set colour + size).
 */
export function appendIcon(
  parent: SVGElement, x: number, y: number, size: number,
  iconClass: string, logoUrl: string | null, color: string
): SVGElement {
  if (logoUrl) {
    const img = svgEl('image', { x, y, width: size, height: size, preserveAspectRatio: 'xMidYMid slice' }, parent);
    img.setAttribute('href', logoUrl);
    img.setAttribute('clip-path', `inset(0 round ${size / 2}px)`);
    return img;
  }
  const fo = svgEl('foreignObject', { x, y, width: size, height: size }, parent);
  const div = document.createElementNS(XHTML_NS, 'div');
  div.setAttribute('style', `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;color:${color}`);
  const i = document.createElementNS(XHTML_NS, 'i');
  i.setAttribute('class', `fa-solid ${iconClass}`);
  i.setAttribute('style', `font-size:${Math.round(size * 0.82)}px;line-height:1`);
  div.appendChild(i);
  fo.appendChild(div);
  return fo;
}

/** Native hover tooltip on an SVG element (works without any JS). */
export function appendTitle(parent: SVGElement, text: string): void {
  svgEl('title', { text }, parent);
}
