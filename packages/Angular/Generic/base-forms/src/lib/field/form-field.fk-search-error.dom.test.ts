/**
 * DOM spec for a foreign-key lookup that fails or never answers.
 *
 * A failed request must show an error with Retry, never "No matches" (which tells the user the
 * record does not exist) and never an endless "Searching…".
 */
import { describe, it, expect, vi } from 'vitest';
import { Component, Input, Output, EventEmitter, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, text, createFakeProvider } from '@memberjunction/ng-test-utils';
import { BaseEntity, EntityInfo, type IMetadataProvider, type RunViewParams, type RunViewResult } from '@memberjunction/core';

vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    Instance: {
      GetSetting: () => undefined,
      SetSettingDebounced: () => undefined,
    },
  },
}));

import { MjFormFieldComponent } from './form-field.component';

// ---- Inert child stubs (template compile only) ----

@Component({ standalone: true, selector: 'mj-markdown', template: '' })
class StubMarkdownComponent {
  @Input() data = '';
}

@Component({ standalone: true, selector: 'mj-code-editor', template: '' })
class StubCodeEditorComponent {
  @Input() value = '';
  @Input() language = '';
  @Input() readonly = false;
  @Output() change = new EventEmitter<string>();
}

@Pipe({ standalone: true, name: 'mjSafeRichHtml' })
class StubSafeRichHtmlPipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// ---- Fixtures (placeholder data) ----

class TestDealEntity extends BaseEntity {}

const DEAL_ID = '21111111-2222-3333-4444-555555555555';
const CONTACT_ROW = { ID: 'c2111111-0000-0000-0000-000000000001', Name: 'Pat Example', City: 'Springfield' };

function dealEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E1000001-0000-0000-0000-000000000001',
    Name: 'Test Deals',
    Status: 'Active',
    BaseTable: 'TestDeal',
    BaseView: 'vwTestDeals',
    Fields: [
      { ID: 'D1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      {
        ID: 'D2',
        Name: 'ContactID',
        DisplayName: 'Primary Contact',
        Type: 'uniqueidentifier',
        AllowsNull: true,
        AllowUpdateAPI: true,
        RelatedEntity: 'Test Contacts',
        RelatedEntityFieldName: 'ID',
      },
    ],
  });
}

function contactEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E1000002-0000-0000-0000-000000000002',
    Name: 'Test Contacts',
    Status: 'Active',
    BaseTable: 'Contact',
    BaseView: 'vwContacts',
    Fields: [
      { ID: 'C1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
      { ID: 'C2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, IsNameField: true },
      { ID: 'C3', Name: 'City', Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true },
    ],
  });
}

function makeDeal(): BaseEntity {
  const record = new TestDealEntity(dealEntityInfo());
  record.SetMany({ ID: DEAL_ID, ContactID: null }, true, true);
  return record;
}

type RunViewFn = (params: RunViewParams) => Promise<RunViewResult>;

/** A provider whose `RunView` is the given function, so a test decides how each request ends. */
function providerWith(runView: RunViewFn): IMetadataProvider {
  const provider = createFakeProvider({
    entityByName: (name: string) =>
      name === 'Test Contacts' ? contactEntityInfo() : name === 'Test Deals' ? dealEntityInfo() : undefined,
  });
  // The fake's RunView is the seam `RunView.FromMetadataProvider` delegates to; swap it per test.
  (provider as unknown as { RunView: RunViewFn }).RunView = runView;
  return provider;
}

const failed: RunViewFn = async () => ({ Success: false, ErrorMessage: 'Gateway Timeout', Results: [] }) as unknown as RunViewResult;
const succeeded: RunViewFn = async () =>
  ({ Success: true, Results: [CONTACT_ROW], RowCount: 1, TotalRowCount: 1 }) as unknown as RunViewResult;
const neverAnswers: RunViewFn = () => new Promise<RunViewResult>(() => undefined);

