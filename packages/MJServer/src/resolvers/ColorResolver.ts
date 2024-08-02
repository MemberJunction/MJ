import { AppContext } from '../types.js';
import { Ctx, Field, Int, ObjectType, PubSub, PubSubEngine, Query, Resolver, Root, Subscription } from 'type-graphql';
import { Public } from '../directives/index.js';

@ObjectType()
export class Color {
  @Field(() => Int)
  @Public()
  ID: number;

  @Field(() => String)
  @Public()
  name: string;

  @Field(() => String)
  @Public()
  createdZ: string;
}

@ObjectType()
export class ColorNotification {
  @Public()
  @Field(() => String, { nullable: true })
  message?: string;

  @Public()
  @Field((_type) => Date)
  date!: Date;
}

export interface ColorNotificationPayload {
  message?: string;
}

@Resolver(Color)
export class ColorResolver {
  @Subscription(() => ColorNotification, { topics: 'COLOR' })
  @Public()
  colorSubscription(@Root() { message }: ColorNotificationPayload): ColorNotification {
    return { message, date: new Date() };
  }

  @Query(() => [Color])
  @Public()
  async colors(@Ctx() _ctx: AppContext, @PubSub() pubSub: PubSubEngine) {
    const createdZ = new Date().toISOString();

    pubSub.publish('COLOR', {
      message: 'Colors were requested!',
    });

    return [
      { ID: 1, name: 'Red', createdZ },
      { ID: 2, name: 'Orange', createdZ },
      { ID: 3, name: 'Yellow', createdZ },
      { ID: 4, name: 'Green', createdZ },
      { ID: 5, name: 'Blue', createdZ },
      { ID: 6, name: 'Purple', createdZ },
    ];
  }
}
