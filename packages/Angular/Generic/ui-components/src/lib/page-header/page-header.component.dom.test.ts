import { describe, it, expect } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJPageHeaderComponent } from './page-header.component';

/** DOM-level spec for <mj-page-header> — title text, conditional icon + subtitle. */
describe('MJPageHeaderComponent (DOM)', () => {
  it('renders the Title in the heading', () => {
    const f = renderComponentFixture(MJPageHeaderComponent, { inputs: { Title: 'Agents' } });
    expect(f.nativeElement.querySelector('.mj-page-header-title')?.textContent?.trim()).toBe('Agents');
  });

  it('renders an icon when Icon is set, and none when it is null', () => {
    const withIcon = renderComponentFixture(MJPageHeaderComponent, { inputs: { Title: 'X', Icon: 'fa-solid fa-robot' } });
    expect(withIcon.nativeElement.querySelector('.mj-page-header-icon')).not.toBeNull();

    const noIcon = renderComponentFixture(MJPageHeaderComponent, { inputs: { Title: 'X' } });
    expect(noIcon.nativeElement.querySelector('.mj-page-header-icon')).toBeNull();
  });

  it('renders the Subtitle when set, and none when it is null', () => {
    const withSub = renderComponentFixture(MJPageHeaderComponent, { inputs: { Title: 'X', Subtitle: 'sub' } });
    expect(withSub.nativeElement.querySelector('.mj-page-header-subtitle')?.textContent?.trim()).toBe('sub');

    const noSub = renderComponentFixture(MJPageHeaderComponent, { inputs: { Title: 'X' } });
    expect(noSub.nativeElement.querySelector('.mj-page-header-subtitle')).toBeNull();
  });
});
