import { describe, it, expect } from 'vitest';
import { BuildDashboardClassNotRegisteredMessage } from './dashboard-class-resolution';

describe('BuildDashboardClassNotRegisteredMessage', () => {
  const description =
    "ClassFactory: no registration found for base class 'BaseDashboard' with key 'FormsHomeDashboard'. " +
    "Registered keys for 'BaseDashboard': 'HomeDashboard', 'MCPDashboard'.";

  it('names the missing DriverClass and includes the registered-key description', () => {
    const message = BuildDashboardClassNotRegisteredMessage('FormsHomeDashboard', description);
    expect(message).toContain("Dashboard class 'FormsHomeDashboard' is not registered.");
    expect(message).toContain(description);
  });

  it('lists the uninstalled-package, tree-shaken and key-mismatch causes', () => {
    const message = BuildDashboardClassNotRegisteredMessage('FormsHomeDashboard', description);
    expect(message).toContain('not installed in this Explorer');
    expect(message).toContain('tree-shook it out');
    expect(message).toContain('class-registration manifest');
    expect(message).toContain('@RegisterClass key');
  });

  it('no longer sends the reader to only "check the class registration"', () => {
    const message = BuildDashboardClassNotRegisteredMessage('X', description);
    expect(message).not.toContain('Please check the class registration');
  });
});
