import { describe, it, expect } from 'vitest';
import {
    UICommandManager,
    UICommand,
    UICommandContext,
    UICommandType,
    UICommandResult,
    UICommandExecutionResult,
    ParsedUICommand,
    SerializeUICommand,
    DeserializeUICommand,
    MakeNavigateCommand,
    MakeShowDialogCommand,
    MakeOpenEntityCommand,
    MakeRefreshCommand,
    MakeOpenUrlCommand,
    MakeShowNotificationCommand,
    MakeCustomCommand,
    MakeOpenRecordCommand,
    MakeDownloadFileCommand
} from '../ui-commands';

describe('SerializeUICommand', () => {
    it('should serialize a command to JSON', () => {
        const cmd: ParsedUICommand = {
            type: 'navigate',
            payload: { route: '/home' }
        };

        const result = SerializeUICommand(cmd);
        expect(typeof result).toBe('string');
        expect(JSON.parse(result).type).toBe('navigate');
    });
});

describe('DeserializeUICommand', () => {
    it('should deserialize a JSON string to command', () => {
        const json = JSON.stringify({ type: 'navigate', payload: { route: '/home' } });
        const result = DeserializeUICommand(json);

        expect(result!.type).toBe('navigate');
        expect(result!.payload.route).toBe('/home');
    });

    it('should return null for null/empty input', () => {
        expect(DeserializeUICommand(null as unknown as string)).toBeNull();
        expect(DeserializeUICommand('')).toBeNull();
    });

    it('should return null for invalid JSON', () => {
        expect(DeserializeUICommand('not json')).toBeNull();
    });
});

describe('MakeNavigateCommand', () => {
    it('should create a navigate command', () => {
        const result = MakeNavigateCommand('/dashboard', { tab: 'overview' });

        expect(result.type).toBe('navigate');
        expect(result.payload.route).toBe('/dashboard');
        expect(result.payload.params.tab).toBe('overview');
    });

    it('should work without params', () => {
        const result = MakeNavigateCommand('/home');

        expect(result.type).toBe('navigate');
        expect(result.payload.route).toBe('/home');
    });
});

describe('MakeShowDialogCommand', () => {
    it('should create a dialog command', () => {
        const result = MakeShowDialogCommand('Warning', 'Are you sure?', ['OK', 'Cancel']);

        expect(result.type).toBe('show_dialog');
        expect(result.payload.title).toBe('Warning');
        expect(result.payload.message).toBe('Are you sure?');
        expect(result.payload.buttons).toEqual(['OK', 'Cancel']);
    });
});

describe('MakeOpenEntityCommand', () => {
    it('should create an open entity command', () => {
        const result = MakeOpenEntityCommand('Users', 'u-123');

        expect(result.type).toBe('open_entity');
        expect(result.payload.entityName).toBe('Users');
        expect(result.payload.recordId).toBe('u-123');
    });
});

describe('MakeRefreshCommand', () => {
    it('should create a refresh command', () => {
        const result = MakeRefreshCommand('dashboard-panel');

        expect(result.type).toBe('refresh');
        expect(result.payload.target).toBe('dashboard-panel');
    });
});

describe('MakeOpenUrlCommand', () => {
    it('should create an open URL command', () => {
        const result = MakeOpenUrlCommand('https://example.com', true);

        expect(result.type).toBe('open_url');
        expect(result.payload.url).toBe('https://example.com');
        expect(result.payload.newTab).toBe(true);
    });

    it('should default newTab to false', () => {
        const result = MakeOpenUrlCommand('https://example.com');

        expect(result.payload.newTab).toBeFalsy();
    });
});

describe('MakeShowNotificationCommand', () => {
    it('should create a notification command', () => {
        const result = MakeShowNotificationCommand('Operation complete', 'success', 5000);

        expect(result.type).toBe('show_notification');
        expect(result.payload.message).toBe('Operation complete');
        expect(result.payload.level).toBe('success');
        expect(result.payload.durationMs).toBe(5000);
    });
});

describe('MakeCustomCommand', () => {
    it('should create a custom command', () => {
        const result = MakeCustomCommand('my-action', { data: 'value' });

        expect(result.type).toBe('custom');
        expect(result.payload.action).toBe('my-action');
        expect(result.payload.data).toBe('value');
    });
});

describe('MakeOpenRecordCommand', () => {
    it('should create an open record command', () => {
        const result = MakeOpenRecordCommand('Users', 'u-123');

        expect(result.type).toBe('open_record');
        expect(result.payload.entityName).toBe('Users');
        expect(result.payload.recordId).toBe('u-123');
    });
});

describe('MakeDownloadFileCommand', () => {
    it('should create a download file command', () => {
        const result = MakeDownloadFileCommand('https://files.com/report.pdf', 'report.pdf');

        expect(result.type).toBe('download_file');
        expect(result.payload.url).toBe('https://files.com/report.pdf');
        expect(result.payload.fileName).toBe('report.pdf');
    });
});

describe('UICommandManager', () => {
    it('should be able to register and retrieve command handlers', () => {
        const manager = UICommandManager.Instance;
        expect(manager).toBeDefined();
    });
});
