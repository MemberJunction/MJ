import { Diagnostics, type DiagnosticCheck, type EnvironmentInfo } from '../models/Diagnostics.js';

describe('Diagnostics', () => {
  const environment: EnvironmentInfo = {
    OS: 'win32 10.0.19045 (x64)',
    NodeVersion: 'v22.11.0',
    NpmVersion: '10.9.0',
    Architecture: 'x64',
  };

  describe('constructor', () => {
    it('should set Environment from the argument', () => {
      const diag = new Diagnostics(environment);
      expect(diag.Environment).toBe(environment);
      expect(diag.Environment.OS).toBe('win32 10.0.19045 (x64)');
      expect(diag.Environment.NodeVersion).toBe('v22.11.0');
    });
  });

  describe('Checks', () => {
    it('should start as an empty array', () => {
      const diag = new Diagnostics(environment);
      expect(diag.Checks).toEqual([]);
      expect(diag.Checks).toHaveLength(0);
    });
  });

  describe('HasFailures', () => {
    it('should be false with no checks', () => {
      const diag = new Diagnostics(environment);
      expect(diag.HasFailures).toBe(false);
    });

    it('should be true after adding a "fail" check', () => {
      const diag = new Diagnostics(environment);
      diag.AddCheck({
        Name: 'Disk space',
        Status: 'fail',
        Message: 'Only 0.5 GB free',
        SuggestedFix: 'Free up disk space',
      });
      expect(diag.HasFailures).toBe(true);
    });

    it('should be false with only "pass" and "warn" checks', () => {
      const diag = new Diagnostics(environment);
      diag.AddCheck({ Name: 'Node.js', Status: 'pass', Message: 'v22.11.0' });
      diag.AddCheck({ Name: 'npm cache', Status: 'warn', Message: 'Cache is large' });
      expect(diag.HasFailures).toBe(false);
    });
  });

  describe('Failures', () => {
    it('should return only checks with "fail" status', () => {
      const diag = new Diagnostics(environment);
      diag.AddCheck({ Name: 'Node.js', Status: 'pass', Message: 'OK' });
      diag.AddCheck({ Name: 'Disk', Status: 'fail', Message: 'Low space' });
      diag.AddCheck({ Name: 'Ports', Status: 'warn', Message: 'Port 4000 in use' });
      diag.AddCheck({ Name: 'SQL', Status: 'fail', Message: 'Cannot connect' });

      const failures = diag.Failures;
      expect(failures).toHaveLength(2);
      expect(failures[0].Name).toBe('Disk');
      expect(failures[1].Name).toBe('SQL');
      expect(failures.every((c: DiagnosticCheck) => c.Status === 'fail')).toBe(true);
    });
  });

  describe('Warnings', () => {
    it('should return only checks with "warn" status', () => {
      const diag = new Diagnostics(environment);
      diag.AddCheck({ Name: 'Node.js', Status: 'pass', Message: 'OK' });
      diag.AddCheck({ Name: 'Ports', Status: 'warn', Message: 'Port 4000 in use' });
      diag.AddCheck({ Name: 'SQL', Status: 'fail', Message: 'Cannot connect' });
      diag.AddCheck({ Name: 'npm cache', Status: 'warn', Message: 'Large cache' });

      const warnings = diag.Warnings;
      expect(warnings).toHaveLength(2);
      expect(warnings[0].Name).toBe('Ports');
      expect(warnings[1].Name).toBe('npm cache');
      expect(warnings.every((c: DiagnosticCheck) => c.Status === 'warn')).toBe(true);
    });
  });

  describe('AddCheck', () => {
    it('should accumulate checks in insertion order', () => {
      const diag = new Diagnostics(environment);

      const check1: DiagnosticCheck = { Name: 'First', Status: 'pass', Message: 'OK' };
      const check2: DiagnosticCheck = { Name: 'Second', Status: 'warn', Message: 'Hmm' };
      const check3: DiagnosticCheck = { Name: 'Third', Status: 'fail', Message: 'Bad' };

      diag.AddCheck(check1);
      diag.AddCheck(check2);
      diag.AddCheck(check3);

      expect(diag.Checks).toHaveLength(3);
      expect(diag.Checks[0].Name).toBe('First');
      expect(diag.Checks[1].Name).toBe('Second');
      expect(diag.Checks[2].Name).toBe('Third');
    });
  });

  describe('LastInstall', () => {
    it('should be undefined by default', () => {
      const diag = new Diagnostics(environment);
      expect(diag.LastInstall).toBeUndefined();
    });
  });
});
