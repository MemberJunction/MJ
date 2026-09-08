import { ElementRef } from '@angular/core';

/**
 * Is `child` inside `parent` in the DOM tree?
 *
 * A pure DOM predicate with no MJ, Explorer or routing coupling — which is why it lives here in a
 * Generic package rather than on `SharedService`. It was previously reachable only as
 * `SharedService.IsDescendant`, which meant a widget wanting this three-line tree walk had to take
 * a dependency on MJ Explorer to get it. That is exactly the accidental coupling the UI layering
 * rules exist to prevent (see `guides/UI_LAYERING_GUIDE.md`).
 *
 * `SharedService.IsDescendant` delegates here, so existing Explorer callers are unaffected.
 *
 * @param parent the candidate ancestor
 * @param child the candidate descendant
 * @returns true when `child` is a descendant of `parent`; false when either is missing or unrelated
 */
export function IsDescendantElement(parent: ElementRef | null | undefined, child: ElementRef | null | undefined): boolean {
    if (!parent?.nativeElement || !child?.nativeElement) return false;
    let node = child.nativeElement.parentNode;
    while (node != null) {
        if (node === parent.nativeElement) return true;
        node = node.parentNode;
    }
    return false;
}
