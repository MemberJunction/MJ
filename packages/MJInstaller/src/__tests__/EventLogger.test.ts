import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventLogger, type LogEntry } from '../logging/EventLogger.js';
import { InstallerEventEmitter } from '../events/InstallerEvents.js';
import { InstallerError } from '../errors/InstallerError.js';

describe('EventLogger', () => {
  let logger: EventLogger;
  let emitter: InstallerEventEmitter;

  beforeEach(() => {
    logger = new EventLogger();
    emitter = new InstallerEventEmitter();
  });

  describe('Attach/Detach', () => {
    it('should capture events after attaching', () => {
      logger.Attach(emitter);
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'test message' });
      expect(logger.Count).toBe(1);
      expect(logger.Entries[0].Message).toBe('test message');
      logger.Detach();
    });

    it('should not capture events after detaching', () => {
      logger.Attach(emitter);
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'first' });
      logger.Detach();
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'second' });
      expect(logger.Count).toBe(1);
    });

    it('should handle multiple detach calls safely', () => {
      logger.Attach(emitter);
      logger.Detach();
      logger.Detach();
      expect(logger.Count).toBe(0);
    });
  });

  describe('Event capturing', () => {
    beforeEach(() => {
      logger.Attach(emitter);
    });

    it('should capture phase:start events', () => {
      emitter.Emit('phase:start', { Type: 'phase:start', Phase: 'preflight', Description: 'Check prerequisites' });
      expect(logger.Count).toBe(1);
      expect(logger.Entries[0].Level).toBe('info');
      expect(logger.Entries[0].Phase).toBe('preflight');
      expect(logger.Entries[0].Source).toBe('phase:start');
      expect(logger.Entries[0].Message).toContain('Check prerequisites');
    });

    it('should capture phase:end completed events', () => {
      emitter.Emit('phase:end', { Type: 'phase:end', Phase: 'scaffold', Status: 'completed', DurationMs: 5000 });
      expect(logger.Entries[0].Level).toBe('info');
      expect(logger.Entries[0].Message).toContain('completed');
      expect(logger.Entries[0].Message).toContain('5s');
    });

    it('should capture phase:end failed events with error details', () => {
      const error = new InstallerError('dependencies', 'NPM_INSTALL_FAILED', 'npm install failed', 'Run npm install manually');
      emitter.Emit('phase:end', { Type: 'phase:end', Phase: 'dependencies', Status: 'failed', DurationMs: 2000, Error: error });
      const entries = logger.Entries;
      expect(entries[0].Level).toBe('error');
      expect(entries[0].Message).toContain('NPM_INSTALL_FAILED');
      expect(entries[1].Message).toContain('Run npm install manually');
    });

    it('should capture step:progress events as verbose', () => {
      emitter.Emit('step:progress', { Type: 'step:progress', Phase: 'dependencies', Message: 'Installing packages...', Percent: 45 });
      expect(logger.Entries[0].Level).toBe('verbose');
      expect(logger.Entries[0].Message).toContain('45%');
    });

    it('should capture log events at correct level', () => {
      emitter.Emit('log', { Type: 'log', Level: 'verbose', Message: 'verbose msg' });
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'info msg' });
      expect(logger.Entries[0].Level).toBe('verbose');
      expect(logger.Entries[1].Level).toBe('info');
    });

    it('should capture warn events', () => {
      emitter.Emit('warn', { Type: 'warn', Phase: 'configure', Message: 'Auth not configured' });
      expect(logger.Entries[0].Level).toBe('warn');
      expect(logger.Entries[0].Phase).toBe('configure');
    });

    it('should capture error events', () => {
      const error = new InstallerError('preflight', 'NODE_VERSION', 'Node too old', 'Update Node.js');
      emitter.Emit('error', { Type: 'error', Phase: 'preflight', Error: error });
      expect(logger.Entries[0].Level).toBe('error');
      expect(logger.Entries[0].Message).toContain('NODE_VERSION');
    });

    it('should capture prompt events', () => {
      emitter.Emit('prompt', {
        Type: 'prompt',
        PromptId: 'db-host',
        PromptType: 'input',
        Message: 'Enter database host:',
        Default: 'localhost',
        Resolve: () => {},
      });
      expect(logger.Entries[0].Level).toBe('prompt');
      expect(logger.Entries[0].Message).toContain('db-host');
    });

    it('should capture diagnostic events', () => {
      emitter.Emit('diagnostic', { Type: 'diagnostic', Check: 'Node.js version', Status: 'pass', Message: 'Node.js v22.11.0' });
      expect(logger.Entries[0].Level).toBe('info');
      expect(logger.Entries[0].Message).toContain('[PASS]');
    });

    it('should include timestamps on all entries', () => {
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'test' });
      expect(logger.Entries[0].Timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      logger.Attach(emitter);
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'info' });
      emitter.Emit('warn', { Type: 'warn', Phase: 'configure', Message: 'warn' });
      emitter.Emit('log', { Type: 'log', Level: 'verbose', Message: 'verbose' });
    });

    it('should filter by level', () => {
      expect(logger.GetByLevel('info')).toHaveLength(1);
      expect(logger.GetByLevel('warn')).toHaveLength(1);
      expect(logger.GetByLevel('verbose')).toHaveLength(1);
      expect(logger.GetByLevel('error')).toHaveLength(0);
    });

    it('should filter by phase', () => {
      expect(logger.GetByPhase('configure')).toHaveLength(1);
      expect(logger.GetByPhase('preflight')).toHaveLength(0);
    });
  });

  describe('Clear', () => {
    it('should remove all entries', () => {
      logger.Attach(emitter);
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'a' });
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'b' });
      expect(logger.Count).toBe(2);
      logger.Clear();
      expect(logger.Count).toBe(0);
    });
  });

  describe('Buffer overflow', () => {
    it('should not grow beyond max entries', () => {
      logger.Attach(emitter);
      // Emit more than the max (5000)
      for (let i = 0; i < 5100; i++) {
        emitter.Emit('log', { Type: 'log', Level: 'info', Message: `msg ${i}` });
      }
      // Should have trimmed oldest 10% (500) at overflow, then continued adding
      expect(logger.Count).toBeLessThanOrEqual(5000);
      expect(logger.Count).toBeGreaterThan(4000);
    });
  });
});
