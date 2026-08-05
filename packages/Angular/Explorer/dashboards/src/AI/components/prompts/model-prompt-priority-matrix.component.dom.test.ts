import { Component, Input } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RunViewParams } from '@memberjunction/core';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { ModelPromptPriorityMatrixComponent } from './model-prompt-priority-matrix.component';

/**
 * DOM coverage for <app-model-prompt-priority-matrix> — the prompt×model priority grid. In ngOnInit
 * loadData() fires three RunView calls through ProviderToUse ('MJ: AI Prompts', 'MJ: AI Models',
 * 'MJ: AI Prompt Models') and then buildAssociations()/buildMatrix() join the association rows back
 * onto the prompt/model axes by UUID. We drive those three queries via a keyed fake provider and
 * assert the OWNED rendering + logic: one row per prompt, one model-header per model, the priority
 * badge for each existing association, the active-association stat count, and the promptSelected
 * output. `mj-loading` / `mj-alert` are stubbed; the two injected services are stubbed (only touched
 * in save/discard handlers we do not exercise). FormsModule is imported for the [(ngModel)] toggles.
 */

@Component({ standalone: true, selector: 'mj-alert', template: '<div class="stub-alert"><ng-content></ng-content></div>' })
class StubAlert {
  @Input() Variant = '';
}

// Two prompts, two models — a full 2×2 axis so buildMatrix produces 2 rows × 2 model headers.
const PROMPTS = [
  { ID: 'p1', Name: 'Summarize', Description: 'Summ desc', Status: 'Active' },
  { ID: 'p2', Name: 'Classify', Description: 'Class desc', Status: 'Active' },
];
const MODELS = [
  { ID: 'm1', Name: 'GPT-4o', Description: 'gpt desc', AIModelTypeID: 't1' },
  { ID: 'm2', Name: 'Claude', Description: 'claude desc', AIModelTypeID: 't1' },
];
// Two associations that both join (p1↔m1 priority 3, p2↔m2 priority 1). p1↔m2 / p2↔m1 stay empty.
const ASSOCIATIONS = [
  { ID: 'a1', PromptID: 'p1', ModelID: 'm1', Priority: 3, Status: 'Active' },
  { ID: 'a2', PromptID: 'p2', ModelID: 'm2', Priority: 1, Status: 'Active' },
];

const rowsFn = (p: RunViewParams): unknown[] => {
  switch (p.EntityName) {
    case 'MJ: AI Prompts':
      return PROMPTS;
    case 'MJ: AI Models':
      return MODELS;
    case 'MJ: AI Prompt Models':
      return ASSOCIATIONS;
    default:
      return [];
  }
};

async function render(rows: (p: RunViewParams) => unknown[] = rowsFn) {
  const fixture = renderComponentFixture(ModelPromptPriorityMatrixComponent, {
    imports: [CommonModule, FormsModule, StubLoadingComponent, StubAlert],
    declarations: [ModelPromptPriorityMatrixComponent],
    providers: [
      { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
      { provide: MJConfirmService, useValue: { Confirm: async () => false } },
    ],
    inputs: { Provider: createFakeProvider({ runViewResults: rows }) },
  });
  // Async ngOnInit → loadData flips isLoading off; let the microtasks settle then re-render.
  fixture.detectChanges(false);
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges(false);
  return fixture;
}

describe('ModelPromptPriorityMatrixComponent (DOM)', () => {
  it('renders one matrix row per prompt and one header per model', async () => {
    const fixture = await render();
    expect(queryAll(fixture, '.matrix-row').length).toBe(2);
    const modelHeaders = queryAll(fixture, '.model-header .header-name').map((e) => e.textContent?.trim());
    expect(modelHeaders).toEqual(['GPT-4o', 'Claude']);
  });

  it('shows a priority badge for each joined association and only those', async () => {
    const fixture = await render();
    // Two associations join → exactly two priority badges with the joined priorities.
    const badges = queryAll(fixture, '.priority-badge').map((e) => e.textContent?.trim());
    expect(badges.sort()).toEqual(['1', '3']);
  });

  it('counts active associations in the toolbar stat', async () => {
    const fixture = await render();
    // getAssociationCount() renders inside the first .stat-item ("<n> associations").
    expect(text(fixture, '.matrix-stats .stat-item')).toContain('2 associations');
  });

  it('renders an empty cell indicator for prompt/model pairs with no association', async () => {
    const fixture = await render();
    // 2×2 = 4 cells, 2 associated → 2 empty (canAssign is always true here) plus-indicators.
    expect(queryAll(fixture, '.empty-cell-indicator').length).toBe(2);
  });

  it('emits promptSelected when a prompt row header is clicked', async () => {
    const fixture = await render();
    const selected = capture(fixture.componentInstance.promptSelected);
    (query(fixture, '.matrix-row .prompt-header') as HTMLElement).click();
    expect(selected.length).toBe(1);
    expect(selected[0].Name).toBe('Summarize');
  });

  it('builds no matrix rows and reports zero associations when data is empty', async () => {
    const fixture = await render(() => []);
    expect(queryAll(fixture, '.matrix-row').length).toBe(0);
    expect(text(fixture, '.matrix-stats .stat-item')).toContain('0 associations');
  });
});
