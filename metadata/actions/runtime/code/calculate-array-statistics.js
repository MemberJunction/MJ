// Calculate Array Statistics — pure-compute Runtime action.
//
// Takes an array of numbers, returns summary statistics (count, min, max,
// sum, mean, median, stdDev, variance) plus outlier detection based on
// n-sigma distance from the mean. No bridge calls — exercises the sandbox
// and the `lodash` library only.

const _ = require('lodash');

const {
    numbers,
    outlierThresholdSigma = 2
} = input;

if (!Array.isArray(numbers)) {
    return {
        success: false,
        error: 'numbers must be an array'
    };
}

// Filter to finite numbers only — silently drop null/undefined/NaN/Infinity.
const nums = numbers.filter((n) => typeof n === 'number' && Number.isFinite(n));

if (nums.length === 0) {
    return {
        success: false,
        error: 'numbers array contained no finite numeric values',
        droppedCount: numbers.length
    };
}

const sorted = _.sortBy(nums);
const count = nums.length;
const sum = _.sum(nums);
const mean = sum / count;

const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];

const variance = _.sumBy(nums, (n) => Math.pow(n - mean, 2)) / count;
const stdDev = Math.sqrt(variance);

// Outlier detection: |value - mean| > threshold * stdDev
const sigmaThreshold = Number(outlierThresholdSigma) || 2;
const outlierDistance = stdDev * sigmaThreshold;
const outliers = nums.filter((n) => Math.abs(n - mean) > outlierDistance);

return {
    success: true,
    count,
    droppedCount: numbers.length - count,
    min: _.min(nums),
    max: _.max(nums),
    sum,
    mean,
    median,
    stdDev,
    variance,
    outliers,
    outlierThresholdSigma: sigmaThreshold
};