function renderField(provider: IMetadataProvider, inputs: Record<string, unknown> = {}): ComponentFixture<MjFormFieldComponent> {
  return renderComponentFixture(MjFormFieldComponent, {
    declarations: [MjFormFieldComponent],
    imports: [CommonModule, StubMarkdownComponent, StubCodeEditorComponent, StubSafeRichHtmlPipe],
    inputs: { Record: makeDeal(), FieldName: 'ContactID', EditMode: true, Provider: provider, ...inputs },
  });
}

async function settle(fixture: ComponentFixture<MjFormFieldComponent>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

async function openDropdown(fixture: ComponentFixture<MjFormFieldComponent>): Promise<void> {
  const input = query(fixture, 'input.mj-forms-field-input');
  if (!input) throw new Error('no FK input rendered');
  input.dispatchEvent(new FocusEvent('focus'));
  await settle(fixture);
}

function pressRetry(fixture: ComponentFixture<MjFormFieldComponent>): MouseEvent {
  const button = query(fixture, '.mj-fk-retry');
  if (!button) throw new Error('no Retry button rendered');
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  button.dispatchEvent(event);
  return event;
}

describe('mj-form-field FK lookup failure', () => {
  it('shows an error with Retry, not "No matches", when the request fails', async () => {
    const f = renderField(providerWith(failed));
    await openDropdown(f);

    expect(f.componentInstance.FKLoading).toBe(false);
    expect(f.componentInstance.FKNoMatches).toBe(false);
    expect(text(f, '.mj-fk-status--error')).toContain('The search failed.');
    expect(query(f, '.mj-fk-retry')).not.toBeNull();
    expect(query(f, '.mj-fk-status--empty')).toBeNull();
  });

  it('still says "No matches" when the request succeeds with no rows', async () => {
    const f = renderField(
      providerWith(async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0 }) as unknown as RunViewResult)
    );
    await openDropdown(f);

    expect(text(f, '.mj-fk-status--empty')).toContain('No matches');
    expect(query(f, '.mj-fk-status--error')).toBeNull();
  });

  it('gives up on a request that never answers and says it took too long', async () => {
    vi.useFakeTimers();
    try {
      const f = renderField(providerWith(neverAnswers), { FKSearchTimeoutMs: 5_000 });
      const input = query(f, 'input.mj-forms-field-input');
      input?.dispatchEvent(new FocusEvent('focus'));
      f.detectChanges();
      expect(f.componentInstance.FKLoading).toBe(true);

      await vi.advanceTimersByTimeAsync(5_000);
      f.detectChanges();

      expect(f.componentInstance.FKLoading).toBe(false);
      // Advancing the clock also ran the panel's portal to <body>, so look for the row there.
      const errorRow = f.nativeElement.querySelector('.mj-fk-status--error') ?? document.body.querySelector('.mj-fk-status--error');
      expect(errorRow?.textContent).toContain('The search took too long.');
      expect(errorRow?.querySelector('.mj-fk-retry')).not.toBeNull();
      f.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Retry runs the search again and shows the rows when it succeeds', async () => {
    let fail = true;
    const f = renderField(providerWith(params => (fail ? failed(params) : succeeded(params))));
    await openDropdown(f);
    expect(query(f, '.mj-fk-status--error')).not.toBeNull();

    fail = false;
    const event = pressRetry(f);
    await settle(f);

    // preventDefault keeps focus in the input, so the blur grace period cannot close the panel.
    expect(event.defaultPrevented).toBe(true);
    expect(query(f, '.mj-fk-status--error')).toBeNull();
    expect(f.componentInstance.FKSuggestions.map(s => s.DisplayName)).toEqual(['Pat Example']);
  });

  it('closing the panel clears the error', async () => {
    const f = renderField(providerWith(failed));
    await openDropdown(f);
    expect(f.componentInstance.FKSearchError).not.toBeNull();

    const input = query(f, 'input.mj-forms-field-input');
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle(f);

    expect(f.componentInstance.FKSearchError).toBeNull();
    expect(f.componentInstance.ShowFKDropdown).toBe(false);
  });
});
