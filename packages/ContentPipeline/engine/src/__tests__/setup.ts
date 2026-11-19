/**
 * @fileoverview Shared test setup for the content pipeline engine.
 *
 * Which entity a source's Content Items are is read from cached AI and knowledge-hub metadata
 * ({@link ItemEntityResolver}). The tests here run against stand-in providers that hold none, and loading
 * those engines through a stand-in would show up as calls the tests do not expect. So every test file
 * starts with the resolver answering plain `MJ: Content Items`. It is replaced on the prototype rather than
 * spied, so a file's `vi.restoreAllMocks()` keeps it. A test about IS-A extensions spies on `Resolve` for
 * its own answer, or calls {@link RealItemEntityResolve} to run the real resolution.
 */
import { BASE_ITEM_ENTITY, ItemEntityResolver, ResolvedItemEntity } from '../ItemEntityResolver.js';

/** The real `Resolve`, for the tests of the resolver itself. */
export const RealItemEntityResolve = ItemEntityResolver.prototype.Resolve;

ItemEntityResolver.prototype.Resolve = async function (): Promise<ResolvedItemEntity> {
    return { EntityName: BASE_ITEM_ENTITY, SetBy: 'Default', IsExtension: false };
};
