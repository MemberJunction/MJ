/**
 * Library Provider for isolated-vm
 *
 * This module provides allowlisted utility libraries to sandboxed code.
 * Libraries are provided as either:
 * - Inline implementations (lodash, date-fns, uuid, validator) - simpler, hand-coded subsets
 * - Bundled source code (mathjs, papaparse, jstat) - full libraries with complex functionality
 *
 * SECURITY NOTE: Only add libraries here that are safe for untrusted code execution.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Allowed module names
 */
export const ALLOWED_MODULES = [
    'lodash',
    'date-fns',
    'mathjs',
    'papaparse',
    'jstat',
    'uuid',
    'validator'
] as const;

export type AllowedModule = typeof ALLOWED_MODULES[number];

/**
 * Check if a module is allowed
 */
export function isModuleAllowed(moduleName: string): moduleName is AllowedModule {
    return ALLOWED_MODULES.includes(moduleName as AllowedModule);
}

/**
 * Get list of all allowed module names
 */
export function getAllowedModuleNames(): string[] {
    return [...ALLOWED_MODULES];
}

/**
 * Get the source code for a library module
 * Returns JavaScript code that evaluates to the module exports
 */
export function getLibrarySource(moduleName: string): string | null {
    if (!isModuleAllowed(moduleName)) {
        return null;
    }

    switch (moduleName) {
        case 'lodash':
            return getLodashSource();
        case 'date-fns':
            return getDateFnsSource();
        case 'mathjs':
            return getMathjsSource();
        case 'papaparse':
            return getPapaparseSource();
        case 'jstat':
            return getJstatSource();
        case 'uuid':
            return getUuidSource();
        case 'validator':
            return getValidatorSource();
        default:
            return null;
    }
}

/**
 * Lodash subset implementation
 * Provides most commonly used lodash functions inline
 */
function getLodashSource(): string {
    return `
(function() {
    const _ = {
        // Array functions
        chunk: function(array, size = 1) {
            const result = [];
            for (let i = 0; i < array.length; i += size) {
                result.push(array.slice(i, i + size));
            }
            return result;
        },

        compact: function(array) {
            return array.filter(Boolean);
        },

        flatten: function(array) {
            return array.flat();
        },

        uniq: function(array) {
            return [...new Set(array)];
        },

        difference: function(array, ...values) {
            const others = new Set(values.flat());
            return array.filter(x => !others.has(x));
        },

        intersection: function(...arrays) {
            if (arrays.length === 0) return [];
            const first = new Set(arrays[0]);
            return arrays[0].filter(x => arrays.every(arr => arr.includes(x)));
        },

        union: function(...arrays) {
            return [...new Set(arrays.flat())];
        },

        zip: function(...arrays) {
            const maxLength = Math.max(...arrays.map(a => a.length));
            return Array.from({ length: maxLength }, (_, i) => arrays.map(arr => arr[i]));
        },

        // Collection functions
        groupBy: function(collection, iteratee) {
            const fn = typeof iteratee === 'function' ? iteratee : x => x[iteratee];
            return collection.reduce((result, item) => {
                const key = fn(item);
                (result[key] = result[key] || []).push(item);
                return result;
            }, {});
        },

        keyBy: function(collection, iteratee) {
            const fn = typeof iteratee === 'function' ? iteratee : x => x[iteratee];
            return collection.reduce((result, item) => {
                result[fn(item)] = item;
                return result;
            }, {});
        },

        sortBy: function(collection, iteratees) {
            const fns = Array.isArray(iteratees) ? iteratees : [iteratees];
            return [...collection].sort((a, b) => {
                for (const fn of fns) {
                    const iteratee = typeof fn === 'function' ? fn : x => x[fn];
                    const aVal = iteratee(a);
                    const bVal = iteratee(b);
                    if (aVal !== bVal) return aVal < bVal ? -1 : 1;
                }
                return 0;
            });
        },

        // Object functions
        pick: function(object, ...paths) {
            const keys = paths.flat();
            return keys.reduce((result, key) => {
                if (key in object) result[key] = object[key];
                return result;
            }, {});
        },

        omit: function(object, ...paths) {
            const keys = new Set(paths.flat());
            return Object.keys(object).reduce((result, key) => {
                if (!keys.has(key)) result[key] = object[key];
                return result;
            }, {});
        },

        mapValues: function(object, iteratee) {
            const fn = typeof iteratee === 'function' ? iteratee : () => iteratee;
            return Object.keys(object).reduce((result, key) => {
                result[key] = fn(object[key], key, object);
                return result;
            }, {});
        },

        // Utility functions
        get: function(object, path, defaultValue) {
            const paths = Array.isArray(path) ? path : path.split('.');
            let result = object;
            for (const p of paths) {
                result = result?.[p];
                if (result === undefined) return defaultValue;
            }
            return result;
        },

        set: function(object, path, value) {
            const paths = Array.isArray(path) ? path : path.split('.');
            let current = object;
            for (let i = 0; i < paths.length - 1; i++) {
                const p = paths[i];
                current[p] = current[p] || {};
                current = current[p];
            }
            current[paths[paths.length - 1]] = value;
            return object;
        },

        sum: function(array) {
            return array.reduce((sum, n) => sum + n, 0);
        },

        sumBy: function(array, iteratee) {
            const fn = typeof iteratee === 'function' ? iteratee : x => x[iteratee];
            return array.reduce((sum, item) => sum + fn(item), 0);
        },

        mean: function(array) {
            return array.length ? _.sum(array) / array.length : 0;
        },

        meanBy: function(array, iteratee) {
            const fn = typeof iteratee === 'function' ? iteratee : x => x[iteratee];
            const values = array.map(fn);
            return values.length ? _.sum(values) / values.length : 0;
        },

        cloneDeep: function(value) {
            return JSON.parse(JSON.stringify(value));
        }
    };

    return _;
})()
    `.trim();
}

