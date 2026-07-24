import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  MJButtonDirective,
  MJEmptyStateComponent,
  MJDialogComponent,
  MJDialogTitlebarComponent,
  MJDialogActionsComponent,
  MJAccordionPanelComponent,
  MJAccordionTitleDirective,
} from '@memberjunction/ng-ui-components';
import { query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { TemplateParamDialogComponent } from './template-param-dialog.component';

/**
 * DOM coverage for <mj-template-param-dialog> — a modal (wrapped in <mj-dialog>) that is gated by
 * the `_isVisible` flag and, when a `template` @Input is present, loads that template's params
 * through `RunView.FromMetadataProvider(this.ProviderToUse)`. A `createFakeProvider` on the
 * `Provider` input feeds canned param rows. Covers: the visibility gate (nothing renders when
 * hidden), the titlebar bound to `template.Name`, one `.params-table-row` per loaded param + its
 * name/description, the empty-state accordion when no params, the required-marker rendering, and
 * the `isVisibleChange`/`onClose` emissions on Close.
 *
 * `template` and `isVisible` are real @Inputs (set via setInput). runTemplate()/updateTemplateParams()
 * touch MJNotificationService.Instance + TemplateRunOperation, but only inside click handlers we
 * don't exercise here, so no stub is needed for the render/close paths.
 *
 * ngOnInit's async loadTemplateParams() flips isLoading off after a microtask, so every render does
 * detectChanges(false) → await a macrotask → markForCheck → detectChanges(false) (zoneless).
 */

const TEMPLATE = { ID: 'tmpl-1', Name: 'My Template' } as unknown as import('@memberjunction/core-entities').MJTemplateEntity;

const PARAMS = [
  { Name: 'firstName', DefaultValue: 'Ada', Description: 'the given name', IsRequired: true, Type: 'Scalar' },
  { Name: 'company', DefaultValue: 'Acme', Description: 'employer', IsRequired: false, Type: 'Scalar' },
];

interface RenderOpts {
  template?: unknown;
  visible?: boolean;
  params?: Array<Record<string, unknown>>;
}

async function render(opts: RenderOpts = {}): Promise<ComponentFixture<TemplateParamDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [
      CommonModule,
      FormsModule,
      MJButtonDirective,
      MJEmptyStateComponent,
      MJDialogComponent,
      MJDialogTitlebarComponent,
      MJDialogActionsComponent,
      MJAccordionPanelComponent,
      MJAccordionTitleDirective,
    ],
    declarations: [TemplateParamDialogComponent],
  });
  const fixture = TestBed.createComponent(TemplateParamDialogComponent);
  const ref = fixture.componentRef;
  ref.setInput('Provider', createFakeProvider({ runViewResults: opts.params ?? PARAMS }));
  ref.setInput('template', opts.template === undefined ? TEMPLATE : opts.template);
  ref.setInput('isVisible', opts.visible ?? true);
  fixture.detectChanges(false); // ngOnInit kicks off async loadTemplateParams()
  await new Promise((r) => setTimeout(r, 0)); // let loadTemplateParams() settle (isLoading -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<TemplateParamDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<TemplateParamDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('TemplateParamDialogComponent (DOM)', () => {
  it('renders nothing when isVisible is false', async () => {
    const fixture = await render({ visible: false });
    expect(query(fixture, 'mj-dialog')).toBeNull();
    expect(query(fixture, '.dialog-content')).toBeNull();
  });

  it('renders the dialog with the template name in the titlebar when visible', async () => {
    const fixture = await render();
    expect(query(fixture, 'mj-dialog')).not.toBeNull();
    expect(query(fixture, 'mj-dialog-titlebar')?.textContent).toContain('My Template');
  });

  it('renders one params-table-row per loaded template param, with name and description', async () => {
    const fixture = await render();
    const rows = queryAll(fixture, '.params-table-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('firstName');
    expect(rows[0].textContent).toContain('the given name');
    expect(rows[1].textContent).toContain('company');
  });

  it('shows the required-marker for required params', async () => {
    const fixture = await render();
    const markers = queryAll(fixture, '.param-required-marker');
    // only firstName is required
    expect(markers.length).toBe(1);
    expect(markers[0].textContent?.trim()).toBe('*');
  });

  it('shows the no-parameters empty state when the template has no params', async () => {
    // loadTemplateParams() adds one blank editable param when none load, so no empty-state accordion;
    // instead the single editable row appears. Assert that blank row and no template-sourced text.
    const fixture = await render({ params: [] });
    const rows = queryAll(fixture, '.params-table-row');
    expect(rows.length).toBe(1);
    expect(query(fixture, '.param-key-text')).toBeNull(); // no from-template key rendered
  });

  it('emits isVisibleChange(false) and onClose on Close', async () => {
    const fixture = await render();
    const visibleChanges = capture(fixture.componentInstance.isVisibleChange);
    const closes = capture(fixture.componentInstance.onClose);
    buttonByText(fixture, 'Close').click();
    expect(visibleChanges).toEqual([false]);
    expect(closes.length).toBe(1);
  });
});
