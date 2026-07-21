import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { query } from '@memberjunction/ng-test-utils';
import { CommandPaletteComponent } from './command-palette.component';
import { CommandPaletteService } from './command-palette.service';
import { ApplicationManager } from '@memberjunction/ng-base-application';

/**
 * DOM coverage for <mj-command-palette> — a modal palette gated on `CommandPaletteService.IsOpen`.
 * It reads `appManager.AllApplications` and calls `service.Close()`; both are faked. `IsOpen` is a
 * BehaviorSubject we control. `detectChanges(false)`+`markForCheck` because the IsOpen subscription
 * flips the `@if (IsOpen)` overlay via plain-property mutation, and the search box uses ngModel.
 */

function render(open: boolean): { fixture: ComponentFixture<CommandPaletteComponent>; close: ReturnType<typeof vi.fn> } {
  const isOpen$ = new BehaviorSubject<boolean>(open);
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [FormsModule],
    declarations: [CommandPaletteComponent],
    providers: [
      { provide: CommandPaletteService, useValue: { IsOpen: isOpen$, Close: close } },
      // AllApplications is an Observable (the component .pipe()s it), not a plain array.
      { provide: ApplicationManager, useValue: { AllApplications: new BehaviorSubject([]) } },
    ],
  });
  const fixture = TestBed.createComponent(CommandPaletteComponent);
  fixture.detectChanges(false);
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return { fixture, close };
}

describe('CommandPaletteComponent (DOM)', () => {
  it('renders nothing when the palette is closed', () => {
    const { fixture } = render(false);
    expect(query(fixture, '.command-palette-modal')).toBeNull();
    expect(query(fixture, '.command-palette-backdrop')).toBeNull();
  });

  it('renders the modal with a search input when open', () => {
    const { fixture } = render(true);
    expect(query(fixture, '.command-palette-modal')).not.toBeNull();
    expect(query(fixture, 'input.search-input')).not.toBeNull();
  });

  it('closes via the service when the backdrop is clicked', () => {
    const { fixture, close } = render(true);
    (query(fixture, '.command-palette-backdrop') as HTMLElement).click();
    expect(close).toHaveBeenCalled();
  });
});
