import { ElementRef, Renderer2 } from '@angular/core';
import { EntityField } from '@memberjunction/core';

export abstract class BaseLink {
    protected CreateLink(el: ElementRef, field: EntityField, renderer: Renderer2, href: string, newTab: boolean = false) {
        const parent = el.nativeElement.parentNode;
        const a = renderer.createElement('a');
        if (href !== null && href !== undefined && href.length > 0) 
            renderer.setAttribute(a, 'href',  href);
        if (newTab)
            renderer.setAttribute(a, 'target', '_blank');
        renderer.insertBefore(parent, a, el.nativeElement);
        renderer.addClass(a, 'link-text');
//        renderer.setStyle(a, 'font-size', '14px');
        renderer.appendChild(a, el.nativeElement);
    }
}
