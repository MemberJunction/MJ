// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import * as publicApi from '../public-api';
import { CoreGeneratedFormsModule, TemplateEditorComponent, NewAgentDialogService } from '../public-api';
import { MJRecordArtifactFormComponent } from '../lib/generated/Entities/MJRecordArtifact/mjrecordartifact.form.component';

/**
 * Entry-point smoke test: importing the public entry must succeed (catches
 * broken exports / import-graph breakage) and the load-bearing symbols the
 * package exists to provide must be real constructors.
 */
describe('@memberjunction/ng-core-entity-forms', () => {
  it('exposes a non-empty public export surface', () => {
    expect(Object.keys(publicApi).length).toBeGreaterThan(0);
  });

  it('exports its load-bearing classes as constructors', () => {
    expect(CoreGeneratedFormsModule).toBeTypeOf('function');
    expect(TemplateEditorComponent).toBeTypeOf('function');
    expect(NewAgentDialogService).toBeTypeOf('function');
  });

  it('registers MJRecordArtifactFormComponent for MJ: Record Artifacts in ClassFactory', () => {
    const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, 'MJ: Record Artifacts');
    expect(reg).toBeDefined();
    expect(reg?.SubClass).toBe(MJRecordArtifactFormComponent);
  });
});
