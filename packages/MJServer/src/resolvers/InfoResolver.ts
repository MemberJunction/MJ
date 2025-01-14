import { Field, ObjectType, Query, Resolver } from 'type-graphql';
import { Public } from '../directives/index.js';
import packageJson from '../../package.json' assert { type: 'json' };

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
    return { Version: packageJson.version };
  }
}
