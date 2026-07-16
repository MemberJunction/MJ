import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { By } from '@angular/platform-browser';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { StepPipelineComponent } from './step-pipeline.component';

/**
 * DOM coverage for <mj-entity-step-pipeline> (OnPush) — hosts the create pipeline panel and reveals
 * a "Create Another Entity" CTA once the pipeline succeeds. The heavy pipeline panel is stubbed (the
 * component's @ViewChild is typed to the real class, so it won't bind the stub — harmless via
 * optional chaining). Completion is driven through the stub's (Completed) OUTPUT — firing the event
 * binding runs OnCompleted in an Angular event context, which marks the OnPush view dirty.
 */

@Component({ standalone: true, selector: 'mj-database-pipeline-panel', template: '' })
class PipelinePanelStub {
  @Input() TableDefinition: unknown;
  @Input() ModificationType = '';
  @Input() AutoStart = false;
  @Output() Completed = new EventEmitter<unknown>();
  @Output() Errored = new EventEmitter<string>();
}

function render() {
  return renderComponentFixture(StepPipelineComponent, {
    imports: [MJButtonDirective, PipelinePanelStub],
    declarations: [StepPipelineComponent],
    inputs: { TableDefinition: {} },
  });
}

const cta = (fixture: ReturnType<typeof render>) =>
  queryAll(fixture, 'button').find((b) => b.textContent?.includes('Create Another Entity')) as HTMLElement | undefined;
const panel = (fixture: ReturnType<typeof render>) =>
  fixture.debugElement.query(By.directive(PipelinePanelStub)).componentInstance as PipelinePanelStub;

describe('StepPipelineComponent (DOM)', () => {
  it('renders the pipeline panel child', () => {
    expect(query(render(), 'mj-database-pipeline-panel')).not.toBeNull();
  });

  it('does not show the Create-Another CTA before completion', () => {
    expect(cta(render())).toBeUndefined();
  });

  it('emits PipelineCompleted and reveals the CTA when the pipeline completes successfully', () => {
    const fixture = render();
    const completed = capture(fixture.componentInstance.PipelineCompleted);
    panel(fixture).Completed.emit({ Success: true });
    fixture.detectChanges(false);
    expect(completed).toEqual([{ Success: true }]);
    expect(cta(fixture)).toBeTruthy();
  });

  it('emits CreateAnother when the CTA is clicked', () => {
    const fixture = render();
    const another = capture(fixture.componentInstance.CreateAnother);
    panel(fixture).Completed.emit({ Success: true });
    fixture.detectChanges(false);
    cta(fixture)!.click();
    expect(another.length).toBe(1);
  });
});
