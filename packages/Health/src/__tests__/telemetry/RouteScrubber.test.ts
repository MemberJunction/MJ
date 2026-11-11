import { describe, it, expect } from 'vitest';
import { RouteScrubber, ScrubMjRoute } from '../../telemetry/RouteScrubber';

describe('RouteScrubber.Scrub', () => {
  it('tokenizes a record ID in an app-scoped record route', () => {
    const result = RouteScrubber.Scrub('/app/crm/record/Contacts/4F2B1E3A-0000-0000-0000-000000000001');
    expect(result.RouteTemplate).toBe('app/:appName/record/:entityName/:recordId');
    expect(result.ScrubbedPath).toBe('/app/crm/record/Contacts/_id_');
    expect(result.EntityName).toBe('Contacts');
    expect(result.ApplicationName).toBe('crm');
    expect(result.ScrubbedPath).not.toContain('4F2B1E3A');
  });

  it('tokenizes a record ID in a bare resource record route', () => {
    const result = RouteScrubber.Scrub('resource/record/Invoices/99999999-0000-0000-0000-000000000002');
    expect(result.RouteTemplate).toBe('resource/record/:entityName/:recordId');
    expect(result.ScrubbedPath).toBe('/resource/record/Invoices/_id_');
    expect(result.EntityName).toBe('Invoices');
  });

  it('fully redacts a search term rather than tokenizing it', () => {
    const result = RouteScrubber.Scrub('/resource/search/jane.doe@example.com');
    expect(result.RouteTemplate).toBe('resource/search/:searchInput');
    expect(result.ScrubbedPath).toBe('/resource/search/[REDACTED]');
    expect(result.ScrubbedPath).not.toContain('jane.doe');
  });

  it('tokenizes a view ID', () => {
    const result = RouteScrubber.Scrub('/resource/view/some-saved-view-id');
    expect(result.ScrubbedPath).toBe('/resource/view/_id_');
    expect(result.RouteTemplate).toBe('resource/view/:viewId');
  });

  it('tokenizes a dashboard ID', () => {
    const result = RouteScrubber.Scrub('/resource/dashboard/exec-overview-id');
    expect(result.ScrubbedPath).toBe('/resource/dashboard/_id_');
  });

  it('strips query string parameters entirely, even on a matched route', () => {
    const result = RouteScrubber.Scrub('/resource/record/Contacts/abc-123?tab=details&ref=email-campaign-42');
    expect(result.ScrubbedPath).toBe('/resource/record/Contacts/_id_');
    expect(result.ScrubbedPath).not.toContain('tab');
    expect(result.ScrubbedPath).not.toContain('ref');
  });

  it('strips fragment identifier entirely so hash fragments never leak into ScrubbedPath or EntityName', () => {
    const result = RouteScrubber.Scrub('/resource/record/Contacts/123#jane@example.com');
    expect(result.RouteTemplate).toBe('resource/record/:entityName/:recordId');
    expect(result.ScrubbedPath).toBe('/resource/record/Contacts/_id_');
    expect(result.EntityName).toBe('Contacts');
    expect(result.ScrubbedPath).not.toContain('jane@example.com');

    const appResult = RouteScrubber.Scrub('/app/CRM/record/Leads/42#notes');
    expect(appResult.RouteTemplate).toBe('app/:appName/record/:entityName/:recordId');
    expect(appResult.ScrubbedPath).toBe('/app/CRM/record/Leads/_id_');
    expect(appResult.EntityName).toBe('Leads');
    expect(appResult.ApplicationName).toBe('CRM');
    expect(appResult.ScrubbedPath).not.toContain('notes');
  });

  it('strips both query parameters and fragment when both are present', () => {
    const result = RouteScrubber.Scrub('/resource/record/Contacts/123?q=secret#jane@example.com');
    expect(result.RouteTemplate).toBe('resource/record/:entityName/:recordId');
    expect(result.ScrubbedPath).toBe('/resource/record/Contacts/_id_');
    expect(result.ScrubbedPath).not.toContain('secret');
    expect(result.ScrubbedPath).not.toContain('jane@example.com');
  });

  it('safely decodes percent-encoded path segments', () => {
    const result = RouteScrubber.Scrub('/resource/record/Active%20Users/123');
    expect(result.RouteTemplate).toBe('resource/record/:entityName/:recordId');
    expect(result.ScrubbedPath).toBe('/resource/record/Active Users/_id_');
    expect(result.EntityName).toBe('Active Users');
  });

  it('fails closed on malformed percent-encoded sequences', () => {
    const result = RouteScrubber.Scrub('/resource/record/Contacts/%ZZ/123');
    expect(result.RouteTemplate).toBe('unknown');
    expect(result.ScrubbedPath).toBe('/unknown');
  });

  it('fails closed on path traversal attempts', () => {
    const result = RouteScrubber.Scrub('/resource/record/Contacts/../../etc/passwd');
    expect(result.RouteTemplate).toBe('unknown');
    expect(result.ScrubbedPath).toBe('/unknown');
  });

  it('ScrubMjRoute convenience function matches RouteScrubber.Scrub', () => {
    const result1 = RouteScrubber.Scrub('/resource/view/view-123');
    const result2 = ScrubMjRoute('/resource/view/view-123');
    expect(result2).toEqual(result1);
  });

  it('fails closed on an unrecognized path', () => {
    const result = RouteScrubber.Scrub('/some/totally/custom/admin/route/with/an/id-12345');
    expect(result.RouteTemplate).toBe('unknown');
    expect(result.ScrubbedPath).toBe('/unknown');
  });

  it('fails closed rather than leaking a raw value for an unrecognized path', () => {
    const result = RouteScrubber.Scrub('/billing/invoice/SSN-123-45-6789');
    expect(result.ScrubbedPath).not.toContain('123-45-6789');
    expect(result.ScrubbedPath).toBe('/unknown');
  });
});
