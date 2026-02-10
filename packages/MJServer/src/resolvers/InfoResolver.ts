import { Field, ObjectType, Int, Query, Resolver, Ctx, Info as RequestInfo } from 'type-graphql';
import { Public, RequireSystemUser } from '../directives/index.js';
import { createRequire } from 'node:module';
import { AppContext } from '../types.js';
import os from 'node:os';

// Use createRequire to import JSON (compatible with module: es2022)
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

@ObjectType()
export class ServerInfo {
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

@Resolver(ServerInfo)
export class InfoResolver {
  @Public()
  @Query(() => ServerInfo)
  Info(@Ctx() context: AppContext): ServerInfo {
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
