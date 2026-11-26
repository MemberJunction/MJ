import { describe, it, expect } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MjAvatarPickerTriggerComponent } from './avatar-picker-trigger.component';

describe('MjAvatarPickerTriggerComponent (DOM)', () => {
  it('renders icon fallback, accent styling, badge, and emits TriggerClick when clicked', () => {
    const clicks: number[] = [];
    const fixture = renderComponentFixture(MjAvatarPickerTriggerComponent, {
      inputs: {
        IconClass: 'fa-solid fa-rocket',
        AccentColor: '#0D9488',
        AltText: 'Launch Space',
        BadgeLabel: 'Customize',
        BadgeIconClass: 'fa-solid fa-sparkles',
        Size: 64,
        Title: 'Customize avatar',
      },
    });
    fixture.componentInstance.TriggerClick.subscribe(() => clicks.push(1));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('.mjas-trigger') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('title')).toBe('Customize avatar');
    expect(btn.style.width).toBe('64px');
    expect(btn.style.height).toBe('64px');
    expect(el.querySelector('i.fa-rocket')).not.toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.mjas-trigger-badge')?.textContent).toContain('Customize');

    btn.click();
    expect(clicks).toHaveLength(1);
  });

  it('renders image preview when ImageUrl is set and falls back to icon if the image fails to load', () => {
    const fixture = renderComponentFixture(MjAvatarPickerTriggerComponent, {
      inputs: {
        ImageUrl: 'data:image/webp;base64,YWJj',
        IconClass: 'fa-solid fa-brain',
        AltText: 'Agent Avatar',
      },
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('data:image/webp;base64,YWJj');
    expect(img!.getAttribute('alt')).toBe('Agent Avatar');

    // Simulate image load error -> falls back to IconClass
    img!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('i.fa-brain')).not.toBeNull();
  });

  it('applies open/rounded classes, aria-expanded, and suppresses TriggerClick when Disabled', () => {
    const clicks: number[] = [];
    const fixture = renderComponentFixture(MjAvatarPickerTriggerComponent, {
      inputs: {
        Shape: 'rounded',
        IsOpen: true,
        Disabled: true,
        BadgeLabel: '',
      },
    });
    fixture.componentInstance.TriggerClick.subscribe(() => clicks.push(1));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('.mjas-trigger') as HTMLButtonElement;
    expect(btn.classList.contains('mjas-trigger--open')).toBe(true);
    expect(btn.classList.contains('mjas-trigger--rounded')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.disabled).toBe(true);
    expect(el.querySelector('.mjas-trigger-badge')).toBeNull();

    // Direct call and DOM click both honor Disabled
    btn.click();
    fixture.componentInstance.OnClick();
    expect(clicks).toHaveLength(0);
  });
});
