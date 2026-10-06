import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
    MJCardGridComponent,
    MJCardComponent,
    MJCardTitleDirective,
    MJCardActionsDirective,
    MJCardToolsDirective,
    MJCardFooterDirective,
} from './card-grid.component';

@Component({
    standalone: true,
    imports: [
        MJCardGridComponent,
        MJCardComponent,
        MJCardTitleDirective,
        MJCardActionsDirective,
        MJCardToolsDirective,
        MJCardFooterDirective,
    ],
    template: `
        <mj-card-grid [(MaximizedCardId)]="maximizedCard">
            <mj-card CardId="card-1" Title="Card One" Icon="fa-solid fa-chart-line" [AllowMaximize]="true">
                <p id="body-1">Content of Card One</p>
            </mj-card>
            <mj-card CardId="card-2" Title="Card Two" [AllowMaximize]="true">
                <ng-template mjCardActions>
                    <button id="btn-custom">Action</button>
                </ng-template>
                <p id="body-2">Content of Card Two</p>
                <ng-template mjCardFooter>
                    <span id="footer-2">Footer Two</span>
                </ng-template>
            </mj-card>
        </mj-card-grid>
    `,
})
class TestHostComponent {
    public maximizedCard: string | null = null;
}

describe('MJCardGridComponent & MJCardComponent DOM Tests', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let host: TestHostComponent;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TestHostComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(TestHostComponent);
        host = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('renders cards and their projected body content', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        expect(compiled.querySelector('#body-1')?.textContent).toContain('Content of Card One');
        expect(compiled.querySelector('#body-2')?.textContent).toContain('Content of Card Two');
        expect(compiled.querySelector('.mj-card__title')?.textContent).toContain('Card One');
    });

    it('renders custom actions and footer templates', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        expect(compiled.querySelector('#btn-custom')).not.toBeNull();
        expect(compiled.querySelector('#footer-2')?.textContent).toContain('Footer Two');
    });

    it('maximizes a card on toggle button click and hides siblings', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const toggleButtons = compiled.querySelectorAll<HTMLButtonElement>('.mj-card__toggle-btn');
        expect(toggleButtons.length).toBe(2);

        // Click maximize on Card 1
        toggleButtons[0].click();
        fixture.detectChanges();

        expect(host.maximizedCard).toBe('card-1');
        const cards = compiled.querySelectorAll('.mj-card');
        expect(cards[0].classList.contains('mj-card--maximized')).toBe(true);
        expect(cards[1].classList.contains('mj-card--hidden')).toBe(true);

        // Click restore on Card 1
        const restoreButton = compiled.querySelector<HTMLButtonElement>('.mj-card--maximized .mj-card__toggle-btn');
        restoreButton?.click();
        fixture.detectChanges();

        expect(host.maximizedCard).toBeNull();
        expect(cards[0].classList.contains('mj-card--maximized')).toBe(false);
        expect(cards[1].classList.contains('mj-card--hidden')).toBe(false);
    });

    it('restores on Escape key', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const toggleButtons = compiled.querySelectorAll<HTMLButtonElement>('.mj-card__toggle-btn');
        toggleButtons[1].click();
        fixture.detectChanges();

        expect(host.maximizedCard).toBe('card-2');
        const cards = compiled.querySelectorAll('.mj-card');
        expect(cards[1].classList.contains('mj-card--maximized')).toBe(true);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        fixture.detectChanges();

        expect(host.maximizedCard).toBeNull();
        expect(cards[1].classList.contains('mj-card--maximized')).toBe(false);
    });
});
