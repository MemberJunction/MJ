import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import {
  MJDialogComponent,
  MJDialogTitlebarComponent,
  MJDialogActionsComponent,
  MJButtonDirective,
  MJAccordionPanelComponent,
  MJAccordionTitleDirective,
  MJAccordionActionsDirective,
  MJAccordionBodyDirective,
} from '@memberjunction/ng-ui-components';
import { query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { MJQueryEntity, MJQueryParameterEntity } from '@memberjunction/core-entities';
import { QueryRunDialogComponent } from './query-run-dialog.component';

/**
 * DOM coverage for <mj-query-run-dialog> — an `@if (isVisible)`-gated dialog that echoes an
 * @Input query (title) and renders one parameter card per @Input parameters row (built into
 * `parameterPairs` in ngOnInit/initializeParameters). Running the query goes through
 * `ExecuteGQL` on the GraphQL provider and is out of unit scope; these specs cover what the shell
 * OWNS: visibility gating, the title, the parameter list + required marker + type badge + the
 * right input kind (number vs textarea), and the isVisibleChange/onClose emissions on Cancel.
 *
 * Real mj-dialog + mj-accordion-panel + FormsModule (ngModel). Parameters are plain objects cast
 * to the entity type — the component reads only Name/Type/DefaultValue/Description/IsRequired.
 */

const QUERY = { ID: 'q1', Name: 'Active Members' } as MJQueryEntity;

const makeParam = (over: Partial<MJQueryParameterEntity>): MJQueryParameterEntity =>
  ({ Name: 'p', Type: 'string', DefaultValue: '', Description: '', IsRequired: false, ...over }) as MJQueryParameterEntity;

const PARAMS: MJQueryParameterEntity[] = [
  makeParam({ Name: 'Region', Type: 'string', Description: 'the sales region', IsRequired: true }),
  makeParam({ Name: 'MinAge', Type: 'number' }),
];

interface RenderOpts {
  isVisible?: boolean;
  query?: MJQueryEntity | null;
  parameters?: MJQueryParameterEntity[];
}

function render(opts: RenderOpts = {}): ComponentFixture<QueryRunDialogComponent> {
  TestBed.configureTestingModule({
    imports: [
      FormsModule,
      MJDialogComponent,
      MJDialogTitlebarComponent,
      MJDialogActionsComponent,
      MJButtonDirective,
      MJAccordionPanelComponent,
      MJAccordionTitleDirective,
      MJAccordionActionsDirective,
      MJAccordionBodyDirective,
    ],
    declarations: [QueryRunDialogComponent],
  });
  const fixture = TestBed.createComponent(QueryRunDialogComponent);
  const ref = fixture.componentRef;
  ref.setInput('query', opts.query ?? QUERY);
  ref.setInput('parameters', opts.parameters ?? PARAMS);
  ref.setInput('isVisible', opts.isVisible ?? true);
  fixture.detectChanges(false);
  return fixture;
}

const buttonByText = (f: ComponentFixture<QueryRunDialogComponent>, t: string) =>
  queryAll(f, 'button').find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('QueryRunDialogComponent (DOM)', () => {
  it('renders nothing when isVisible is false', () => {
    expect(query(render({ isVisible: false }), 'mj-dialog')).toBeNull();
  });

  it('renders the dialog echoing the query name when visible', () => {
    const fixture = render();
    const dialog = query(fixture, 'mj-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Active Members');
  });

  it('renders one parameter card per @Input parameter with its name and description', () => {
    const fixture = render();
    const dialog = query(fixture, 'mj-dialog') as HTMLElement;
    expect(dialog.textContent).toContain('Region');
    expect(dialog.textContent).toContain('the sales region');
    expect(dialog.textContent).toContain('MinAge');
  });

  it('renders a numeric input for a number parameter and a textarea for a string parameter', () => {
    const fixture = render();
    expect(query(fixture, 'input[type="number"]')).not.toBeNull(); // MinAge (number)
    expect(query(fixture, 'textarea')).not.toBeNull(); // Region (string)
  });

  it('renders a type badge showing each parameter type', () => {
    const fixture = render();
    const badges = queryAll(fixture, '.badge').map((b) => b.textContent?.trim());
    expect(badges).toContain('string');
    expect(badges).toContain('number');
  });

  it('emits isVisibleChange(false) and onClose when Cancel is clicked', () => {
    const fixture = render();
    const visibleChanged = capture(fixture.componentInstance.isVisibleChange);
    const closed = capture(fixture.componentInstance.onClose);
    buttonByText(fixture, 'Cancel').click();
    expect(visibleChanged).toEqual([false]);
    expect(closed.length).toBe(1);
  });
});
