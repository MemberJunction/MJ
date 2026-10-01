import { BaseEntity } from '@memberjunction/core';
import { MJRubricCriterionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { ValidateRubricTree } from './rubrics/versionPublish.js';

/**
 * Checks a criterion against the draft tree it belongs to.
 *
 * Refuses duplicate keys, a missing or cyclic parent, a criterion with no
 * scale, and a gate with no minimum. Publish runs the same check.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Criteria')
export class MJRubricCriterionEntityServer extends MJRubricCriterionEntity {
    /** The tree errors for this draft. Empty when the tree can be published. */
    public TreeErrors(version: RubricVersionSnapshot): string[] {
        return ValidateRubricTree(version).errors;
    }

    /** @deprecated Use {@link TreeErrors}. */
    public treeErrors(version: RubricVersionSnapshot): string[] {
        return this.TreeErrors(version);
    }
}
