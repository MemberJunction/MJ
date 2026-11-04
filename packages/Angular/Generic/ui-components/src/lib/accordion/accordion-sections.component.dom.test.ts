import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MJAccordionModule, MJAccordionPanelComponent } from './accordion.component';
import { MJAccordionSectionsComponent } from './accordion-sections.component';
import { MJSectionPickerComponent } from '../section-picker/section-picker.component';

/**
 * DOM spec for `<mj-accordion-sections>`: the phone presentation of a stack of accordions.
 * Disabled, it is invisible and the panels behave as accordions. Enabled, it puts an
 * `mj-section-picker` above them, shows one top-level panel at a time with its chrome gone
 * ("section"), and renders any panel nested inside it as a plain headed block ("block").
 * Opening a panel this way emits ExpandedChange(true), as a click would, so panels that load
 * their data on first expand still load.
 */
@Component({
    standalone: true,
    imports: [MJAccordionSectionsComponent, MJAccordionModule],
    template: `
    <mj-accordion-sections [Enabled]="Enabled" [ActiveKey]="Active" (ActiveKeyChange)="Active = $event">
      <mj-accordion-panel class="p-input" SectionKey="input" SectionTitle="Input" SectionIcon="fa-solid fa-comment"
                          [Expanded]="true" (ExpandedChange)="Log.push('input:' + $event)">
        <ng-template mjAccordionTitle>Input <span class="badge">JSON</span></ng-template>
        <mj-accordion-panel class="p-messages" Title="Messages" (ExpandedChange)="Log.push('messages:' + $event)">
          <p class="msg">hello</p>
        </mj-accordion-panel>
      </mj-accordion-panel>
      @if (ShowResult) {
        <mj-accordion-panel class="p-result" SectionKey="result" Title="Result" [SectionCount]="3"
                            (ExpandedChange)="Log.push('result:' + $event)">
          <ng-template mjAccordionBody><p class="lazy">lazy result</p></ng-template>
        </mj-accordion-panel>
      }
      <mj-accordion-panel class="p-details" Title="Details"><p>details</p></mj-accordion-panel>
    </mj-accordion-sections>
  `,
})
class HostComponent {
    Enabled = false;
    Active: string | null = null;
    ShowResult = true;
    Log: string[] = [];
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('MJAccordionSectionsComponent (DOM)', () => {
    let fixture: ComponentFixture<HostComponent>;
    const host = () => fixture.componentInstance;
    const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;
    const hidden = (sel: string) => q(sel)!.classList.contains('mj-accordion-section-hidden');
    const picker = () => fixture.debugElement.query(By.directive(MJSectionPickerComponent))?.componentInstance as MJSectionPickerComponent | undefined;
    /** Zoneless: a plain field write on the host does not mark its view dirty, so mark it first. */
    const detect = () => { fixture.componentRef.changeDetectorRef.markForCheck(); fixture.detectChanges(); };
    const settle = async () => { detect(); await flush(); detect(); };
    const enable = async () => { host().Enabled = true; await settle(); };

    beforeEach(() => {
        fixture = TestBed.createComponent(HostComponent);
        fixture.detectChanges();
    });

    it('disabled, it renders no picker and leaves every panel a normal accordion', () => {
        expect(picker()).toBeUndefined();
        expect(q('.p-input > .mj-accordion-panel > .mj-accordion-header-row button.mj-accordion-header')).not.toBeNull();
        expect(hidden('.p-result')).toBe(false);
        expect(hidden('.p-details')).toBe(false);
    });

    it('enabled, it lists the top-level panels in the picker, including one inside @if, and not the nested one', async () => {
        await enable();
        expect(picker()!.Items.map((i) => [i.Key, i.Title, i.Icon ?? null, i.Count ?? null])).toEqual([
            ['input', 'Input', 'fa-solid fa-comment', null],
            ['result', 'Result', null, 3],
            ['section-2', 'Details', null, null],
        ]);
    });

    it('enabled, it shows only the active section, without its accordion chrome', async () => {
        await enable();
        expect(picker()!.ActiveKey).toBe('input');
        expect(hidden('.p-input')).toBe(false);
        expect(hidden('.p-result')).toBe(true);
        expect(hidden('.p-details')).toBe(true);
        const input = q('.p-input > .mj-accordion-panel')!;
        expect(input.classList.contains('mj-accordion-panel--flat-section')).toBe(true);
        expect(input.querySelector(':scope > .mj-accordion-header-row button.mj-accordion-header')).toBeNull();
        expect(input.querySelector(':scope > .mj-accordion-header-row .mj-accordion-chevron')).toBeNull();
    });

    it('renders a panel nested in the active section as an open, headed block', async () => {
        await enable();
        const nested = q('.p-messages > .mj-accordion-panel')!;
        expect(nested.classList.contains('mj-accordion-panel--flat-block')).toBe(true);
        expect(nested.querySelector('.mj-accordion-flat-heading')!.textContent!.trim()).toBe('Messages');
        expect(nested.querySelector('button.mj-accordion-header')).toBeNull();
        expect(nested.querySelector('.mj-accordion-body-outer')!.hasAttribute('inert')).toBe(false);
        expect(nested.classList.contains('mj-accordion-panel--expanded')).toBe(true);
        expect(host().Log).toContain('messages:true');
    });

    it('picking a section shows it, emits ActiveKeyChange, opens its lazy body and emits ExpandedChange(true)', async () => {
        await enable();
        picker()!.Select('result');
        await settle();
        expect(host().Active).toBe('result');
        expect(hidden('.p-result')).toBe(false);
        expect(hidden('.p-input')).toBe(true);
        expect(q('.p-result .lazy')?.textContent).toBe('lazy result');
        expect(host().Log).toContain('result:true');
    });

    it('drops a panel from the picker when its @if turns false', async () => {
        await enable();
        host().ShowResult = false;
        await settle();
        expect(picker()!.Items.map((i) => i.Key)).toEqual(['input', 'section-1']);
    });

    it('disabling again restores the accordions', async () => {
        await enable();
        host().Enabled = false;
        await settle();
        expect(picker()).toBeUndefined();
        expect(hidden('.p-result')).toBe(false);
        expect(q('.p-input > .mj-accordion-panel')!.classList.contains('mj-accordion-panel--flat-section')).toBe(false);
        expect(q('.p-messages > .mj-accordion-panel > .mj-accordion-header-row button.mj-accordion-header')).not.toBeNull();
    });
});

describe('MJAccordionPanelComponent Flat', () => {
    it('renders a Flat panel as an open, headed block with no toggle', () => {
        const f = TestBed.createComponent(MJAccordionPanelComponent);
        f.componentRef.setInput('Title', 'Raw');
        f.componentRef.setInput('Flat', true);
        f.detectChanges();
        const el = f.nativeElement as HTMLElement;
        expect(el.querySelector('.mj-accordion-flat-heading')!.textContent!.trim()).toBe('Raw');
        expect(el.querySelector('.mj-accordion-flat-heading')!.getAttribute('role')).toBe('heading');
        expect(el.querySelector('button.mj-accordion-header')).toBeNull();
        expect(el.querySelector('.mj-accordion-body-outer')!.hasAttribute('inert')).toBe(false);
    });
});
