import { ChartAnchor } from './geometry.types';
import { PointerKind } from './interaction';

/** Event position relative to the element the listener is on (the chart's <svg>). */
export function LocalPoint(event: MouseEvent): ChartAnchor {
    const target = event.currentTarget instanceof Element ? event.currentTarget : null;
    const rect = target?.getBoundingClientRect();
    return { X: event.clientX - (rect?.left ?? 0), Y: event.clientY - (rect?.top ?? 0) };
}

export function PointerKindOf(event: MouseEvent): PointerKind {
    const kind = 'pointerType' in event ? event.pointerType : '';
    return kind === 'touch' || kind === 'pen' ? kind : 'mouse';
}
