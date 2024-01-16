import { Arg, Field, ID, ObjectType, Resolver, ResolverFilterData, Root, Subscription } from 'type-graphql';

export const PUSH_STATUS_UPDATES_TOPIC = 'PUSH_STATUS_UPDATES';

@ObjectType()
export class PushStatusNotification {
  @Field(() => String, { nullable: true })
  message?: string;

  @Field((_type) => Date)
  date!: Date;

  @Field((_type) => ID)
  sessionId!: string;
}

export interface PushStatusNotificationPayload {
  message?: string;
  sessionId: string;
}

interface PushStatusNotificationArgs {
  sessionId: string;
}

@Resolver()
export class PushStatusResolver {
  @Subscription(() => PushStatusNotification, {
    topics: PUSH_STATUS_UPDATES_TOPIC,
    filter: ({ payload, args, context }: ResolverFilterData<PushStatusNotificationPayload, PushStatusNotificationArgs, any>) => {
      console.log('context', context);
      return payload.sessionId === args.sessionId;
    },
  })
  statusUpdates(
    @Root() { message }: PushStatusNotificationPayload,
    @Arg('sessionId', () => String) sessionId: string
  ): PushStatusNotification {
    return { message, date: new Date(), sessionId };
  }
}
