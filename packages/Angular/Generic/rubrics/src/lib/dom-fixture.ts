import type { RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';

/** A one-criterion draft the DOM specs can render without a provider. */
export function draft(weight = 1, instructions: string | null = null): RubricVersionSnapshot {
    return {
        id: 'draft',
        rubricId: 'rubric',
        notApplicablePolicy: 'ExcludeAndRedistribute',
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        instructions,
        nodes: [{
            id: 'clarity',
            key: 'clarity',
            name: 'Clarity',
            nodeType: 'Criterion',
            scaleId: 'scale',
            weight,
            isAdvisory: false,
            isGate: false,
            evidenceRequired: false,
            rationaleRequired: false,
            sequence: 0,
            anchors: [{ scaleLevelId: 'high', descriptor: 'Easy to follow' }],
        }],
        scales: [{
            id: 'scale',
            name: 'Meets',
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [
                { id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 0 },
                { id: 'low', label: 'Low', value: 0, normalizedValue: 0, sequence: 1 },
            ],
        }],
        bands: [{ id: 'good', label: 'Good', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 0 }],
    };
}

/** A passing score for the Clarity leaf. */
export function passedResult(): RubricScoreResult {
    return {
        normalizedScore: 1,
        completeness: 1,
        outcome: 'Passed',
        passed: true,
        gateFailed: false,
        passThresholdApplied: 0.5,
        bandId: 'good',
        confidence: null,
        scoredCriteriaCount: 1,
        applicableCriteriaCount: 1,
        totalCriteriaCount: 1,
        nodes: [{
            id: 'clarity',
            key: 'clarity',
            normalizedScore: 1,
            effectiveWeight: 1,
            overallContribution: 1,
            gateFailed: false,
            isNotApplicable: false,
            isAdvisory: false,
        }],
        scoringEngineVersion: '1.0',
    };
}
