import { describe, it, expect } from 'vitest';
import { MongoFilterTranslator } from '../MongoFilterTranslator';

const t = (sql: string) => MongoFilterTranslator.translate(sql);

describe('MongoFilterTranslator', () => {
  it('returns {} for empty/whitespace/undefined', () => {
    expect(t('')).toEqual({});
    expect(t('   ')).toEqual({});
    expect(MongoFilterTranslator.translate(undefined)).toEqual({});
  });

  it('translates equality and the comparison operators', () => {
    expect(t("status = 'paid'")).toEqual({ status: { $eq: 'paid' } });
    expect(t('amount > 100')).toEqual({ amount: { $gt: 100 } });
    expect(t('amount >= 100')).toEqual({ amount: { $gte: 100 } });
    expect(t('amount < 100')).toEqual({ amount: { $lt: 100 } });
    expect(t('amount <= 100')).toEqual({ amount: { $lte: 100 } });
    expect(t("status != 'x'")).toEqual({ status: { $ne: 'x' } });
    expect(t("status <> 'x'")).toEqual({ status: { $ne: 'x' } }); // <> is an alias for !=
  });

  it('parses number, string, null, and boolean literals', () => {
    expect(t('qty = 5')).toEqual({ qty: { $eq: 5 } });
    expect(t('price = 9.99')).toEqual({ price: { $eq: 9.99 } });
    expect(t('active = TRUE')).toEqual({ active: { $eq: true } });
    expect(t('active = false')).toEqual({ active: { $eq: false } });
    expect(t("note = ''")).toEqual({ note: { $eq: '' } });
    expect(t("name = 'O''Brien'")).toEqual({ name: { $eq: "O'Brien" } }); // '' -> '
  });

  it('handles IN and NOT IN', () => {
    expect(t("status IN ('paid', 'pending')")).toEqual({ status: { $in: ['paid', 'pending'] } });
    expect(t('tier NOT IN (1, 2, 3)')).toEqual({ tier: { $nin: [1, 2, 3] } });
  });

  it('handles IS NULL / IS NOT NULL', () => {
    expect(t('email IS NULL')).toEqual({ email: { $eq: null } });
    expect(t('email IS NOT NULL')).toEqual({ email: { $ne: null } });
  });

  it('translates LIKE to an anchored, escaped, case-insensitive regex by default (% -> .*, _ -> .)', () => {
    // Case-insensitive ($options: 'i') is the default to match SQL Server's default collation
    // (MJ's most common backend). It is now configurable per data source (caseInsensitiveLike) for
    // PostgreSQL-style case-sensitive matching — see the dedicated test below.
    expect(t("name LIKE 'Ac%'")).toEqual({ name: { $regex: '^Ac.*$', $options: 'i' } });
    expect(t("code LIKE 'A_C'")).toEqual({ code: { $regex: '^A.C$', $options: 'i' } });
    expect(t("v LIKE 'a.b%'")).toEqual({ v: { $regex: '^a\\.b.*$', $options: 'i' } }); // dot escaped
  });

  it('LIKE is case-sensitive (no $options) when caseInsensitiveLike is false', () => {
    expect(MongoFilterTranslator.translate("name LIKE 'Ac%'", { caseInsensitiveLike: false }))
      .toEqual({ name: { $regex: '^Ac.*$' } });
    // explicit true matches the default
    expect(MongoFilterTranslator.translate("name LIKE 'Ac%'", { caseInsensitiveLike: true }))
      .toEqual({ name: { $regex: '^Ac.*$', $options: 'i' } });
  });

  it('combines predicates with AND / OR (AND binds tighter)', () => {
    expect(t("status = 'paid' AND amount > 50")).toEqual({
      $and: [{ status: { $eq: 'paid' } }, { amount: { $gt: 50 } }],
    });
    expect(t("status = 'paid' OR status = 'pending'")).toEqual({
      $or: [{ status: { $eq: 'paid' } }, { status: { $eq: 'pending' } }],
    });
    // a OR b AND c  ==  a OR (b AND c)
    expect(t("a = 1 OR b = 2 AND c = 3")).toEqual({
      $or: [{ a: { $eq: 1 } }, { $and: [{ b: { $eq: 2 } }, { c: { $eq: 3 } }] }],
    });
  });

  it('respects parentheses', () => {
    expect(t("(a = 1 OR b = 2) AND c = 3")).toEqual({
      $and: [{ $or: [{ a: { $eq: 1 } }, { b: { $eq: 2 } }] }, { c: { $eq: 3 } }],
    });
  });

  it('supports dotted field paths', () => {
    expect(t("address.city = 'NYC'")).toEqual({ 'address.city': { $eq: 'NYC' } });
  });

  it('throws on unsupported syntax (caller should use a native query)', () => {
    expect(() => t('amount BETWEEN 1 AND 10')).toThrow();
    expect(() => t('status =')).toThrow();
    expect(() => t('@#$')).toThrow();
  });
});
