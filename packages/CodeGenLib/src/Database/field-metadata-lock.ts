/**
 * Pure decision function for field metadata updates (Category, GeneratedFormSection,
 * DisplayName, ExtendedType, CodeType).
 *
 * Implements the normative per-column lock table from plan §3.2.
 * All decisions are pure functions of current field state, proposed values, and lock context.
 */

export interface FieldLockContext {
   IsNewEntity: boolean;
   IsNewField: boolean;
   DescriptionReopened: boolean;
   TypeReopened: boolean;
   ExistingCategories: ReadonlySet<string>;
}

export interface FieldMetadataState {
   ID: string;
   Name: string;
   Category: string | null;
   GeneratedFormSection: string | null;
   DisplayName: string | null;
   ExtendedType: string | null;
   CodeType: string | null;
   AutoUpdateCategory: boolean;
   AutoUpdateDisplayName: boolean;
   AutoUpdateExtendedType: boolean;
   ValueListType?: string | null;
}

export interface FieldMetadataProposal {
   category?: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
   displayName?: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
   extendedType?: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
   codeType?: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

export type SkipReason = 'locked' | 'flag' | 'invalid' | 'unchanged' | 'blank-proposal';

export interface FieldMetadataUpdate {
   Category?: string;
   GeneratedFormSection?: 'Category';
   DisplayName?: string;
   ExtendedType?: string | null;
   CodeType?: string | null;
   Skipped: Array<{ column: string; reason: SkipReason }>;
}

export function ComputeFieldMetadataUpdate(
   field: FieldMetadataState,
   proposal: FieldMetadataProposal,
   ctx: FieldLockContext,
   validateExtendedType: (v: string) => string | null,
   sanitizeCodeType: (v: string | null | undefined, fieldName?: string, entityName?: string) => string | null | undefined
): FieldMetadataUpdate {
   const update: FieldMetadataUpdate = {
      Skipped: [],
   };

   // ──────────────────────────────────────────────────────────────────────────
   // 1. Category & GeneratedFormSection
   // ──────────────────────────────────────────────────────────────────────────
   // Override category for system metadata audit fields (__mj_*)
   const rawProposedCategory = field.Name.startsWith('__mj_')
      ? 'System Metadata'
      : proposal.category;

   if (!field.AutoUpdateCategory) {
      update.Skipped.push({ column: 'Category', reason: 'flag' });
   } else {
      const isCurrentCategoryBlank = !field.Category || field.Category.trim() === '';
      const isAllowedToCategorize = isCurrentCategoryBlank || ctx.IsNewEntity;

      if (!isAllowedToCategorize) {
         // Existing non-blank category on an existing entity: locked, never moves even between existing categories
         update.Skipped.push({ column: 'Category', reason: 'locked' });
      } else {
         if (!rawProposedCategory || rawProposedCategory.trim() === '') {
            update.Skipped.push({ column: 'Category', reason: 'blank-proposal' });
         } else {
            const trimmedProposed = rawProposedCategory.trim();
            if (trimmedProposed === (field.Category ?? '').trim()) {
               update.Skipped.push({ column: 'Category', reason: 'unchanged' });
            } else {
               update.Category = trimmedProposed;
               // GeneratedFormSection is only emitted when Category is emitted
               if (field.GeneratedFormSection !== 'Category') {
                  update.GeneratedFormSection = 'Category';
               }
            }
         }
      }
   }

   // ──────────────────────────────────────────────────────────────────────────
   // 2. DisplayName
   // ──────────────────────────────────────────────────────────────────────────
   if (!field.AutoUpdateDisplayName) {
      update.Skipped.push({ column: 'DisplayName', reason: 'flag' });
   } else {
      const isAllowedDisplayName = ctx.IsNewEntity || ctx.IsNewField || ctx.DescriptionReopened;
      if (!isAllowedDisplayName) {
         update.Skipped.push({ column: 'DisplayName', reason: 'locked' });
      } else {
         if (!proposal.displayName || proposal.displayName.trim() === '') {
            update.Skipped.push({ column: 'DisplayName', reason: 'blank-proposal' });
         } else {
            const trimmedProposal = proposal.displayName.trim();
            if (trimmedProposal === (field.DisplayName ?? '').trim()) {
               update.Skipped.push({ column: 'DisplayName', reason: 'unchanged' });
            } else {
               update.DisplayName = trimmedProposal;
            }
         }
      }
   }

   // ──────────────────────────────────────────────────────────────────────────
   // 3. ExtendedType
   // ──────────────────────────────────────────────────────────────────────────
   if (!field.AutoUpdateExtendedType) {
      update.Skipped.push({ column: 'ExtendedType', reason: 'flag' });
   } else {
      const isAllowedExtendedType = ctx.IsNewEntity || ctx.IsNewField || ctx.TypeReopened;
      if (!isAllowedExtendedType) {
         update.Skipped.push({ column: 'ExtendedType', reason: 'locked' });
      } else {
         if (proposal.extendedType === undefined) {
            update.Skipped.push({ column: 'ExtendedType', reason: 'blank-proposal' });
         } else if (
            proposal.extendedType === null ||
            proposal.extendedType.trim() === '' ||
            proposal.extendedType.trim().toLowerCase() === 'null'
         ) {
            if (field.ExtendedType === null) {
               update.Skipped.push({ column: 'ExtendedType', reason: 'unchanged' });
            } else {
               update.ExtendedType = null;
            }
         } else {
            const valid = validateExtendedType(proposal.extendedType.trim());
            const normalizedValueListType = (field.ValueListType || '').trim().toLowerCase();
            const isValueList = normalizedValueListType !== '' && normalizedValueListType !== 'none';
            if (!valid || (valid === 'Code' && isValueList)) {
               update.Skipped.push({ column: 'ExtendedType', reason: 'invalid' });
            } else {
               if (valid === field.ExtendedType) {
                  update.Skipped.push({ column: 'ExtendedType', reason: 'unchanged' });
               } else {
                  update.ExtendedType = valid;
               }
            }
         }
      }
   }

   // ──────────────────────────────────────────────────────────────────────────
   // 4. CodeType (governed by AutoUpdateExtendedType; D6)
   // ──────────────────────────────────────────────────────────────────────────
   if (!field.AutoUpdateExtendedType) {
      update.Skipped.push({ column: 'CodeType', reason: 'flag' });
   } else {
      const isAllowedCodeType = ctx.IsNewEntity || ctx.IsNewField || ctx.TypeReopened;
      if (!isAllowedCodeType) {
         update.Skipped.push({ column: 'CodeType', reason: 'locked' });
      } else {
         // Determine effective extended type after step 3
         const effectiveExtendedType =
            'ExtendedType' in update ? update.ExtendedType : field.ExtendedType;

         if (effectiveExtendedType !== 'Code') {
            // CodeType MUST be null when ExtendedType is not Code
            if (field.CodeType === null) {
               update.Skipped.push({ column: 'CodeType', reason: 'unchanged' });
            } else {
               update.CodeType = null;
            }
         } else {
            if (proposal.codeType === undefined) {
               update.Skipped.push({ column: 'CodeType', reason: 'blank-proposal' });
            } else {
               const sanitized = sanitizeCodeType(proposal.codeType, field.Name);
               const resolvedCodeType = sanitized ?? null;
               if (resolvedCodeType === field.CodeType) {
                  update.Skipped.push({ column: 'CodeType', reason: 'unchanged' });
               } else {
                  update.CodeType = resolvedCodeType;
               }
            }
         }
      }
   }

   return update;
}

/** @deprecated Use {@link ComputeFieldMetadataUpdate}. */
export function computeFieldMetadataUpdate(
   field: FieldMetadataState,
   proposal: FieldMetadataProposal,
   ctx: FieldLockContext,
   validateExtendedType: (v: string) => string | null,
   sanitizeCodeType: (v: string | null | undefined, fieldName?: string, entityName?: string) => string | null | undefined
): FieldMetadataUpdate {
   return ComputeFieldMetadataUpdate(field, proposal, ctx, validateExtendedType, sanitizeCodeType);
}
