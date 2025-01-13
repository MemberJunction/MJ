import { Field, ObjectType, Query, Resolver } from 'type-graphql';
import { Public } from '../directives/index.js';
import { version } from 'pkginfo';

@ObjectType()
export class Info {
  @Field(() => String)
  @Public()
  Version: string;
}

@Resolver(Info)
export class InfoResolver {
  @Query(() => Info)
  @Public()
  async Info() {
    return { Version: version };
  }
}
