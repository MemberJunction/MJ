import { ChartAnchor } from './geometry.types';
import { PointerKind } from './interaction';

/**
 * Event position relative to the element the listener is on (the chart's <svg>), in the element's
 * layout px, the space the geometry is computed in. getBoundingClientRect includes ancestor
 * transforms (a dialog scaling in from 0.95) while clientWidth/clientHeight do not, so their ratio
 * undoes the transform. An element with no layout size (jsdom, display:none) is taken as unscaled.
 */
export function LocalPoint(event: MouseEvent): ChartAnchor {
    const target = event.currentTarget instanceof Element ? event.currentTarget : null;
    if (target === null) {
        return { X: event.clientX, Y: event.clientY };
    }
    const rect = target.getBoundingClientRect();
    const scaleX = target.clientWidth > 0 && rect.width > 0 ? rect.width / target.clientWidth : 1;
    const scaleY = target.clientHeight > 0 && rect.height > 0 ? rect.height / target.clientHeight : 1;
    return { X: (event.clientX - rect.left) / scaleX, Y: (event.clientY - rect.top) / scaleY };
}

export function PointerKindOf(event: MouseEvent): PointerKind {
    const kind = 'pointerType' in event ? event.pointerType : '';
    return kind === 'touch' || kind === 'pen' ? kind : 'mouse';
}
