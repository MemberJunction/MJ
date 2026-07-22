import { describe, it, expect, vi } from 'vitest';
import { Component, Input, Pipe, PipeTransform, Directive } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import type { EntityInfo, RunViewParams } from '@memberjunction/core';
import type { ProcessedMessage } from '@memberjunction/communication-types';
import type { MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { EntityCommunicationsPreviewComponent } from './preview.component';

/**
 * DOM-level spec for <mj-entity-communications-preview>.
 *
 * This is a module-declared (standalone:false) two-step wizard. Its template is driven
 * entirely by simple component state — `step`, `templates`, `previewMessages`, `loading`,
 * `currentMessageIndex` — so the high-value surface (step-1 template list + click ->
 * (templateSelected) emit, step-2 VCR navigation with disabled-button gating, the loading
 * branch, the empty-messages branch, subject/body bindings) is honestly testable by
 * setting that state directly.
 *
 * Why we suppress ngOnInit's data load: ngOnInit() throws unless entityInfo/runViewParams
 * are present and then calls loadTemplates() which uses a bare `new RunView()` against the
 * global provider (the component pre-dates the @Input() Provider pattern, so there is no
 * provider seam to intercept). We satisfy the guard with minimal typed stubs and stub
 * loadTemplates() to a resolved no-op in `setup` (before the first detectChanges), so the
 * render reflects ONLY the state we set — no backend, no real RunView, no NG0100.
 *
 * The real children (mjButton directive, <mj-loading>, mjSafeRichHtml pipe) are replaced
 * with lightweight stubs so this isolates THIS component's template contract.
 */

@Directive({ standalone: false, selector: '[mjButton]' })
class MjButtonStub {}

@Component({ standalone: false, selector: 'mj-loading', template: '' })
class MjLoadingStub {
  @Input() showText = true;
  @Input() size = '';
}

@Pipe({ standalone: false, name: 'mjSafeRichHtml' })
class SafeRichHtmlStubPipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

/**
 * Test subclass that overrides the `protected` loadMessagePreviews() to a no-op. selectTemplate()
 * (exercised by the "click a template" test) calls it, and the real implementation reaches for the
 * CommunicationEngineBase SendGrid provider singleton — unconfigured in unit tests, so it throws.
 * Overriding it in a subclass keeps selectTemplate's emit/step-transition wiring real while
 * preventing the stray async rejection, without resorting to an `unknown`/`any` cast.
 */
@Component({
  standalone: false,
  selector: 'mj-entity-communications-preview-test',
  templateUrl: './preview.component.html',
  styleUrls: ['./preview.component.css'],
})
class PreviewTestComponent extends EntityCommunicationsPreviewComponent {
  protected override async loadMessagePreviews(): Promise<void> {
    // no-op for tests
  }
}

// Minimal typed stand-ins to satisfy ngOnInit's required-input guard. Only their presence
// (truthiness) matters for these template tests; their fields are never read because
// loadTemplates() / loadMessagePreviews() are not exercised here.
const entityInfoStub = { ID: 'entity-1', Name: 'Test Entity' } as unknown as EntityInfo;
const runViewParamsStub: RunViewParams = { EntityName: 'Test Entity' };

function makeTemplate(name: string): MJTemplateEntityExtended {
  return { Name: name } as unknown as MJTemplateEntityExtended;
}

function makeMessage(subject: string, body: string): ProcessedMessage {
  return { ProcessedSubject: subject, ProcessedHTMLBody: body } as unknown as ProcessedMessage;
}

describe('EntityCommunicationsPreviewComponent (DOM)', () => {
  function render(setState: (instance: EntityCommunicationsPreviewComponent) => void): ComponentFixture<PreviewTestComponent> {
    return renderComponentFixture(PreviewTestComponent, {
      declarations: [PreviewTestComponent, MjButtonStub, MjLoadingStub, SafeRichHtmlStubPipe],
      inputs: { entityInfo: entityInfoStub, runViewParams: runViewParamsStub },
      setup: (instance) => {
        // Neutralize the real data load so the render reflects only the state we set.
        // loadTemplates() runs from ngOnInit and uses a bare `new RunView()` against the
        // unconfigured global provider; stub it to a resolved no-op.
        instance.loadTemplates = vi.fn().mockResolvedValue(undefined);
        setState(instance);
      },
    });
  }

  const vcrButtons = (f: ComponentFixture<PreviewTestComponent>): HTMLButtonElement[] => queryAll(f, '.vcr-controls button') as HTMLButtonElement[];

  // ---- Step 1: template list ----

  it('step 1 renders one <li> per template with its Name', () => {
    const f = render((c) => {
      c.step = 1;
      c.templates = [makeTemplate('Welcome'), makeTemplate('Reminder')];
    });
    expect(text(f, 'h2')).toBe('Select a Template');
    const items = queryAll(f, '.step-1 li');
    expect(items.length).toBe(2);
    expect(items[0].textContent?.trim()).toBe('Welcome');
    expect(items[1].textContent?.trim()).toBe('Reminder');
  });

  it('clicking a template <li> emits templateSelected and advances to step 2', () => {
    const tpl = makeTemplate('Welcome');
    const f = render((c) => {
      c.step = 1;
      c.templates = [tpl];
    });
    const selected = capture(f.componentInstance.templateSelected);
    click(f, '.step-1 li');
    expect(selected).toEqual([tpl]);
    expect(f.componentInstance.selectedTemplate).toBe(tpl);
    expect(f.componentInstance.step).toBe(2);
  });

  it('step 1 renders no template rows when the list is empty', () => {
    const f = render((c) => {
      c.step = 1;
      c.templates = [];
    });
    expect(queryAll(f, '.step-1 li').length).toBe(0);
  });

  // ---- Step 2: loading branch ----

  it('step 2 shows the loading indicator while loading is true (and hides preview/controls)', () => {
    const f = render((c) => {
      c.step = 2;
      c.loading = true;
    });
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, '.vcr-controls')).toBeNull();
    expect(query(f, '.template-preview')).toBeNull();
  });

  // ---- Step 2: empty-messages branch ----

  it('step 2 with no messages shows the "No Messages Available" state', () => {
    const f = render((c) => {
      c.step = 2;
      c.loading = false;
      c.previewMessages = [];
    });
    expect(text(f, '.step-2 h2')).toBe('No Messages Available');
    expect(query(f, '.vcr-controls')).toBeNull();
  });

  // ---- Step 2: preview + VCR navigation ----

  it('step 2 with messages renders the preview header, subject, body and index indicator', () => {
    const f = render((c) => {
      c.step = 2;
      c.loading = false;
      c.selectedTemplate = makeTemplate('Welcome');
      c.previewMessages = [makeMessage('Subj A', '<p>Body A</p>'), makeMessage('Subj B', '<p>Body B</p>')];
      c.currentMessageIndex = 0;
    });
    expect(text(f, '.step-2 h2')).toBe('Preview Welcome');
    expect(text(f, '.subject-line')).toBe('Subj A');
    expect(query(f, '.preview-body')!.innerHTML).toContain('Body A');
    expect(text(f, '.index-indicator')).toBe('1 of 2');
  });

  it('VCR back/prev buttons are disabled at the first message; next/last enabled', () => {
    const f = render((c) => {
      c.step = 2;
      c.loading = false;
      c.previewMessages = [makeMessage('A', 'a'), makeMessage('B', 'b')];
      c.currentMessageIndex = 0;
    });
    const buttons = vcrButtons(f); // order: First, Previous, Next, Last
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[2].disabled).toBe(false);
    expect(buttons[3].disabled).toBe(false);
  });

  it('VCR next/last buttons are disabled at the last message; back/prev enabled', () => {
    const f = render((c) => {
      c.step = 2;
      c.loading = false;
      c.previewMessages = [makeMessage('A', 'a'), makeMessage('B', 'b')];
      c.currentMessageIndex = 1;
    });
    const buttons = vcrButtons(f);
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(false);
    expect(buttons[2].disabled).toBe(true);
    expect(buttons[3].disabled).toBe(true);
  });

  it('clicking Next advances currentMessageIndex and updates the rendered preview', () => {
    const f = render((c) => {
      c.step = 2;
      c.loading = false;
      c.previewMessages = [makeMessage('A', 'a'), makeMessage('B', 'b')];
      c.currentMessageIndex = 0;
    });
    vcrButtons(f)[2].click(); // Next
    f.detectChanges();
    expect(f.componentInstance.currentMessageIndex).toBe(1);
    expect(text(f, '.index-indicator')).toBe('2 of 2');
    expect(text(f, '.subject-line')).toBe('B');
  });

  it('clicking Last jumps to the final message', () => {
    const f = render((c) => {
      c.step = 2;
      c.loading = false;
      c.previewMessages = [makeMessage('A', 'a'), makeMessage('B', 'b'), makeMessage('C', 'c')];
      c.currentMessageIndex = 0;
    });
    vcrButtons(f)[3].click(); // Last
    f.detectChanges();
    expect(f.componentInstance.currentMessageIndex).toBe(2);
    expect(text(f, '.index-indicator')).toBe('3 of 3');
  });

  it('clicking Back (in the preview state) returns to step 1', () => {
    const f = render((c) => {
      c.step = 2;
      c.loading = false;
      c.previewMessages = [makeMessage('A', 'a')];
      c.currentMessageIndex = 0;
    });
    click(f, '.step-2 button'); // the "Back" mjButton precedes the vcr-controls
    expect(f.componentInstance.step).toBe(1);
  });
});
