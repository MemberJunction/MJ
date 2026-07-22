import { describe, it, expect } from 'vitest';
import { ReactiveFormsModule } from '@angular/forms';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { NewComponentDialogComponent } from './new-component-dialog.component';

/**
 * DOM coverage for <mj-new-component-dialog> — a Visible-gated create dialog with a reactive form
 * (required name), a type-card grid (SelectedType), and a Create button disabled until the form is
 * valid. Real ReactiveFormsModule + mj-dialog/mjButton; FormBuilder comes from ReactiveFormsModule.
 * Create is enabled by setting the form control; markForCheck + detectChanges(false) for zoneless.
 */

const render = (Visible = true) =>
  renderComponentFixture(NewComponentDialogComponent, {
    imports: [ReactiveFormsModule, MJDialogComponent, MJDialogActionsComponent, MJButtonDirective],
    declarations: [NewComponentDialogComponent],
    inputs: { Visible },
  });

const sync = (f: ReturnType<typeof render>) => { f.componentRef.changeDetectorRef.markForCheck(); f.detectChanges(false); };
const createBtn = (f: ReturnType<typeof render>) => queryAll(f, 'button').find((b) => b.textContent?.includes('Create')) as HTMLButtonElement;

describe('NewComponentDialogComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    expect(query(render(false), 'mj-dialog')).toBeNull();
  });

  it('renders the create dialog with a name input and a type card per option', () => {
    const fixture = render();
    expect(query(fixture, '#component-name')).not.toBeNull();
    expect(queryAll(fixture, '.type-card').length).toBe(fixture.componentInstance.TypeOptions.length);
  });

  it('marks the default type (dashboard) card as selected', () => {
    const fixture = render();
    const selected = query(fixture, '.type-card.selected');
    expect(selected).not.toBeNull();
    expect(selected?.textContent?.toLowerCase()).toContain('dashboard');
  });

  it('selects a type card when clicked', () => {
    const fixture = render();
    const cards = queryAll(fixture, '.type-card');
    (cards[1] as HTMLElement).click();
    sync(fixture);
    expect(cards[1].classList.contains('selected')).toBe(true);
  });

  it('disables Create until the required name is provided', () => {
    const fixture = render();
    expect(createBtn(fixture).disabled).toBe(true);
    fixture.componentInstance.form.get('name')?.setValue('Sales Overview');
    sync(fixture);
    expect(createBtn(fixture).disabled).toBe(false);
  });

  it('emits Close(null) on Cancel', () => {
    const fixture = render();
    const closed = capture(fixture.componentInstance.Close);
    (queryAll(fixture, 'button').find((b) => b.textContent?.trim() === 'Cancel') as HTMLElement).click();
    expect(closed).toEqual([null]);
  });

  it('emits Close(result) with the entered name when Create is clicked', () => {
    const fixture = render();
    const closed = capture(fixture.componentInstance.Close);
    fixture.componentInstance.form.get('name')?.setValue('Sales Overview');
    sync(fixture);
    createBtn(fixture).click();
    expect(closed.length).toBe(1);
    expect((closed[0] as { name: string }).name).toBe('Sales Overview');
  });
});
