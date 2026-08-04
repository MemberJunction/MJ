import { describe, it, expect } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJFilterFieldComponent } from './filter-field.component';

/** DOM-level spec for <mj-filter-field> — label text + conditional icon. */
describe('MJFilterFieldComponent (DOM)', () => {
  it('renders the Label text', () => {
    const f = renderComponentFixture(MJFilterFieldComponent, { inputs: { Label: 'Category' } });
    expect(f.nativeElement.querySelector('.mj-filter-field-label')?.textContent?.trim()).toContain('Category');
  });

  it('renders an icon when Icon is set, and none when it is null', () => {
    const withIcon = renderComponentFixture(MJFilterFieldComponent, { inputs: { Icon: 'fa-solid fa-folder' } });
    expect(withIcon.nativeElement.querySelector('.mj-filter-field-label i')).not.toBeNull();

    const noIcon = renderComponentFixture(MJFilterFieldComponent);
    expect(noIcon.nativeElement.querySelector('.mj-filter-field-label i')).toBeNull();
  });
});
