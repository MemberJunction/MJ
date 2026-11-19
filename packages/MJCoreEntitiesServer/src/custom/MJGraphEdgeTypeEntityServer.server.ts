import {
    BaseEntity,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { NormalizeUUID, RegisterClass } from '@memberjunction/global';
import { GraphEngine, IsGraphDataProvider, MJGraphEdgeTypeEntity } from '@memberjunction/core-entities';

/**
 * Pure invariant check for `MJ: Graph Edge Types` `(GraphID, Name)` uniqueness,
 * including global (`GraphID === null`) edge types.
 */
export function ValidateGraphEdgeTypeUniqueness(
    candidate: {
        readonly ID: string | null | undefined;
        readonly GraphID: string | null | undefined;
        readonly Name: string | null | undefined;
    },
    existingEdgeTypes: readonly Pick<MJGraphEdgeTypeEntity, 'ID' | 'GraphID' | 'Name'>[],
): ValidationErrorInfo | null {
    const trimmedName = candidate.Name?.trim();
    if (!trimmedName) {
        return null;
    }

    const candidateIdNorm = candidate.ID ? NormalizeUUID(candidate.ID) : '';
    const candidateGraphNorm = candidate.GraphID ? NormalizeUUID(candidate.GraphID) : null;
    const candidateNameLower = trimmedName.toLowerCase();

    for (const existing of existingEdgeTypes) {
        if (candidateIdNorm && existing.ID && NormalizeUUID(existing.ID) === candidateIdNorm) {
            continue;
        }
        const existingGraphNorm = existing.GraphID ? NormalizeUUID(existing.GraphID) : null;
        if (existingGraphNorm !== candidateGraphNorm) {
            continue;
        }
        if ((existing.Name ?? '').trim().toLowerCase() === candidateNameLower) {
            const scopeDesc = candidateGraphNorm ? `graph "${candidate.GraphID}"` : 'global edge types (GraphID = NULL)';
            return new ValidationErrorInfo(
                'Name',
                `An edge type named "${trimmedName}" already exists in ${scopeDesc}.`,
                candidate.Name,
                ValidationErrorType.Failure,
            );
        }
    }

    return null;
}

/**
 * Server-side `MJ: Graph Edge Types` entity enforcing `(GraphID, Name)` uniqueness
 * across both graph-scoped and global (`GraphID === null`) edge types.
 */
@RegisterClass(BaseEntity, 'MJ: Graph Edge Types')
export class MJGraphEdgeTypeEntityServer extends MJGraphEdgeTypeEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        // Uniqueness is judged against GraphEngine's cached edge types, so they must be loaded. Config is a
        // no-op once loaded, and on a server BaseEngine loads it as the system user (never this caller's
        // scope). A load failure is an error: an empty cache would pass every duplicate.
        const provider = this.ProviderToUse;
        if (!IsGraphDataProvider(provider)) {
            return this.fail(result, 'Graph edge types can only be validated against a metadata provider.');
        }
        try {
            await GraphEngine.Instance.Config(false, this.ContextCurrentUser, provider);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return this.fail(result, `Graph metadata could not be loaded to validate this edge type: ${msg}`);
        }
        if (!GraphEngine.Instance.Loaded) {
            return this.fail(result, 'Graph metadata could not be loaded to validate this edge type.');
        }

        const dupError = ValidateGraphEdgeTypeUniqueness(
            {
                ID: this.ID,
                GraphID: this.GraphID,
                Name: this.Name,
            },
            GraphEngine.Instance.EdgeTypes,
        );

        if (dupError) {
            result.Errors.push(dupError);
            result.Success = false;
        }

        return result;
    }

    private fail(result: ValidationResult, message: string): ValidationResult {
        result.Errors.push(new ValidationErrorInfo('Name', message, this.Name, ValidationErrorType.Failure));
        result.Success = false;
        return result;
    }
}

