import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { AudienceResolver } from '@memberjunction/lists';
import type { AudienceSource } from '@memberjunction/lists-base';

import {
  addOutputParam,
  getJsonParam,
  getStringParam,
  missingParam,
} from './_action-helpers';

/**
 * Resolve an `AudienceSource` to its current record IDs.
 *
 * Read-only — never mutates. Useful for previewing how many records a
 * campaign would hit before actually sending. Agents and workflows can
 * use this to gate downstream send actions on size thresholds.
 *
 * `Source` is JSON-stringified for transport — same shape as the
 * `ListSource` discriminated union (`{kind:'list'|'view'|'adhoc', ...}`).
 */
@RegisterClass(BaseAction, 'Resolve Audience')
export class ResolveAudienceAction extends BaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const source = getJsonParam<AudienceSource>(params, 'Source');
    if (!source) {
      // Surface a clear contract hint — `getJsonParam` swallows parse
      // errors, so the caller might be supplying a non-JSON string by
      // mistake. Distinguish missing vs unparseable for grep-ability.
      const raw = getStringParam(params, 'Source');
      if (raw == null || raw.length === 0) return missingParam('Source');
      return {
        Success: false,
        ResultCode: 'INVALID_PARAMETER',
        Message: "'Source' must be a JSON-stringified AudienceSource object ({kind:'list'|'view'|'adhoc', ...})",
      };
    }

    const resolver = new AudienceResolver(params.ContextUser, params.Provider);
    try {
      const resolved = await resolver.Resolve(source);
      addOutputParam(params, 'EntityName', resolved.EntityName);
      addOutputParam(params, 'RecordCount', resolved.RecordIds.length);
      addOutputParam(params, 'RecordIDs', resolved.RecordIds);
      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Resolved ${resolved.RecordIds.length} record(s) for ${resolved.EntityName}`,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { Success: false, ResultCode: 'UNEXPECTED_ERROR', Message: message };
    }
  }
}
