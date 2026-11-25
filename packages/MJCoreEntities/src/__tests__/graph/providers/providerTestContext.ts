import type { UserInfo } from '@memberjunction/core';
import type { MJGraphEntity } from '../../../generated/entity_subclasses';
import type { GraphProviderContext } from '../../../graph/BaseGraphEdgeProvider';
import { FakeGraphProvider, IDS, MakeUser } from '../graphTestFixtures';

export const Caller: UserInfo = MakeUser('u-caller', ['Analyst']);

/** A provider context over `provider` for the test graph, run as {@link Caller}. */
export function Ctx<TConfig>(provider: FakeGraphProvider, config: TConfig): GraphProviderContext<TConfig> {
    return {
        Graph: { ID: IDS.GraphCanon, Name: 'Test Graph' } as MJGraphEntity,
        Config: config,
        User: Caller,
        Provider: provider as unknown as GraphProviderContext<TConfig>['Provider'],
    };
}
