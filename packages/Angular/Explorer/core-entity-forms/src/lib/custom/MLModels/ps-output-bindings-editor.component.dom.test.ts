import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { CreateFakeProvider, renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { MJMLOutputBindingEntity } from '@memberjunction/core-entities';
import { PSOutputBindingsEditorComponent } from './ps-output-bindings-editor.component';
import { GatedReads, SettleReads } from './ps-gated-reads.dom-fixture';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/** The binding members the editor reads and the save it calls. */
interface BindingDouble extends Pick<MJMLOutputBindingEntity, 'ID' | 'Surface' | 'SortsBy' | 'DriverDirectionRelativeTo' | 'Label'> {
  Saved: string[];
  LatestResult: { CompleteMessage: string } | null;
  Save(): Promise<boolean>;
}

/** An at-risk-list binding whose save refuses with `saveRefusal`, or succeeds when it is null. */
function AtRiskBinding(saveRefusal: string | null): BindingDouble {
  const b: BindingDouble = {
    ID: 'OB-1', Surface: 'at-risk-list', SortsBy: 'adverse-probability-desc', DriverDirectionRelativeTo: 'adverse-class', Label: 'At-risk members',
    Saved: [], LatestResult: null,
    Save: async () => {
      b.Saved.push(b.Label);
      if (saveRefusal === null) return true;
      b.LatestResult = { CompleteMessage: saveRefusal };
      return false;
    },
  };
  return b;
}

async function RenderBindingsEditor(opts: { saveRefusal: string | null }) {
  const binding = AtRiskBinding(opts.saveRefusal);
  const provider = CreateFakeProvider({ runViewResults: (p) => (p.EntityName === 'MJ: ML Output Bindings' ? [binding] : []) });
  const f = renderComponentFixture(PSOutputBindingsEditorComponent, { inputs: { Provider: provider } });
  // inputs are set untyped (setInput), so the model double is passed as is
  f.componentRef.setInput('Model', { ID: 'M-1' });
  await f.componentInstance.Reload();
  f.detectChanges();
  await f.whenStable();
  return { f, binding };
}
type Fixture = Awaited<ReturnType<typeof RenderBindingsEditor>>['f'];

const Settle = async (f: Fixture): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  f.detectChanges();
};
const Type = async (f: Fixture, testId: string, text: string): Promise<void> => {
  const input = query(f, `[data-testid="${testId}"]`) as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await Settle(f);
};
const Click = async (f: Fixture, testId: string): Promise<void> => {
  (query(f, `[data-testid="${testId}"]`) as HTMLButtonElement).click();
  await Settle(f);
};
const Text = (f: Fixture, testId: string): string => query(f, `[data-testid="${testId}"]`)?.textContent || '';

describe('PSOutputBindingsEditorComponent (DOM)', () => {
  it('the bindings editor shows the semantics refusal of a save', async () => {
    const { f } = await RenderBindingsEditor({ saveRefusal: 'swaps the adverse class' });
    await Type(f, 'ps-output-binding-label-at-risk-list', 'Gold risk');
    await Click(f, 'ps-output-binding-save');
    expect(Text(f, 'ps-output-binding-error')).toContain('swaps the adverse class');
  });

  it('saves the edited label and shows no error', async () => {
    const { f, binding } = await RenderBindingsEditor({ saveRefusal: null });
    await Type(f, 'ps-output-binding-label-at-risk-list', 'Gold risk');
    await Click(f, 'ps-output-binding-save');
    expect([binding.Saved, query(f, '[data-testid="ps-output-binding-error"]')]).toEqual([['Gold risk'], null]);
  });

  it('shows the sort and direction as fixed, never editable', async () => {
    const { f } = await RenderBindingsEditor({ saveRefusal: null });
    expect(Text(f, 'ps-output-binding')).toContain('most at risk first');
    expect(f.nativeElement.querySelectorAll('[data-testid="ps-output-binding"] input, [data-testid="ps-output-binding"] select').length).toBe(1);
  });
});

describe('a model change while its rows load (M7-3)', () => {
  it('shows the current model\'s output bindings when an earlier model\'s read finishes last', async () => {
    const reads = new GatedReads((modelId, p) => (p.EntityName === 'MJ: ML Output Bindings' ? (modelId === 'M-A' ? [AtRiskBinding(null), { ...AtRiskBinding(null), ID: 'OB-2' }] : [AtRiskBinding(null)]) : []));
    const f = renderComponentFixture(PSOutputBindingsEditorComponent, { inputs: { Provider: reads.Provider() } });
    f.componentRef.setInput('Model', { ID: 'M-A' });
    f.detectChanges();
    f.componentRef.setInput('Model', { ID: 'M-B' });
    f.detectChanges();
    await SettleReads();
    reads.Release('M-B');
    await SettleReads();
    reads.Release('M-A');
    await SettleReads();
    f.detectChanges();
    expect(queryAll(f, '[data-testid="ps-output-binding"]').length).toBe(1);
  });
});
