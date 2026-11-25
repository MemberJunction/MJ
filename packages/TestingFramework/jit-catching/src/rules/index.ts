import type { BaseCatchRule } from '../contracts/BaseCatchRule';
import { PrivateAccess } from './drop/PrivateAccess';
import { InternalCallCounting } from './drop/InternalCallCounting';
import { BrokenMock } from './drop/BrokenMock';
import { OrderSensitive } from './drop/OrderSensitive';
import { NotImplemented } from './drop/NotImplemented';
import { TestOwnError } from './drop/TestOwnError';
import { RunnerInfrastructure } from './drop/RunnerInfrastructure';
import { NoBehaviorChangeExpected } from './boost/NoBehaviorChangeExpected';
import { AdditiveChangeBrokeOutput } from './boost/AdditiveChangeBrokeOutput';
import { AccessChange } from './boost/AccessChange';
import { UnexpectedEmpty } from './boost/UnexpectedEmpty';
import { SaveFailure } from './boost/SaveFailure';
import { MatchesRisk } from './boost/MatchesRisk';

export { RuleFilter, type FilterResult } from './RuleFilter';
/** Every §9.1 rule: drop rules first, then boost rules. */
export function AllRules(): BaseCatchRule[] {
    return [new PrivateAccess(), new InternalCallCounting(), new BrokenMock(), new OrderSensitive(), new NotImplemented(), new TestOwnError(), new RunnerInfrastructure(),
        new NoBehaviorChangeExpected(), new AdditiveChangeBrokeOutput(), new AccessChange(), new UnexpectedEmpty(), new SaveFailure(), new MatchesRisk()];
}
