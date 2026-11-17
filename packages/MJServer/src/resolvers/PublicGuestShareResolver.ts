import { Arg, Ctx, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { type GuestFrozenProvenanceItem } from '@memberjunction/core-entities';
import { AppContext } from '../types.js';
import { GetReadOnlyProvider } from '../util.js';
import {
    ListArtifactGuestShareLinksForOwner,
    ResolveGuestArtifactSnapshotForSession,
    ResolveGuestShareProviderFallback,
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
    LinkID?: string;

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

    @Field(() => String, { nullable: true })
    MagicLinkInviteID?: string | null;

    @Field(() => String)
    ArtifactID!: string;

    @Field(() => String, { nullable: true })
    ArtifactVersionID?: string | null;

    @Field(() => String, { nullable: true })
    Label?: string | null;

    @Field(() => String)
    ShareMode!: string;

    @Field(() => String, { nullable: true })
    Status?: string | null;

    @Field(() => Int, { nullable: true })
    AccessCount?: number | null;

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
    @Query(() => PublicArtifactGuestShareResult)
    async ResolveGuestArtifactSnapshot(
        @Ctx() context: AppContext,
    ): Promise<PublicArtifactGuestShareResult> {
        const provider =
            (context?.providers
                ? GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true })
                : null) ?? ResolveGuestShareProviderFallback();
        return ResolveGuestArtifactSnapshotForSession(context?.userPayload, provider, context?.ClientIp);
    }

    @Query(() => ListArtifactGuestShareLinksResult)
    async ListArtifactGuestShareLinks(
        @Arg('artifactId', () => String) artifactId: string,
        @Ctx() context: AppContext,
    ): Promise<ListArtifactGuestShareLinksResult> {
        const trimmedId = (artifactId ?? '').trim();
        await this.CheckAPIKeyScopeAuthorization('artifact:read', trimmedId || '*', context.userPayload);
        const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
        const actor = this.GetUserFromPayload(context.userPayload);
        return ListArtifactGuestShareLinksForOwner(trimmedId, provider, actor);
    }
}
