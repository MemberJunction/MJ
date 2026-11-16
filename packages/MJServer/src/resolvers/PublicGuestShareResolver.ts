import { Arg, Ctx, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { type GuestFrozenProvenanceItem } from '@memberjunction/core-entities';
import { Public } from '../directives/index.js';
import { AppContext } from '../types.js';
import { GetReadOnlyProvider } from '../util.js';
import {
    BuildGuestShareRateLimitKey,
    ListArtifactGuestShareLinksForOwner,
    ResolveGuestShareProviderFallback,
    ResolvePublicArtifactGuestShareData,
} from '../operations/ArtifactGuestShareServerOperations.js';
import { ResolverBase } from '../generic/ResolverBase.js';

@ObjectType()
export class GuestFrozenProvenanceResult {
    @Field(() => String)
    TargetType!: GuestFrozenProvenanceItem['TargetType'];

    @Field(() => String)
    TargetID!: string;

    @Field(() => String, { nullable: true })
    ArtifactID?: string;

    @Field(() => String, { nullable: true })
    BlockID?: string;

    @Field(() => String, { nullable: true })
    SlideID?: string;

    @Field(() => String, { nullable: true })
    RegionID?: string;

    @Field(() => String, { nullable: true })
    LiveTableID?: string;

    @Field(() => Boolean)
    SnapshotVerified!: boolean;

    @Field(() => String)
    FrozenByUserName!: string;

    @Field(() => String)
    FrozenAt!: string;
}

@ObjectType()
export class PublicArtifactGuestShareResult {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => Boolean)
    Valid!: boolean;

    @Field(() => String, { nullable: true })
    ErrorCode?: string;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => String, { nullable: true })
    ArtifactID?: string;

    @Field(() => String, { nullable: true })
    ArtifactName?: string;

    @Field(() => String, { nullable: true })
    Title?: string;

    @Field(() => String, { nullable: true })
    ArtifactTypeName?: string;

    @Field(() => String, { nullable: true })
    DriverClass?: string;

    @Field(() => String, { nullable: true })
    VersionID?: string;

    @Field(() => Int, { nullable: true })
    VersionNumber?: number;

    @Field(() => String, { nullable: true })
    Content?: string;

    @Field(() => String, { nullable: true })
    Configuration?: string;

    @Field(() => [GuestFrozenProvenanceResult], { nullable: true })
    FrozenProvenance?: GuestFrozenProvenanceResult[];

    @Field(() => String, { nullable: true })
    ExpiresAt?: string;

    @Field(() => String, { nullable: true })
    Label?: string;

    @Field(() => String)
    ShareMode!: string;

    @Field(() => Boolean)
    ReadOnly!: boolean;
}

@ObjectType()
export class ArtifactGuestShareLinkSummaryGQL {
    @Field(() => String)
    ID!: string;

    @Field(() => String)
    ArtifactID!: string;

    @Field(() => String, { nullable: true })
    ArtifactVersionID?: string | null;

    @Field(() => String, { nullable: true })
    Label?: string | null;

    @Field(() => String)
    ShareMode!: string;

    @Field(() => String, { nullable: true })
    ExpiresAt?: string | null;

    @Field(() => String, { nullable: true })
    RevokedAt?: string | null;

    @Field(() => String, { nullable: true })
    CreatedAt?: string | null;
}

@ObjectType()
export class ListArtifactGuestShareLinksResult {
    @Field(() => Boolean)
    Success!: boolean;

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => [ArtifactGuestShareLinkSummaryGQL])
    Links!: ArtifactGuestShareLinkSummaryGQL[];
}

@Resolver()
export class PublicGuestShareResolver extends ResolverBase {
    @Public()
    @Query(() => PublicArtifactGuestShareResult)
    async ResolvePublicArtifactGuestShare(
        @Arg('token', () => String) token: string,
        @Ctx() context: AppContext,
    ): Promise<PublicArtifactGuestShareResult> {
        const provider =
            (context?.providers
                ? GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true })
                : null) ?? ResolveGuestShareProviderFallback();
        const clientKey = BuildGuestShareRateLimitKey(
            context?.ClientIp,
            token,
            context?.userPayload?.userRecord?.ID
        );
        return ResolvePublicArtifactGuestShareData(token, provider, clientKey);
    }

    @Query(() => ListArtifactGuestShareLinksResult)
    async ListArtifactGuestShareLinks(
        @Arg('artifactId', () => String) artifactId: string,
        @Ctx() context: AppContext,
    ): Promise<ListArtifactGuestShareLinksResult> {
        const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
        const actor = this.GetUserFromPayload(context.userPayload);
        return ListArtifactGuestShareLinksForOwner(artifactId, provider, actor);
    }
}
