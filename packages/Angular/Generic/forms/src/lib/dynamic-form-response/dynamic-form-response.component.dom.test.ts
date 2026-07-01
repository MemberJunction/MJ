import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import type { AgentResponseForm } from '@memberjunction/ai-core-plus';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { DynamicFormResponseComponent } from './dynamic-form-response.component';

/**
 * DOM spec for <mj-dynamic-form-response> — the read-only response renderer.
 * Pure @Input-driven, no child components: validates @if(HasData) gating, the
 * pill-vs-card branch (IsSingleField), field text rendering, and label resolution
 * from the optional FormDefinition schema.
 */
describe('DynamicFormResponseComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown>) =>
    renderComponentFixture(DynamicFormResponseComponent, {
      imports: [CommonModule],
      declarations: [DynamicFormResponseComponent],
      inputs,
    });

  it('renders nothing when there is no response data', () => {
    const f = render({ ResponseData: null });
    expect(query(f, '.form-response-pill')).toBeNull();
  });

  it('renders nothing when the response object is empty / all-blank', () => {
    const f = render({ ResponseData: { a: '', b: null } });
    expect(query(f, '.form-response-pill')).toBeNull();
  });

  it('renders a single-field inline pill for one value (auto mode)', () => {
    const f = render({ ResponseData: { rating: 'Excellent' } });
    expect(query(f, '.form-response-pill.single-field')).not.toBeNull();
    expect(query(f, '.form-response-pill.multi-field')).toBeNull();
    expect(text(f, '.form-response-pill.single-field')).toContain('Excellent');
  });

  it('renders a multi-field card with one row per field (auto mode)', () => {
    const f = render({ ResponseData: { name: 'Acme', city: 'NYC' } });
    expect(query(f, '.form-response-pill.multi-field')).not.toBeNull();
    expect(query(f, '.form-response-pill.single-field')).toBeNull();
    expect(queryAll(f, '.pill-field').length).toBe(2);
  });

  it('forces card layout when DisplayMode is "card" even for a single field', () => {
    const f = render({ ResponseData: { rating: 'Good' }, DisplayMode: 'card' });
    expect(query(f, '.form-response-pill.multi-field')).not.toBeNull();
    expect(query(f, '.form-response-pill.single-field')).toBeNull();
  });

  it('forces pill layout when DisplayMode is "pill" even for multiple fields', () => {
    const f = render({ ResponseData: { name: 'Acme', city: 'NYC' }, DisplayMode: 'pill' });
    expect(query(f, '.form-response-pill.single-field')).not.toBeNull();
    expect(query(f, '.form-response-pill.multi-field')).toBeNull();
  });

  it('humanizes the key as the field label when no schema is supplied', () => {
    const f = render({ ResponseData: { companyName: 'Acme', city: 'NYC' } });
    const labels = queryAll(f, '.field-question').map((e) => e.textContent?.trim());
    expect(labels).toContain('Company Name');
  });

  it('uses the schema question label when a FormDefinition is supplied', () => {
    const schema: AgentResponseForm = {
      title: 'Survey',
      questions: [
        { id: 'q1', label: 'How satisfied are you?', type: { type: 'text' } },
        { id: 'q2', label: 'Any comments?', type: { type: 'text' } },
      ],
    };
    const f = render({ FormDefinition: schema, ResponseData: { q1: 'Very', q2: 'None' } });
    const labels = queryAll(f, '.field-question').map((e) => e.textContent?.trim());
    expect(labels).toContain('How satisfied are you?');
    expect(labels).toContain('Any comments?');
  });

  it('renders the multi-field card header from the schema title', () => {
    const schema: AgentResponseForm = {
      title: 'Onboarding Form',
      questions: [
        { id: 'q1', label: 'Name', type: { type: 'text' } },
        { id: 'q2', label: 'City', type: { type: 'text' } },
      ],
    };
    const f = render({ FormDefinition: schema, ResponseData: { q1: 'Acme', q2: 'NYC' } });
    expect(text(f, '.pill-header')).toContain('Onboarding Form');
  });

  it('prefers an explicit Title input over the schema title in the card header', () => {
    const schema: AgentResponseForm = {
      title: 'Schema Title',
      questions: [
        { id: 'q1', label: 'Name', type: { type: 'text' } },
        { id: 'q2', label: 'City', type: { type: 'text' } },
      ],
    };
    const f = render({ FormDefinition: schema, Title: 'Custom Title', ResponseData: { q1: 'A', q2: 'B' } });
    expect(text(f, '.pill-header')).toContain('Custom Title');
  });

  it('parses a JSON-string ResponseData input', () => {
    const f = render({ ResponseData: JSON.stringify({ rating: 'Top' }) });
    expect(text(f, '.form-response-pill.single-field')).toContain('Top');
  });

  it('renders nothing for an unparseable JSON string', () => {
    const f = render({ ResponseData: '{not valid json' });
    expect(query(f, '.form-response-pill')).toBeNull();
  });
});
