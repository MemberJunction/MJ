import { TransformRule, TransformPipeline, TargetDatabasePlatform } from '../../TransformStrategy.js';

/**
 * Default implementation of TransformPipeline that applies an ordered
 * list of TransformRules to each field in a record.
 *
 * Rules are filtered by TargetPlatform: only rules whose TargetPlatform
 * matches the given platform (or is '*') are applied.
 */
export class DefaultTransformPipeline implements TransformPipeline {
    public readonly Rules: TransformRule[];

    constructor(rules: TransformRule[]) {
        this.Rules = rules;
    }

    public Execute(
        record: Record<string, unknown>,
        fieldTypes: Map<string, string>,
        targetPlatform: TargetDatabasePlatform
    ): Record<string, unknown> {
        const applicableRules = this.filterRulesByPlatform(targetPlatform);
        const result: Record<string, unknown> = {};

        for (const fieldName of Object.keys(record)) {
            const fieldType = fieldTypes.get(fieldName) ?? '';
            let value = record[fieldName];

            for (const rule of applicableRules) {
                value = rule.Apply(fieldName, value, fieldType);
            }

            result[fieldName] = value;
        }

        return result;
    }

    private filterRulesByPlatform(targetPlatform: TargetDatabasePlatform): TransformRule[] {
        return this.Rules.filter(
            rule => rule.TargetPlatform === '*' || rule.TargetPlatform === targetPlatform
        );
    }
}
