import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import type { EntityTableSpec, EntityPipelineResult } from '../../database-designer.types';
import { EntityPipelinePanelComponent } from './entity-pipeline-panel.component';
import { DatabaseDesignerService } from '../../services/database-designer.service';

/**
 * DOM coverage for <mj-database-pipeline-panel> — the create/modify pipeline panel. With AutoStart
 * false, the idle panel shows the "creating/applying" wording + target. The success/failed panels
 * are reached by driving StartExecution() against a faked DatabaseDesignerService (whose createEntity
 * resolves success or failure) — the component self-renders via its own cdr.detectChanges() in the
 * finally block, which is the OnPush-correct path (a direct State assignment doesn't re-render).
 * mj-alert imported.
 */

const TABLE = { SchemaName: 'crm', TableName: 'Member', EntityName: 'Member', Columns: [] } as unknown as EntityTableSpec;

function render(service: Partial<DatabaseDesignerService>, modificationType: 'create' | 'alter' = 'create'): ComponentFixture<EntityPipelinePanelComponent> {
  return renderComponentFixture(EntityPipelinePanelComponent, {
    imports: [MJAlertComponent],
    declarations: [EntityPipelinePanelComponent],
    providers: [{ provide: DatabaseDesignerService, useValue: service }],
    inputs: { TableDefinition: TABLE, ModificationType: modificationType, AutoStart: false },
  });
}

describe('EntityPipelinePanelComponent (DOM)', () => {
  it('shows the running panel with the target while idle in create mode', () => {
    const fixture = render({});
    expect(query(fixture, '.panel-running')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Creating entity');
    expect(fixture.nativeElement.textContent).toContain('crm.Member');
  });

  it('shows the "Applying changes" wording in alter mode', () => {
    expect(render({}, 'alter').nativeElement.textContent).toContain('Applying changes');
  });

  it('shows the success panel with the entity name once the pipeline succeeds', async () => {
    const result = { Success: true, EntityName: 'Member', PipelineSteps: [] } as unknown as EntityPipelineResult;
    const fixture = render({ createEntity: async () => result });
    await fixture.componentInstance.StartExecution();
    expect(query(fixture, '.panel-success')).not.toBeNull();
    expect(query(fixture, '.panel-success')?.textContent).toContain('Member');
  });

  it('shows the failed panel with the error message when the pipeline fails', async () => {
    const result = { Success: false, ErrorMessage: 'Migration failed on the server' } as unknown as EntityPipelineResult;
    const fixture = render({ createEntity: async () => result });
    await fixture.componentInstance.StartExecution();
    expect(query(fixture, '.panel-failed')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Migration failed on the server');
  });
});
