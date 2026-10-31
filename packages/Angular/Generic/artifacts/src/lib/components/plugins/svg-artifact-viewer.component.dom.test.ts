import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { SvgArtifactViewerComponent } from './svg-artifact-viewer.component';

describe('SvgArtifactViewerComponent (DOM)', () => {
    it("keeps an artifact's own <style> inside the preview, so it cannot hide the page", () => {
        const f = renderComponentFixture(SvgArtifactViewerComponent, {
            imports: [CommonModule],
            declarations: [SvgArtifactViewerComponent],
            inputs: { artifactVersion: { Content: '<svg xmlns="http://www.w3.org/2000/svg"><style>body{display:none}</style><circle r="4"/></svg>' } },
        });
        const root = f.nativeElement as HTMLElement;
        const pageStyles = [...document.querySelectorAll('style'), ...root.querySelectorAll('style')].map((el) => el.textContent);
        expect(pageStyles.join('')).not.toContain('body{display:none}');
        const preview = root.querySelector<HTMLElement>('.svg-preview')!;
        expect(preview.firstElementChild?.shadowRoot?.querySelector('svg circle')).not.toBeNull();
    });
});
