import { GenericDatabaseProvider } from '../../GenericDatabaseProvider';

/**
 * Test-only base that stubs the four physical-transaction hooks. Production
 * subclasses (SQL Server, PostgreSQL) implement them for real.
 */
export abstract class GenericDatabaseProviderTestBase extends GenericDatabaseProvider {
    protected override get HasPhysicalTransaction(): boolean {
        return false;
    }
    protected override async BeginPhysicalTransaction(): Promise<void> {
        /* no-op */
    }
    protected override async CommitPhysicalTransaction(): Promise<void> {
        /* no-op */
    }
    protected override async RollbackPhysicalTransaction(): Promise<void> {
        /* no-op */
    }
}
