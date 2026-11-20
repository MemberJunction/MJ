import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MJSurfaceBodyDirective,
  MJSurfaceComponent,
  MJSurfaceFooterDirective,
  MJSurfaceHeaderDirective,
} from './surface.component';

@Component({
  standalone: true,
  imports: [
    MJSurfaceComponent,
    MJSurfaceHeaderDirective,
    MJSurfaceBodyDirective,
    MJSurfaceFooterDirective,
  ],
  template: `
    <mj-surface
      [Level]="level()"
      [Elevation]="elevation()"
      [Interactive]="interactive()"
      [Selected]="selected()"
      [Tone]="tone()"
      [VisualRole]="role()"
    >
      <div mjSurfaceHeader>Header</div>
      <div mjSurfaceBody>Body content</div>
      <div mjSurfaceFooter>Footer</div>
    </mj-surface>
  `,
})
class SurfaceHostComponent {
  public readonly level = signal('elevated');
  public readonly elevation = signal('md');
  public readonly interactive = signal(true);
  public readonly selected = signal(false);
  public readonly tone = signal('plum');
  public readonly role = signal('callout');
}

describe('MJSurfaceComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SurfaceHostComponent],
    }).compileComponents();
  });

  it('binds PascalCase inputs, .is-selected state class, and --mj-visual-role-* / --mj-tone-* variables', async () => {
    const fixture = TestBed.createComponent(SurfaceHostComponent);
    fixture.detectChanges();

    const surface = fixture.nativeElement.querySelector('mj-surface') as HTMLElement;
    expect(surface.classList.contains('mj-surface')).toBe(true);
    expect(surface.classList.contains('mj-surface-elevated')).toBe(true);
    expect(surface.classList.contains('mj-surface-interactive')).toBe(true);
    expect(surface.classList.contains('is-selected')).toBe(false);
    expect(surface.hasAttribute('data-selected')).toBe(false);
    expect(surface.style.getPropertyValue('--_mj-tone-text')).toContain('--mj-tone-plum-text');
    expect(surface.style.getPropertyValue('--_mj-visual-role-bg')).toContain(
      '--mj-visual-role-callout-bg'
    );
    expect(surface.style.getPropertyValue('--_mj-surface-elevation-shadow')).toBe(
      'var(--mj-shadow-md)'
    );

    fixture.componentInstance.selected.set(true);
    fixture.detectChanges();
    expect(surface.classList.contains('is-selected')).toBe(true);

    // Sunken surfaces ignore interactive and selected state classes
    fixture.componentInstance.level.set('sunken');
    fixture.detectChanges();
    expect(surface.classList.contains('mj-surface-sunken')).toBe(true);
    expect(surface.classList.contains('is-selected')).toBe(false);
    expect(surface.classList.contains('mj-surface-interactive')).toBe(false);

    // Custom open-axis Level maps to --mj-surface-<level>-*
    fixture.componentInstance.level.set('glass');
    fixture.detectChanges();
    expect(surface.classList.contains('mj-surface-glass')).toBe(true);
    expect(surface.style.getPropertyValue('--_mj-surface-level-bg')).toContain(
      '--mj-surface-glass-bg'
    );

    // Malformed axis names fall back cleanly to defaults instead of emitting invalid CSS var() syntax
    fixture.componentInstance.tone.set('bad value!');
    fixture.detectChanges();
    expect(surface.style.getPropertyValue('--_mj-tone-text')).toBe('');

    await ExpectNoAxeViolations(fixture);
  });
});
