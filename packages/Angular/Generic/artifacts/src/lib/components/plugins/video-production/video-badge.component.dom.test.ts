import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MJVideoBadgeComponent } from './video-badge.component';
import {
  GetVideoStatusBadgeVariant,
  type VideoBadgeVariant,
} from './video-status-badge';

@Component({
  standalone: true,
  imports: [MJVideoBadgeComponent],
  template: `
    <mj-video-badge [Variant]="Variant" [Icon]="Icon">{{ Label }}</mj-video-badge>
  `,
})
class BadgeHostComponent {
  @Input() Variant: VideoBadgeVariant = 'success';
  @Input() Icon: string | null = 'fa-solid fa-circle-check';
  @Input() Label = 'Delivered';
}

describe('MJVideoBadgeComponent (DOM)', () => {
  it('renders the variant modifier class, optional icon, and projected label text', () => {
    TestBed.configureTestingModule({ imports: [BadgeHostComponent] });
    const fixture = TestBed.createComponent(BadgeHostComponent);
    fixture.detectChanges();

    const pill = fixture.nativeElement.querySelector('.vp-video-badge') as HTMLElement | null;
    expect(pill).toBeTruthy();
    expect(pill?.classList.contains('vp-video-badge--success')).toBe(true);

    const icon = pill?.querySelector('.vp-video-badge__icon') as HTMLElement | null;
    expect(icon?.className).toContain('fa-circle-check');

    const label = pill?.querySelector('.vp-video-badge__label') as HTMLElement | null;
    expect(label?.textContent?.trim()).toBe('Delivered');
  });

  it('omits the icon element when Icon is null and updates variant classes across all variants', () => {
    TestBed.configureTestingModule({ imports: [BadgeHostComponent] });
    const fixture = TestBed.createComponent(BadgeHostComponent);
    fixture.componentRef.setInput('Icon', null);

    const variants: VideoBadgeVariant[] = ['success', 'info', 'warning', 'error', 'neutral'];
    for (const v of variants) {
      fixture.componentRef.setInput('Variant', v);
      fixture.componentRef.setInput('Label', `Status ${v}`);
      fixture.detectChanges();

      const pill = fixture.nativeElement.querySelector('.vp-video-badge') as HTMLElement | null;
      expect(pill?.classList.contains(`vp-video-badge--${v}`)).toBe(true);
      expect(pill?.querySelector('.vp-video-badge__icon')).toBeNull();
      expect(pill?.querySelector('.vp-video-badge__label')?.textContent?.trim()).toBe(
        `Status ${v}`,
      );
    }
  });

  it('maps production status values to the expected VideoBadgeVariant via GetVideoStatusBadgeVariant', () => {
    expect(GetVideoStatusBadgeVariant('Delivered')).toBe('success');
    expect(GetVideoStatusBadgeVariant('Complete')).toBe('success');
    expect(GetVideoStatusBadgeVariant('Approved')).toBe('success');
    expect(GetVideoStatusBadgeVariant('Passed')).toBe('success');
    expect(GetVideoStatusBadgeVariant('Fixed')).toBe('success');
    expect(GetVideoStatusBadgeVariant('Active')).toBe('success');
    expect(GetVideoStatusBadgeVariant('Briefing')).toBe('info');
    expect(GetVideoStatusBadgeVariant('Storyboarded')).toBe('info');
    expect(GetVideoStatusBadgeVariant('Rendering')).toBe('info');
    expect(GetVideoStatusBadgeVariant('Pending')).toBe('warning');
    expect(GetVideoStatusBadgeVariant('Major')).toBe('warning');
    expect(GetVideoStatusBadgeVariant('Warning')).toBe('warning');
    expect(GetVideoStatusBadgeVariant('Blocked')).toBe('error');
    expect(GetVideoStatusBadgeVariant('Failed')).toBe('error');
    expect(GetVideoStatusBadgeVariant('Blocker')).toBe('error');
    expect(GetVideoStatusBadgeVariant('Draft')).toBe('neutral');
    expect(GetVideoStatusBadgeVariant('Minor')).toBe('neutral');
    expect(GetVideoStatusBadgeVariant(undefined)).toBe('neutral');
  });
});
