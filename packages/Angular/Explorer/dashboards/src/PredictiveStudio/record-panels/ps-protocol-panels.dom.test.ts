import { describe, it, expect, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { CompositeKey } from '@memberjunction/core';
import type { FormContext } from '@memberjunction/ng-base-forms';
import { NavigationService } from '@memberjunction/ng-shared';
import { AfterVersionSavedEventArgs } from '../components/ps-widget-events';
import { PSModelEvaluationPanel, PSPipelineBindingsPanel, PSProtocolVersionsPanel, PSUnitVersionsPanel } from './ps-protocol-panels';

/**
 * DOM coverage for the Predictive Studio record-form panels: what each passes its widget, and how the versions panels
 * turn a saved version into navigation to its own record. The widgets and `<mj-collapsible-panel>` are replaced by
 * stubs, so the panels' own template bindings carry every event. Keeping the pipeline form in step after a rebinding
 * is the record-form container's job (it hears the save of the same record), so the bindings panel adds no handler;
 * the e2e spec's bindings test checks the form end to end.
 */
@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<ng-content></ng-content>' })
class CollapsiblePanelStub {
  @Input() SectionKey = '';
  @Input() SectionName = '';
  @Input() Icon = '';
  @Input() Order: number | null = null;
  @Input() DefaultExpanded = false;
  @Input() Form: FormDouble | null = null;
  @Input() FormContext: FormContext | null = null;
}

@Component({ standalone: true, selector: 'mj-ps-unit-versions', template: '' })
class UnitVersionsStub {
  @Input() Provider: object | null = null;
  @Input() UnitID: string | null = null;
  @Output() AfterVersionSaved = new EventEmitter<AfterVersionSavedEventArgs>();
}

@Component({ standalone: true, selector: 'mj-ps-protocol-versions', template: '' })
class ProtocolVersionsStub {
  @Input() Provider: object | null = null;
  @Input() EvaluationProtocolID: string | null = null;
  @Output() AfterVersionSaved = new EventEmitter<AfterVersionSavedEventArgs>();
}

@Component({ standalone: true, selector: 'mj-ps-pipeline-bindings', template: '' })
class PipelineBindingsStub {
  @Input() Provider: object | null = null;
  @Input() PipelineID: string | null = null;
}

@Component({ standalone: true, selector: 'mj-ps-run-evaluation', template: '' })
class RunEvaluationStub {
  @Input() Provider: object | null = null;
  @Input() ModelID: string | null = null;
}

/** The form member the panels use. */
interface FormDouble {
  ProviderToUse: object;
}

/** The record members the panels read. */
interface RecordDouble {
  IsSaved: boolean;
  ID: string;
}

/** The NavigationService member the panels call, and every call it received. */
interface NavigationDouble {
  OpenEntityRecord: (entityName: string, key: CompositeKey) => string;
  Opened: Array<{ Entity: string; ID: string }>;
}

const RECORD_ID = 'A1B2C3D4-0000-4000-8000-000000000001';
const NEW_VERSION_ID = 'A1B2C3D4-0000-4000-8000-000000000002';

function navigationDouble(): NavigationDouble {
  const nav: NavigationDouble = {
    Opened: [],
    OpenEntityRecord: (entityName: string, key: CompositeKey): string => {
      nav.Opened.push({ Entity: entityName, ID: String(key.KeyValuePairs[0]?.Value) });
      return 'tab';
    },
  };
  return nav;
}

function formDouble(): FormDouble {
  return { ProviderToUse: {} };
}

function recordDouble(isSaved = true): RecordDouble {
  return { IsSaved: isSaved, ID: RECORD_ID };
}

interface Rendered<TPanel, TStub> {
  Fixture: ComponentFixture<TPanel>;
  Widget: TStub;
  Navigation: NavigationDouble;
}

async function render<TPanel, TStub>(panel: Type<TPanel>, stub: Type<TStub>, record: RecordDouble, form: FormDouble): Promise<Rendered<TPanel, TStub>> {
  const navigation = navigationDouble();
  TestBed.configureTestingModule({ providers: [{ provide: NavigationService, useValue: navigation }] });
  TestBed.overrideComponent(panel, { set: { imports: [CollapsiblePanelStub, stub] } });
  const fixture = TestBed.createComponent(panel);
  fixture.componentRef.setInput('Record', record);
  fixture.componentRef.setInput('FormComponent', form);
  fixture.detectChanges();
  await fixture.whenStable();
  const widget = fixture.debugElement.query(By.directive(stub)).injector.get(stub);
  return { Fixture: fixture, Widget: widget, Navigation: navigation };
}

afterEach(() => TestBed.resetTestingModule());

describe('PSUnitVersionsPanel (DOM)', () => {
  it('passes the saved record to the widget, and null for a new record', async () => {
    const saved = await render(PSUnitVersionsPanel, UnitVersionsStub, recordDouble(true), formDouble());
    expect(saved.Widget.UnitID).toBe(RECORD_ID);
    TestBed.resetTestingModule();
    const unsaved = await render(PSUnitVersionsPanel, UnitVersionsStub, recordDouble(false), formDouble());
    expect(unsaved.Widget.UnitID).toBeNull();
  });

  it('opens a saved version on its own Prediction Unit record', async () => {
    const r = await render(PSUnitVersionsPanel, UnitVersionsStub, recordDouble(), formDouble());
    r.Widget.AfterVersionSaved.emit(new AfterVersionSavedEventArgs('MJ: Prediction Units', 2, NEW_VERSION_ID, true));
    expect(r.Navigation.Opened).toEqual([{ Entity: 'MJ: Prediction Units', ID: NEW_VERSION_ID }]);
  });

  it('does not navigate when the save failed or returned no ID', async () => {
    const r = await render(PSUnitVersionsPanel, UnitVersionsStub, recordDouble(), formDouble());
    r.Widget.AfterVersionSaved.emit(new AfterVersionSavedEventArgs('MJ: Prediction Units', 2, null, false, 'refused'));
    r.Widget.AfterVersionSaved.emit(new AfterVersionSavedEventArgs('MJ: Prediction Units', 2, null, true));
    expect(r.Navigation.Opened).toEqual([]);
  });
});

describe('PSProtocolVersionsPanel (DOM)', () => {
  it('passes the record to the widget and opens a saved version on its Evaluation Protocol record', async () => {
    const r = await render(PSProtocolVersionsPanel, ProtocolVersionsStub, recordDouble(), formDouble());
    expect(r.Widget.EvaluationProtocolID).toBe(RECORD_ID);
    r.Widget.AfterVersionSaved.emit(new AfterVersionSavedEventArgs('MJ: Evaluation Protocols', 2, NEW_VERSION_ID, true));
    expect(r.Navigation.Opened).toEqual([{ Entity: 'MJ: Evaluation Protocols', ID: NEW_VERSION_ID }]);
  });

  it('does not navigate when the save failed', async () => {
    const r = await render(PSProtocolVersionsPanel, ProtocolVersionsStub, recordDouble(), formDouble());
    r.Widget.AfterVersionSaved.emit(new AfterVersionSavedEventArgs('MJ: Evaluation Protocols', 2, null, false, 'refused'));
    expect(r.Navigation.Opened).toEqual([]);
  });
});

describe('PSPipelineBindingsPanel (DOM)', () => {
  it('passes the saved pipeline to the widget, and null for a new record', async () => {
    const saved = await render(PSPipelineBindingsPanel, PipelineBindingsStub, recordDouble(true), formDouble());
    expect(saved.Widget.PipelineID).toBe(RECORD_ID);
    TestBed.resetTestingModule();
    const unsaved = await render(PSPipelineBindingsPanel, PipelineBindingsStub, recordDouble(false), formDouble());
    expect(unsaved.Widget.PipelineID).toBeNull();
  });
});

describe('PSModelEvaluationPanel (DOM)', () => {
  it('passes the saved model to the widget, and null for a new record', async () => {
    const saved = await render(PSModelEvaluationPanel, RunEvaluationStub, recordDouble(true), formDouble());
    expect(saved.Widget.ModelID).toBe(RECORD_ID);
    TestBed.resetTestingModule();
    const unsaved = await render(PSModelEvaluationPanel, RunEvaluationStub, recordDouble(false), formDouble());
    expect(unsaved.Widget.ModelID).toBeNull();
  });
});
