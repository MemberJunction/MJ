import '@memberjunction/ai-agents';
import { RubricCommands as RubricCatalog } from '@memberjunction/rubrics';
import { CloseMJProvider, GetContextUser, GetMJProvider, InitializeMJProvider } from '../lib/mj-provider';

/** Opens the provider, runs the command in `@memberjunction/rubrics`, and closes the provider. */
export class RubricCommands {
    public async List(): Promise<void> {
        try {
            const catalog = await this.catalog();
            await catalog.List();
        } finally {
            await CloseMJProvider();
        }
    }

    public async Show(ref: string): Promise<void> {
        try {
            const catalog = await this.catalog();
            await catalog.Show(ref);
        } finally {
            await CloseMJProvider();
        }
    }

    public async Diff(ref: string, from: string, to: string): Promise<void> {
        try {
            const catalog = await this.catalog();
            await catalog.Diff(ref, from, to);
        } finally {
            await CloseMJProvider();
        }
    }

    public Validate(file: string): void {
        RubricCatalog.Validate(file);
    }

    public async Evaluate(ref: string, entity: string, record: string, evaluator: string | undefined): Promise<void> {
        try {
            const catalog = await this.catalog();
            await catalog.Evaluate(ref, entity, record, evaluator);
        } finally {
            await CloseMJProvider();
        }
    }

    private async catalog(): Promise<RubricCatalog> {
        await InitializeMJProvider();
        return new RubricCatalog(GetMJProvider(), await GetContextUser());
    }
}
