import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockResolutionResult {
    Resolved: boolean;
    Instance: unknown;
    Reason?: string;
}

const mockTryCreateInstance = vi.fn((..._args: unknown[]): MockResolutionResult => ({ Resolved: false, Instance: null }));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class MockMetadata {},
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                TryCreateInstance: (...args: unknown[]) => mockTryCreateInstance(...args),
            },
        },
    },
    RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('../DefaultArchiveDriver', () => ({
    DefaultArchiveDriver: class MockDefaultArchiveDriver {
        readonly Kind = 'default';
    },
}));

describe('ResolveArchiveDriver', () => {
    beforeEach(() => {
        mockTryCreateInstance.mockReset();
    });

    it('should return the DefaultArchiveDriver when no class name is given', async () => {
        const { ResolveArchiveDriver } = await import('../ArchiveDriverResolver');
        const driver = ResolveArchiveDriver(null) as unknown as { Kind: string };
        expect(driver.Kind).toBe('default');
        expect(mockTryCreateInstance).not.toHaveBeenCalled();
    });

    it('should return the DefaultArchiveDriver when the class name is empty', async () => {
        const { ResolveArchiveDriver } = await import('../ArchiveDriverResolver');
        const driver = ResolveArchiveDriver('') as unknown as { Kind: string };
        expect(driver.Kind).toBe('default');
        expect(mockTryCreateInstance).not.toHaveBeenCalled();
    });

    it('should return the registered driver when the class name resolves', async () => {
        const registered = { Kind: 'custom' };
        mockTryCreateInstance.mockReturnValue({ Resolved: true, Instance: registered });
        const { ResolveArchiveDriver } = await import('../ArchiveDriverResolver');
        const { BaseArchiveDriver } = await import('../BaseArchiveDriver');

        expect(ResolveArchiveDriver('CustomDriver')).toBe(registered);
        expect(mockTryCreateInstance).toHaveBeenCalledWith(BaseArchiveDriver, 'CustomDriver');
    });

    it('should return null when the class name is not registered', async () => {
        mockTryCreateInstance.mockReturnValue({ Resolved: false, Instance: { Kind: 'hollow-base' }, Reason: 'no registration' });
        const { ResolveArchiveDriver } = await import('../ArchiveDriverResolver');
        expect(ResolveArchiveDriver('MissingDriver')).toBeNull();
    });
});
