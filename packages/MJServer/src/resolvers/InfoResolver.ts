import { Field, ObjectType, Int, Query, Resolver, Ctx, Info as RequestInfo } from 'type-graphql';
import { Public, RequireSystemUser } from '../directives/index.js';
import packageJson from '../../package.json' with { type: 'json' };
import { AppContext } from '../types.js';
import os from 'node:os';

@ObjectType()
export class Info {
  @Public()
  @Field()
  Version: string;
  @Field()
  IsSystemUser: boolean;

  @RequireSystemUser()
  @Field()
  Platform: string;

  @RequireSystemUser()
  @Field()
  Arch: string;

  @RequireSystemUser()
  @Field()
  CpuModel: string;

  @RequireSystemUser()
  @Field()
  Hostname: string;
}

@Resolver(Info)
export class InfoResolver {
  @Public()
  @Query(() => Info)
  Info(@Ctx() context: AppContext): Info {
    return {
      Version: packageJson.version,
      IsSystemUser: Boolean(context.userPayload.isSystemUser),
      Platform: os.platform(),
      Arch: os.platform(),
      CpuModel: os.cpus()?.[0].model,
      Hostname: os.hostname(),
    };
  }
}
