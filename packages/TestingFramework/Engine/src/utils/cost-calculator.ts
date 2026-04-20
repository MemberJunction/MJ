/**
 * @fileoverview Cost calculation utilities for test execution
 * @module @memberjunction/testing-engine
 */

import { RunView, UserInfo } from '@memberjunction/core';
import { MJAIPromptRunEntity, MJAIAgentRunEntity } from '@memberjunction/core-entities';

/**
 * Calculate total cost from AI Agent Run.
 *
 * Aggregates costs from all AI prompt runs within the agent run.
 *
 * @param agentRun - Agent run entity
 * @param contextUser - User context
 * @returns Total cost in dollars
 */
export async function calculateAgentRunCost(
    agentRun: MJAIAgentRunEntity,
    contextUser: UserInfo
): Promise<number> {
    // Agent run already has TotalCost calculated
    return agentRun.TotalCost || 0;
}

/**
 * Calculate cost from multiple test runs.
 *
 * @param testRunCosts - Array of individual test run costs
 * @returns Total cost
 */
export function aggregateTestRunCosts(testRunCosts: number[]): number {
    return testRunCosts.reduce((sum, cost) => sum + cost, 0);
}

/**
 * Calculate average cost per test.
 *
 * @param totalCost - Total cost across all tests
 * @param testCount - Number of tests
 * @returns Average cost per test
 */
export function calculateAverageCost(totalCost: number, testCount: number): number {
    return testCount > 0 ? totalCost / testCount : 0;
}

/**
 * Format cost for display.
 *
 * @param cost - Cost in dollars
 * @param precision - Decimal places (default: 4)
 * @returns Formatted cost string
 */
export function formatCost(cost: number, precision: number = 4): string {
    if (cost === 0) {
        return '$0.00';
    }

    if (cost < 0.0001) {
        return `$${cost.toExponential(2)}`;
    }

    return `$${cost.toFixed(precision)}`;
}

/**
 * Calculate cost per oracle evaluation.
 *
 * Used for tracking costs of LLM-based oracles.
 *
 * @param oracleResults - Oracle results with cost details
 * @returns Map of oracle type to cost
 */
export function calculateOracleCosts(
    oracleResults: Array<{
        oracleType: string;
        details?: { llmCost?: number };
    }>
): Map<string, number> {
    const costs = new Map<string, number>();

    for (const result of oracleResults) {
        const cost = result.details?.llmCost || 0;
        costs.set(result.oracleType, cost);
    }

    return costs;
}

/**
 * Calculate cost breakdown by component.
 *
 * @param testRunCost - Total test run cost
 * @param oracleCosts - Costs by oracle type
 * @returns Cost breakdown
 */
export function calculateCostBreakdown(
    testRunCost: number,
    oracleCosts: Map<string, number>
): {
    agentExecution: number;
    oracleEvaluation: number;
    total: number;
    breakdown: Array<{ component: string; cost: number; percentage: number }>;
} {
    const oracleTotal = Array.from(oracleCosts.values()).reduce((sum, c) => sum + c, 0);
    const agentExecution = Math.max(0, testRunCost - oracleTotal);

    const breakdown = [
        {
            component: 'Agent Execution',
            cost: agentExecution,
            percentage: testRunCost > 0 ? (agentExecution / testRunCost) * 100 : 0
        },
        ...Array.from(oracleCosts.entries()).map(([type, cost]) => ({
            component: `Oracle: ${type}`,
            cost,
            percentage: testRunCost > 0 ? (cost / testRunCost) * 100 : 0
        }))
    ];

    return {
        agentExecution,
        oracleEvaluation: oracleTotal,
        total: testRunCost,
        breakdown
    };
}

/**
 * Estimate cost for test suite.
 *
 * @param testCount - Number of tests
 * @param avgCostPerTest - Average cost per test
 * @returns Estimated total cost
 */
export function estimateSuiteCost(testCount: number, avgCostPerTest: number): number {
    return testCount * avgCostPerTest;
}

/**
 * Calculate cost efficiency metrics.
 *
 * @param totalCost - Total execution cost
 * @param passedTests - Number of passed tests
 * @param totalTests - Total number of tests
 * @returns Cost efficiency metrics
 */
export function calculateCostEfficiency(
    totalCost: number,
    passedTests: number,
    totalTests: number
): {
    costPerTest: number;
    costPerPassedTest: number;
    costEfficiencyRatio: number;
} {
    const costPerTest = totalTests > 0 ? totalCost / totalTests : 0;
    const costPerPassedTest = passedTests > 0 ? totalCost / passedTests : 0;
    const costEfficiencyRatio = totalCost > 0 ? passedTests / totalCost : 0;

    return {
        costPerTest,
        costPerPassedTest,
        costEfficiencyRatio
    };
}
