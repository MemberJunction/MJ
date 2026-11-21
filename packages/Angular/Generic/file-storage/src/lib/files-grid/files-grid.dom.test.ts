import { describe, it, expect } from 'vitest';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { FilesGridComponent } from './files-grid';

/**
 * The AG Grid action cell renderer hand-builds <button> elements, so the mjButton
 * directive cannot style them. The class string must therefore use only classes
 * the canonical button stylesheet defines (BEM `mj-btn--*`). Issue #4845: it used
 * to emit `mj-btn-flat mj-btn-sm`, where `mj-btn-flat` existed nowhere and
 * `mj-btn-sm` only in a legacy block that is being removed. The component's own
 * stylesheet cannot reach these elements either (emulated encapsulation never tags
 * imperatively created nodes), so the canonical classes are the whole contract.
 */
function createGrid(): FilesGridComponent {
  return new FilesGridComponent(new MJNotificationService());
}

describe('FilesGridComponent action buttons', () => {
  it('is styled by the canonical flat/small mjButton classes and nothing else', () => {
    const btn = createGrid()['createActionButton']('fa-download', false);
    expect(btn.className).toBe('mj-btn mj-btn--flat mj-btn--sm');
  });

  it('wires the disabled flag and the Font Awesome icon', () => {
    const btn = createGrid()['createActionButton']('fa-trash', true);
    expect(btn.disabled).toBe(true);
    expect(btn.querySelector('span')?.className).toBe('fa-solid fa-trash');
  });
});
