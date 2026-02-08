import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before importing the module
vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
    LogError: vi.fn()
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({
    NotificationContent: class {},
    NotificationChannel: {}
}));

import { NotificationManager } from '../NotificationManager';

describe('NotificationManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('SendScheduledJobNotification', () => {
        it('should call LogStatus with user ID', async () => {
            const { LogStatus } = require('@memberjunction/core');
            await NotificationManager.SendScheduledJobNotification(
                'user-123',
                { Subject: 'Test Subject', Body: 'Test body content here', Priority: 'Normal', Metadata: {} },
                ['Email']
            );
            expect(LogStatus).toHaveBeenCalledWith(
                expect.stringContaining('user-123')
            );
        });

        it('should log the subject', async () => {
            const { LogStatus } = require('@memberjunction/core');
            await NotificationManager.SendScheduledJobNotification(
                'user-456',
                { Subject: 'Important Notification', Body: 'Body text for the notification here', Priority: 'High', Metadata: {} },
                ['InApp']
            );
            expect(LogStatus).toHaveBeenCalledWith(
                expect.stringContaining('Important Notification')
            );
        });

        it('should log the channels', async () => {
            const { LogStatus } = require('@memberjunction/core');
            await NotificationManager.SendScheduledJobNotification(
                'user-789',
                { Subject: 'Test', Body: 'Test body content is here', Priority: 'Normal', Metadata: {} },
                ['Email', 'InApp']
            );
            expect(LogStatus).toHaveBeenCalledWith(
                expect.stringContaining('Email, InApp')
            );
        });

        it('should handle Email channel', async () => {
            const { LogStatus } = require('@memberjunction/core');
            await NotificationManager.SendScheduledJobNotification(
                'user-abc',
                { Subject: 'Email Test', Body: 'This is an email body with sufficient content to show', Priority: 'Normal', Metadata: {} },
                ['Email']
            );
            // Should log Email-specific message
            expect(LogStatus).toHaveBeenCalledWith(
                expect.stringContaining('[Email]')
            );
        });

        it('should handle InApp channel', async () => {
            const { LogStatus } = require('@memberjunction/core');
            await NotificationManager.SendScheduledJobNotification(
                'user-def',
                { Subject: 'InApp Test', Body: 'In-app body content of this notification', Priority: 'Normal', Metadata: {} },
                ['InApp']
            );
            // Should log InApp-specific message
            expect(LogStatus).toHaveBeenCalledWith(
                expect.stringContaining('[InApp]')
            );
        });

        it('should handle both Email and InApp channels', async () => {
            const { LogStatus } = require('@memberjunction/core');
            await NotificationManager.SendScheduledJobNotification(
                'user-ghi',
                { Subject: 'Both Channels', Body: 'Body for both channels is contained here', Priority: 'High', Metadata: {} },
                ['Email', 'InApp']
            );
            const emailCall = (LogStatus as ReturnType<typeof vi.fn>).mock.calls.find(
                (c: string[]) => c[0].includes('[Email]')
            );
            const inAppCall = (LogStatus as ReturnType<typeof vi.fn>).mock.calls.find(
                (c: string[]) => c[0].includes('[InApp]')
            );
            expect(emailCall).toBeDefined();
            expect(inAppCall).toBeDefined();
        });

        it('should log priority', async () => {
            const { LogStatus } = require('@memberjunction/core');
            await NotificationManager.SendScheduledJobNotification(
                'user-jkl',
                { Subject: 'Priority Test', Body: 'Priority test body content here', Priority: 'High', Metadata: {} },
                ['Email']
            );
            expect(LogStatus).toHaveBeenCalledWith(
                expect.stringContaining('High')
            );
        });

        it('should handle empty channels array', async () => {
            // Should not throw when no channels provided
            await expect(
                NotificationManager.SendScheduledJobNotification(
                    'user-mno',
                    { Subject: 'No Channels', Body: 'No channels body content here', Priority: 'Normal', Metadata: {} },
                    []
                )
            ).resolves.toBeUndefined();
        });

        it('should not throw for any input combination', async () => {
            await expect(
                NotificationManager.SendScheduledJobNotification(
                    '',
                    { Subject: '', Body: '', Priority: 'Normal', Metadata: {} },
                    []
                )
            ).resolves.toBeUndefined();
        });
    });
});
