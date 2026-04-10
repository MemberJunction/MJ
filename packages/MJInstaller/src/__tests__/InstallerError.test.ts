import { InstallerError, type PhaseId } from '../errors/InstallerError.js';

describe('InstallerError', () => {
  const phase: PhaseId = 'preflight';
  const code = 'NODE_VERSION';
  const message = 'Node.js v16 found, but >= 22 is required.';
  const suggestedFix = 'Download Node.js 22 LTS from https://nodejs.org';

  describe('constructor', () => {
    it('should set Phase from the first argument', () => {
      const err = new InstallerError(phase, code, message, suggestedFix);
      expect(err.Phase).toBe('preflight');
    });

    it('should set Code from the second argument', () => {
      const err = new InstallerError(phase, code, message, suggestedFix);
      expect(err.Code).toBe('NODE_VERSION');
    });

    it('should set SuggestedFix from the fourth argument', () => {
      const err = new InstallerError(phase, code, message, suggestedFix);
      expect(err.SuggestedFix).toBe(suggestedFix);
    });

    it('should set name to "InstallerError"', () => {
      const err = new InstallerError(phase, code, message, suggestedFix);
      expect(err.name).toBe('InstallerError');
    });

    it('should inherit message from Error via super()', () => {
      const err = new InstallerError(phase, code, message, suggestedFix);
      expect(err.message).toBe(message);
    });
  });

  describe('inheritance', () => {
    it('should be an instance of Error', () => {
      const err = new InstallerError(phase, code, message, suggestedFix);
      expect(err).toBeInstanceOf(Error);
    });

    it('should be an instance of InstallerError', () => {
      const err = new InstallerError(phase, code, message, suggestedFix);
      expect(err).toBeInstanceOf(InstallerError);
    });

    it('should have a stack trace', () => {
      const err = new InstallerError(phase, code, message, suggestedFix);
      expect(err.stack).toBeDefined();
      expect(typeof err.stack).toBe('string');
      expect(err.stack!.length).toBeGreaterThan(0);
    });
  });

  describe('PhaseId coverage', () => {
    const allPhases: PhaseId[] = [
      'preflight',
      'scaffold',
      'database',
      'migrate',
      'configure',
      'platform',
      'dependencies',
      'codegen',
      'smoke_test',
    ];

    it.each(allPhases)('should accept "%s" as a valid PhaseId', (phaseId) => {
      const err = new InstallerError(phaseId, 'TEST_CODE', 'test message', 'test fix');
      expect(err.Phase).toBe(phaseId);
    });
  });
});