/**
 * date-fns subset implementation
 * Provides essential date manipulation functions
 */
function getDateFnsSource(): string {
    return `
(function() {
    const dateFns = {
        format: function(date, formatStr) {
            const d = new Date(date);
            const tokens = {
                'yyyy': d.getFullYear(),
                'MM': String(d.getMonth() + 1).padStart(2, '0'),
                'dd': String(d.getDate()).padStart(2, '0'),
                'HH': String(d.getHours()).padStart(2, '0'),
                'mm': String(d.getMinutes()).padStart(2, '0'),
                'ss': String(d.getSeconds()).padStart(2, '0')
            };
            return formatStr.replace(/yyyy|MM|dd|HH|mm|ss/g, match => tokens[match]);
        },

        addDays: function(date, days) {
            const d = new Date(date);
            d.setDate(d.getDate() + days);
            return d;
        },

        subDays: function(date, days) {
            return dateFns.addDays(date, -days);
        },

        addMonths: function(date, months) {
            const d = new Date(date);
            d.setMonth(d.getMonth() + months);
            return d;
        },

        differenceInDays: function(dateLeft, dateRight) {
            const msPerDay = 1000 * 60 * 60 * 24;
            return Math.floor((new Date(dateLeft) - new Date(dateRight)) / msPerDay);
        },

        isAfter: function(date, dateToCompare) {
            return new Date(date) > new Date(dateToCompare);
        },

        isBefore: function(date, dateToCompare) {
            return new Date(date) < new Date(dateToCompare);
        },

        startOfDay: function(date) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            return d;
        },

        endOfDay: function(date) {
            const d = new Date(date);
            d.setHours(23, 59, 59, 999);
            return d;
        },

        parseISO: function(dateString) {
            return new Date(dateString);
        }
    };

    return dateFns;
})()
    `.trim();
}

/**
 * uuid implementation
 * Provides UUID v4 generation
 */
function getUuidSource(): string {
    return `
(function() {
    const uuid = {
        v4: function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
    };

    return uuid;
})()
    `.trim();
}

/**
 * validator subset implementation
 * Provides common validation functions
 */
function getValidatorSource(): string {
    return `
(function() {
    const validator = {
        isEmail: function(str) {
            const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
            return emailRegex.test(str);
        },

        isURL: function(str) {
            try {
                new URL(str);
                return true;
            } catch {
                return false;
            }
        },

        isNumeric: function(str) {
            return /^-?\\d+(\\.\\d+)?$/.test(str);
        },

        isAlpha: function(str) {
            return /^[A-Za-z]+$/.test(str);
        },

        isAlphanumeric: function(str) {
            return /^[A-Za-z0-9]+$/.test(str);
        },

        isEmpty: function(str) {
            return str.length === 0;
        },

        isLength: function(str, options) {
            const len = str.length;
            return (!options.min || len >= options.min) && (!options.max || len <= options.max);
        },

        isIn: function(str, values) {
            return values.includes(str);
        },

        matches: function(str, pattern) {
            return new RegExp(pattern).test(str);
        }
    };

    return validator;
})()
    `.trim();
}

/**
 * mathjs implementation
 * Provides comprehensive mathematics and statistics functions
 * We bundle the actual mathjs library for full functionality
 */
function getMathjsSource(): string {
    const libPath = path.join(__dirname, 'bundled-libs', 'mathjs.js');
    const source = fs.readFileSync(libPath, 'utf8');

    // Wrap in IIFE that returns the math object
    return `(function() {
        ${source}
        return math;
    })()`;
}

/**
 * papaparse implementation
 * Provides CSV parsing and generation
 * We bundle the actual papaparse library
 */
function getPapaparseSource(): string {
    const libPath = path.join(__dirname, 'bundled-libs', 'papaparse.js');
    const source = fs.readFileSync(libPath, 'utf8');

    // Wrap in IIFE that returns the Papa object
    return `(function() {
        ${source}
        return Papa;
    })()`;
}

/**
 * jstat implementation
 * Provides statistical distributions, hypothesis testing, and regression
 * We bundle the actual jstat library
 */
function getJstatSource(): string {
    const libPath = path.join(__dirname, 'bundled-libs', 'jstat.js');
    const source = fs.readFileSync(libPath, 'utf8');

    // Wrap in IIFE that returns the jStat object
    return `(function() {
        ${source}
        return jStat;
    })()`;
}
