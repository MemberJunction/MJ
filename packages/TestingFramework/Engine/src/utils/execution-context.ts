/**
 * @fileoverview Utility functions for gathering execution context
 * @module @memberjunction/testing-engine
 */

import * as os from 'os';
import { RunContextDetails } from '@memberjunction/testing-engine-base';

/**
 * Get the primary MAC address for use as a machine identifier.
 * Returns the first non-internal, non-loopback MAC address found.
 * @returns MAC address string or undefined if not found
 */
function getMachineId(): string | undefined {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const ifaceList = interfaces[name];
        if (!ifaceList) continue;

        for (const iface of ifaceList) {
            // Skip internal (loopback) and interfaces without MAC
            if (iface.internal || !iface.mac || iface.mac === '00:00:00:00:00:00') {
                continue;
            }
            return iface.mac;
        }
    }
    return undefined;
}

/**
 * Get the primary IP address of the machine.
 * Returns the first non-internal IPv4 address found.
 * @returns IP address string or undefined if not found
 */
function getIpAddress(): string | undefined {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const ifaceList = interfaces[name];
        if (!ifaceList) continue;

        for (const iface of ifaceList) {
            // Skip internal (loopback) and non-IPv4
            if (iface.internal || iface.family !== 'IPv4') {
                continue;
            }
            return iface.address;
        }
    }
    return undefined;
}

/**
 * Detect CI/CD provider from environment variables.
 * @returns Object with CI provider info or undefined values
 */
function detectCIProvider(): {
    ciProvider?: string;
    pipelineId?: string;
    buildNumber?: string;
    branch?: string;
    prNumber?: string;
} {
    // GitHub Actions
    if (process.env.GITHUB_ACTIONS === 'true') {
        return {
            ciProvider: 'GitHub Actions',
            pipelineId: process.env.GITHUB_WORKFLOW,
            buildNumber: process.env.GITHUB_RUN_NUMBER,
            branch: process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF,
            prNumber: process.env.GITHUB_PR_NUMBER
        };
    }

    // Azure DevOps
    if (process.env.TF_BUILD === 'True') {
        return {
            ciProvider: 'Azure DevOps',
            pipelineId: process.env.BUILD_DEFINITIONNAME,
            buildNumber: process.env.BUILD_BUILDNUMBER,
            branch: process.env.BUILD_SOURCEBRANCH,
            prNumber: process.env.SYSTEM_PULLREQUEST_PULLREQUESTNUMBER
        };
    }

    // Jenkins
    if (process.env.JENKINS_URL) {
        return {
            ciProvider: 'Jenkins',
            pipelineId: process.env.JOB_NAME,
            buildNumber: process.env.BUILD_NUMBER,
            branch: process.env.GIT_BRANCH || process.env.BRANCH_NAME,
            prNumber: process.env.CHANGE_ID
        };
    }

    // CircleCI
    if (process.env.CIRCLECI === 'true') {
        return {
            ciProvider: 'CircleCI',
            pipelineId: process.env.CIRCLE_WORKFLOW_ID,
            buildNumber: process.env.CIRCLE_BUILD_NUM,
            branch: process.env.CIRCLE_BRANCH,
            prNumber: process.env.CIRCLE_PR_NUMBER
        };
    }

    // GitLab CI
    if (process.env.GITLAB_CI === 'true') {
        return {
            ciProvider: 'GitLab CI',
            pipelineId: process.env.CI_PIPELINE_ID,
            buildNumber: process.env.CI_JOB_ID,
            branch: process.env.CI_COMMIT_REF_NAME,
            prNumber: process.env.CI_MERGE_REQUEST_IID
        };
    }

    // Travis CI
    if (process.env.TRAVIS === 'true') {
        return {
            ciProvider: 'Travis CI',
            pipelineId: process.env.TRAVIS_JOB_ID,
            buildNumber: process.env.TRAVIS_BUILD_NUMBER,
            branch: process.env.TRAVIS_BRANCH,
            prNumber: process.env.TRAVIS_PULL_REQUEST !== 'false' ? process.env.TRAVIS_PULL_REQUEST : undefined
        };
    }

    // Not in CI
    return {};
}

/**
 * Gather execution context details for test runs.
 * This collects machine info, OS details, Node version, and CI/CD context.
 *
 * @returns RunContextDetails object with all available context
 */
export function gatherExecutionContext(): RunContextDetails {
    const ciInfo = detectCIProvider();

    return {
        osType: os.platform(),
        osVersion: os.release(),
        nodeVersion: process.version,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
        ipAddress: getIpAddress(),
        ...ciInfo
    };
}

/**
 * Get the hostname of the current machine.
 * @returns Machine hostname
 */
export function getMachineName(): string {
    return os.hostname();
}

/**
 * Get the machine identifier (MAC address).
 * @returns MAC address or undefined if not available
 */
export function getMachineIdentifier(): string | undefined {
    return getMachineId();
}
