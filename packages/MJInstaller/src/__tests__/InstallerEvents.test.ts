import {
  InstallerEventEmitter,
  type PhaseStartEvent,
  type PhaseEndEvent,
  type StepProgressEvent,
  type LogEvent,
  type WarnEvent,
  type ErrorEvent,
  type PromptEvent,
  type DiagnosticEvent,
} from '../events/InstallerEvents.js';
import { InstallerError } from '../errors/InstallerError.js';

describe('InstallerEventEmitter', () => {
  let emitter: InstallerEventEmitter;

  beforeEach(() => {
    emitter = new InstallerEventEmitter();
  });

  describe('On + Emit', () => {
    it('should deliver the correct payload to a subscribed handler', () => {
      const received: LogEvent[] = [];
      emitter.On('log', (e) => received.push(e));

      const payload: LogEvent = { Type: 'log', Level: 'info', Message: 'hello' };
      emitter.Emit('log', payload);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(payload);
    });

    it('should invoke multiple handlers on the same event type', () => {
      let count = 0;
      emitter.On('log', () => count++);
      emitter.On('log', () => count++);

      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'test' });

      expect(count).toBe(2);
    });
  });

  describe('Off', () => {
    it('should stop delivering events after a handler is removed', () => {
      let callCount = 0;
      const handler = () => {
        callCount++;
      };

      emitter.On('log', handler);
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'first' });
      expect(callCount).toBe(1);

      emitter.Off('log', handler);
      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'second' });
      expect(callCount).toBe(1); // still 1, handler was not called again
    });
  });

  describe('RemoveAllListeners', () => {
    it('should clear all handlers for all event types', () => {
      let logCount = 0;
      let warnCount = 0;

      emitter.On('log', () => logCount++);
      emitter.On('warn', () => warnCount++);

      emitter.RemoveAllListeners();

      emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'test' });
      emitter.Emit('warn', { Type: 'warn', Message: 'test' });

      expect(logCount).toBe(0);
      expect(warnCount).toBe(0);
    });
  });

  describe('event isolation', () => {
    it('should not fire a log handler when warn is emitted', () => {
      let logCalled = false;
      emitter.On('log', () => {
        logCalled = true;
      });

      emitter.Emit('warn', { Type: 'warn', Message: 'a warning' });

      expect(logCalled).toBe(false);
    });

    it('should not throw when emitting with no listeners', () => {
      expect(() => {
        emitter.Emit('log', { Type: 'log', Level: 'info', Message: 'no one listening' });
      }).not.toThrow();
    });
  });

  describe('typed event payloads', () => {
    it('should deliver PhaseStartEvent with correct fields', () => {
      const received: PhaseStartEvent[] = [];
      emitter.On('phase:start', (e) => received.push(e));

      const payload: PhaseStartEvent = {
        Type: 'phase:start',
        Phase: 'scaffold',
        Description: 'Download and extract release',
      };
      emitter.Emit('phase:start', payload);

      expect(received).toHaveLength(1);
      expect(received[0].Type).toBe('phase:start');
      expect(received[0].Phase).toBe('scaffold');
      expect(received[0].Description).toBe('Download and extract release');
    });

    it('should deliver PhaseEndEvent with correct fields', () => {
      const received: PhaseEndEvent[] = [];
      emitter.On('phase:end', (e) => received.push(e));

      const payload: PhaseEndEvent = {
        Type: 'phase:end',
        Phase: 'database',
        Status: 'completed',
        DurationMs: 1234,
      };
      emitter.Emit('phase:end', payload);

      expect(received).toHaveLength(1);
      expect(received[0].Type).toBe('phase:end');
      expect(received[0].Phase).toBe('database');
      expect(received[0].Status).toBe('completed');
      expect(received[0].DurationMs).toBe(1234);
    });

    it('should deliver StepProgressEvent with Percent field', () => {
      const received: StepProgressEvent[] = [];
      emitter.On('step:progress', (e) => received.push(e));

      const payload: StepProgressEvent = {
        Type: 'step:progress',
        Phase: 'dependencies',
        Message: 'Installing packages...',
        Percent: 45,
      };
      emitter.Emit('step:progress', payload);

      expect(received).toHaveLength(1);
      expect(received[0].Percent).toBe(45);
      expect(received[0].Message).toBe('Installing packages...');
    });

    it('should deliver PromptEvent with Resolve callback', () => {
      const received: PromptEvent[] = [];
      emitter.On('prompt', (e) => received.push(e));

      let resolvedValue = '';
      const payload: PromptEvent = {
        Type: 'prompt',
        PromptId: 'db-host',
        PromptType: 'input',
        Message: 'Enter database host:',
        Default: 'localhost',
        Resolve: (answer: string) => {
          resolvedValue = answer;
        },
      };
      emitter.Emit('prompt', payload);

      expect(received).toHaveLength(1);
      expect(received[0].PromptId).toBe('db-host');
      expect(received[0].PromptType).toBe('input');

      // Call the Resolve callback
      received[0].Resolve('myhost.local');
      expect(resolvedValue).toBe('myhost.local');
    });

    it('should deliver DiagnosticEvent with correct fields', () => {
      const received: DiagnosticEvent[] = [];
      emitter.On('diagnostic', (e) => received.push(e));

      const payload: DiagnosticEvent = {
        Type: 'diagnostic',
        Check: 'Node.js version',
        Status: 'pass',
        Message: 'v22.11.0 detected',
      };
      emitter.Emit('diagnostic', payload);

      expect(received).toHaveLength(1);
      expect(received[0].Check).toBe('Node.js version');
      expect(received[0].Status).toBe('pass');
    });

    it('should deliver ErrorEvent with InstallerError payload', () => {
      const received: ErrorEvent[] = [];
      emitter.On('error', (e) => received.push(e));

      const error = new InstallerError('preflight', 'NODE_VERSION', 'Bad version', 'Upgrade Node');
      const payload: ErrorEvent = {
        Type: 'error',
        Error: error,
        Phase: 'preflight',
      };
      emitter.Emit('error', payload);

      expect(received).toHaveLength(1);
      expect(received[0].Error).toBeInstanceOf(InstallerError);
      expect(received[0].Phase).toBe('preflight');
      expect(received[0].Error.Code).toBe('NODE_VERSION');
    });
  });
});
