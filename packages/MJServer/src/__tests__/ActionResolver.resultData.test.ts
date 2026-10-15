// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi } from 'vitest';

// As in ActionResolver.authorization.test.ts: the decorators are no-ops so the resolver loads as a plain class.
vi.mock('type-graphql', () => {
  const noopDecorator = () => () => undefined;
  return {
    Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
    ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
    Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
    Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
    createUnionType: () => class {},
    AuthorizationError: class AuthorizationError extends Error {},
    Float: class {}, Int: class {}, ID: class {},
  };
});

import type { ActionParam } from '@memberjunction/actions-base';
import { ActionResolver } from '../resolvers/ActionResolver.js';

describe('ActionResolver.SerializeOutputParams', () => {
  const params: ActionParam[] = [
    { Name: 'RecordProcessID', Type: 'Input', Value: '7E030001-A101-4B01-8C01-000000000001' },
    { Name: 'ProcessRunID', Type: 'Output', Value: 'A999753D-3FF3-40B8-8A63-A948ACC9CB7E' },
    { Name: 'Processed', Type: 'Output', Value: 1 },
    { Name: 'Echo', Type: 'Both', Value: { Nested: [1, 2] } },
  ];

  it('returns a JSON array of the Output and Both params, in order, without the inputs', () => {
    const parsed: unknown = JSON.parse(ActionResolver.SerializeOutputParams(params) || 'null');

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual([
      { Name: 'ProcessRunID', Type: 'Output', Value: 'A999753D-3FF3-40B8-8A63-A948ACC9CB7E' },
      { Name: 'Processed', Type: 'Output', Value: 1 },
      { Name: 'Echo', Type: 'Both', Value: { Nested: [1, 2] } },
    ]);
  });

  it('returns undefined when the run has no output params', () => {
    expect(ActionResolver.SerializeOutputParams([{ Name: 'In', Type: 'Input', Value: 1 }])).toBeUndefined();
    expect(ActionResolver.SerializeOutputParams([])).toBeUndefined();
  });
});
