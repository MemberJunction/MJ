import { describe, it, expect } from 'vitest';
import {
    CanOpenQueryInExcel,
    HasRequiredParameterValues,
    IsMissingParameterValue,
    QueryParameterDefinition,
    ToExcelParameterValues,
} from './open-in-excel';

const QUERY_ID = '1B2C3D4E-5F60-4718-8293-A4B5C6D7E8F9';

const REGION: QueryParameterDefinition = { Name: 'Region', IsRequired: true, IsServerSet: false, Type: 'string' };
const SINCE: QueryParameterDefinition = { Name: 'Since', IsRequired: false, IsServerSet: false, Type: 'date' };
const CODES: QueryParameterDefinition = { Name: 'Codes', IsRequired: true, IsServerSet: false, Type: 'array' };
const TENANT: QueryParameterDefinition = { Name: 'TenantID', IsRequired: true, IsServerSet: true, Type: 'string' };

describe('IsMissingParameterValue', () => {
    it('treats nothing, an empty string and an empty list as missing', () => {
        expect(IsMissingParameterValue(undefined, 'string')).toBe(true);
        expect(IsMissingParameterValue(null, 'string')).toBe(true);
        expect(IsMissingParameterValue('', 'string')).toBe(true);
        expect(IsMissingParameterValue([], 'array')).toBe(true);
    });

    it('keeps zero, false and a non-empty list as values', () => {
        expect(IsMissingParameterValue(0, 'number')).toBe(false);
        expect(IsMissingParameterValue(false, 'boolean')).toBe(false);
        expect(IsMissingParameterValue(['A'], 'array')).toBe(false);
    });
});

describe('HasRequiredParameterValues', () => {
    it('is true when every required parameter the person fills in has a value', () => {
        expect(HasRequiredParameterValues({ Region: 'West', Codes: ['A'] }, [REGION, SINCE, CODES])).toBe(true);
    });

    it('is false when a required parameter is missing', () => {
        expect(HasRequiredParameterValues({ Codes: ['A'] }, [REGION, CODES])).toBe(false);
        expect(HasRequiredParameterValues(null, [REGION])).toBe(false);
    });

    it('never asks for a server-set parameter', () => {
        expect(HasRequiredParameterValues({ Region: 'West' }, [REGION, TENANT])).toBe(true);
    });
});

describe('ToExcelParameterValues', () => {
    it('drops server-set parameters even when a value is present', () => {
        expect(ToExcelParameterValues({ Region: 'West', TenantID: 'X' }, [REGION, TENANT])).toEqual({ Region: 'West' });
    });

    it('drops names the query does not define', () => {
        expect(ToExcelParameterValues({ Region: 'West', Stale: 'old' }, [REGION])).toEqual({ Region: 'West' });
    });

    it('sends dates as ISO strings and lists as lists of strings', () => {
        const since = new Date(Date.UTC(2026, 0, 15, 12, 30));
        const result = ToExcelParameterValues({ Since: since, Codes: ['A', 'B'] }, [SINCE, CODES]);
        expect(result).toEqual({ Since: '2026-01-15T12:30:00.000Z', Codes: ['A', 'B'] });
    });

    it('keeps an explicit null and leaves out an invalid date', () => {
        expect(ToExcelParameterValues({ Region: null, Since: new Date('nope') }, [REGION, SINCE])).toEqual({ Region: null });
    });

    it('returns nothing for no values', () => {
        expect(ToExcelParameterValues(null, [REGION])).toEqual({});
    });
});

describe('CanOpenQueryInExcel', () => {
    it('offers it for a saved query with its required values when the add-in is on', () => {
        expect(CanOpenQueryInExcel(true, QUERY_ID, true, { Region: 'West' }, [REGION])).toBe(true);
    });

    it('hides it while a required value is missing', () => {
        expect(CanOpenQueryInExcel(true, QUERY_ID, true, {}, [REGION])).toBe(false);
    });

    it('hides it without a saved query, without the add-in, or when turned off', () => {
        expect(CanOpenQueryInExcel(true, null, true, null, [])).toBe(false);
        expect(CanOpenQueryInExcel(true, QUERY_ID, false, null, [])).toBe(false);
        expect(CanOpenQueryInExcel(false, QUERY_ID, true, null, [])).toBe(false);
    });
});
