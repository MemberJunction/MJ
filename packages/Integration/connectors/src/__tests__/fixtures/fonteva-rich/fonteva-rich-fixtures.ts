/**
 * Rich, realistic, PII-free synthetic Fonteva AMS fixture dataset.
 *
 * Implements the dataset called for in fontevacontext.md §11 — keyed by the REAL
 * Fonteva managed-package backing sObjects (OrderApi__* / EventApi__*), FK-consistent,
 * and covering the documented edge cases (person vs org, member vs nonmember,
 * duplicate contact, cancelled registration, failed payment, expired subscription,
 * deleted record).
 *
 * Provenance: synthetic. There is NO public Fonteva OpenAPI / sample-response corpus to
 * scrub from — the field API names are docs-derived (the OrderApi__/EventApi__ managed-
 * package namespaces + the documented camelCase service convention, fontevacontext.md
 * §4), and ALL values are invented test data (names <scrubbed>, emails @example.com,
 * phones in the 555-01xx test range, addresses 123/124/125 Test St).
 *
 * Two shapes are provided per object family because Fonteva exposes both layers
 * (fontevacontext.md §4):
 *   - Salesforce-API-name records (OrderApi__Is_Posted__c) — what the SOQL platform
 *     path returns and what backing-sObject CRUD writes/reads.
 *   - camelCase wrapper records (isPosted) — what an FDService domain service returns.
 *
 * NOTE ON NAMING: only a handful of these backing sObjects are mapped to a friendly IO
 * name by the connector's metadata. The fixtures are keyed by the backing sObject so a
 * test can sync them through the connector's IO-name → sObject translation; where the
 * exact managed-package API name for a concept isn't documented, the most plausible
 * OrderApi__/EventApi__ name is used (this is synthetic test data, not a metadata claim).
 */

// ─── Salesforce-API-name record shapes (SOQL platform layer) ────────────

/** Every Fonteva sObject row carries these Salesforce system/audit fields. */
export interface SFSystemFields {
    Id: string;
    SystemModstamp: string;
    LastModifiedDate: string;
    CreatedDate: string;
    IsDeleted: boolean;
    LastModifiedById: string;
    /** Salesforce envelope blob the connector strips via ExcludedSourceKeys. */
    attributes?: { type: string; url: string };
}

export type SFRecord = SFSystemFields & Record<string, unknown>;

// ─── ID generators (Salesforce 18-char Id prefixes are object-specific) ──

const SF_ID_PREFIXES: Record<string, string> = {
    Account: '001',
    Contact: '003',
    Membership: 'a01',
    Subscription: 'a02',
    Item: 'a03',
    Event: 'a04',
    Registration: 'a05',
    SalesOrder: 'a06',
    SalesOrderLine: 'a07',
    EPayment: 'a08',
    Receipt: 'a09',
    Journal: 'a0A',
    Store: 'a0B',
};

/** Builds a deterministic, well-formed 18-char Salesforce Id for an object + ordinal. */
export function sfId(object: keyof typeof SF_ID_PREFIXES, n: number): string {
    const prefix = SF_ID_PREFIXES[object];
    const tail = String(n).padStart(12, '0');
    return `${prefix}${tail}AAA`;
}

const MODIFIED_BY = '005000000000099AAA'; // synthetic integration user Id

/** Stamps the system/audit fields onto a partial record. */
function withSystem(
    sObjectType: string,
    id: string,
    systemModstamp: string,
    isDeleted = false,
    fields: Record<string, unknown> = {}
): SFRecord {
    return {
        attributes: { type: sObjectType, url: `/services/data/v61.0/sobjects/${sObjectType}/${id}` },
        Id: id,
        SystemModstamp: systemModstamp,
        LastModifiedDate: systemModstamp,
        CreatedDate: '2026-01-01T00:00:00.000Z',
        IsDeleted: isDeleted,
        LastModifiedById: MODIFIED_BY,
        ...fields,
    };
}

// ─── Accounts (3: 2 organizations + 1 person-account-style) ─────────────

export const ACCOUNTS: SFRecord[] = [
    withSystem('Account', sfId('Account', 1), '2026-02-01T10:00:00.000Z', false, {
        Name: 'Test Association Alpha',
        OrderApi__Account_Type__c: 'Organization',
        BillingStreet: '123 Test St',
        BillingCity: 'Example',
        BillingState: 'XX',
        BillingPostalCode: '00000',
        Phone: '555-0100',
    }),
    withSystem('Account', sfId('Account', 2), '2026-02-02T10:00:00.000Z', false, {
        Name: 'Test Society Beta',
        OrderApi__Account_Type__c: 'Organization',
        BillingStreet: '124 Test St',
        BillingCity: 'Example',
        BillingState: 'XX',
        BillingPostalCode: '00000',
        Phone: '555-0101',
    }),
    withSystem('Account', sfId('Account', 3), '2026-02-03T10:00:00.000Z', false, {
        Name: '<scrubbed-name-1> Household',
        OrderApi__Account_Type__c: 'Person',
        BillingStreet: '125 Test St',
        BillingCity: 'Example',
        BillingState: 'XX',
        BillingPostalCode: '00000',
        Phone: '555-0102',
    }),
];

// ─── Contacts (10: incl. 1 duplicate, member/nonmember mix) ─────────────
// Contact #10 is an intentional DUPLICATE of #2 (same email, case-different) to
// exercise record-match-style dedup by Salesforce Id + email.

export const CONTACTS: SFRecord[] = [
    withSystem('Contact', sfId('Contact', 1), '2026-02-05T09:00:00.000Z', false, {
        FirstName: '<scrubbed-name-2>', LastName: '<scrubbed-name-3>',
        Email: 'example+1@example.com', Phone: '555-0110',
        AccountId: sfId('Account', 1),
        OrderApi__Is_Member__c: true,
        OrderApi__Member_Status__c: 'Active',
    }),
    withSystem('Contact', sfId('Contact', 2), '2026-02-05T09:05:00.000Z', false, {
        FirstName: '<scrubbed-name-4>', LastName: '<scrubbed-name-5>',
        Email: 'example+2@example.com', Phone: '555-0111',
        AccountId: sfId('Account', 1),
        OrderApi__Is_Member__c: true,
        OrderApi__Member_Status__c: 'Active',
    }),
    withSystem('Contact', sfId('Contact', 3), '2026-02-05T09:10:00.000Z', false, {
        FirstName: '<scrubbed-name-6>', LastName: '<scrubbed-name-7>',
        Email: 'example+3@example.com', Phone: '555-0112',
        AccountId: sfId('Account', 2),
        OrderApi__Is_Member__c: false,
        OrderApi__Member_Status__c: 'Lapsed',
    }),
    withSystem('Contact', sfId('Contact', 4), '2026-02-05T09:15:00.000Z', false, {
        FirstName: '<scrubbed-name-8>', LastName: '<scrubbed-name-9>',
        Email: 'example+4@example.com', Phone: '555-0113',
        AccountId: sfId('Account', 2),
        OrderApi__Is_Member__c: false,
        OrderApi__Member_Status__c: 'Prospect',
    }),
    withSystem('Contact', sfId('Contact', 5), '2026-02-05T09:20:00.000Z', false, {
        FirstName: '<scrubbed-name-10>', LastName: '<scrubbed-name-11>',
        Email: 'example+5@example.com', Phone: '555-0114',
        AccountId: sfId('Account', 3),
        OrderApi__Is_Member__c: true,
        OrderApi__Member_Status__c: 'Active',
    }),
    withSystem('Contact', sfId('Contact', 6), '2026-02-05T09:25:00.000Z', false, {
        FirstName: '<scrubbed-name-12>', LastName: '<scrubbed-name-13>',
        Email: 'example+6@example.com', Phone: '555-0115',
        AccountId: sfId('Account', 1),
        OrderApi__Is_Member__c: true,
        OrderApi__Member_Status__c: 'Active',
    }),
    withSystem('Contact', sfId('Contact', 7), '2026-02-05T09:30:00.000Z', false, {
        FirstName: '<scrubbed-name-14>', LastName: '<scrubbed-name-15>',
        Email: 'example+7@example.com', Phone: '555-0116',
        AccountId: sfId('Account', 2),
        OrderApi__Is_Member__c: false,
        OrderApi__Member_Status__c: 'Lapsed',
    }),
    withSystem('Contact', sfId('Contact', 8), '2026-02-05T09:35:00.000Z', false, {
        FirstName: '<scrubbed-name-16>', LastName: '<scrubbed-name-17>',
        Email: 'example+8@example.com', Phone: '555-0117',
        AccountId: sfId('Account', 3),
        OrderApi__Is_Member__c: true,
        OrderApi__Member_Status__c: 'Active',
    }),
    withSystem('Contact', sfId('Contact', 9), '2026-02-05T09:40:00.000Z', false, {
        FirstName: '<scrubbed-name-18>', LastName: '<scrubbed-name-19>',
        Email: 'example+9@example.com', Phone: '555-0118',
        AccountId: sfId('Account', 1),
        OrderApi__Is_Member__c: false,
        OrderApi__Member_Status__c: 'Prospect',
    }),
    // #10 — intentional DUPLICATE of #2: same email but UPPER-cased (record-match edge case).
    withSystem('Contact', sfId('Contact', 10), '2026-02-05T09:45:00.000Z', false, {
        FirstName: '<scrubbed-name-4>', LastName: '<scrubbed-name-5>',
        Email: 'EXAMPLE+2@EXAMPLE.COM', Phone: '555-0111',
        AccountId: sfId('Account', 1),
        OrderApi__Is_Member__c: true,
        OrderApi__Member_Status__c: 'Active',
        OrderApi__Is_Potential_Duplicate__c: true,
    }),
];

/** The intentional duplicate-contact pair (Id, email) for record-match-style dedup tests. */
export const DUPLICATE_CONTACT_PAIR = {
    original: { Id: sfId('Contact', 2), Email: 'example+2@example.com' },
    duplicate: { Id: sfId('Contact', 10), Email: 'EXAMPLE+2@EXAMPLE.COM' },
};

// ─── Memberships (4) ────────────────────────────────────────────────────

export const MEMBERSHIPS: SFRecord[] = [
    withSystem('OrderApi__Membership__c', sfId('Membership', 1), '2026-02-10T12:00:00.000Z', false, {
        Name: 'M-0001',
        OrderApi__Contact__c: sfId('Contact', 1),
        OrderApi__Status__c: 'Active',
        OrderApi__Start_Date__c: '2026-01-01',
        OrderApi__End_Date__c: '2026-12-31',
    }),
    withSystem('OrderApi__Membership__c', sfId('Membership', 2), '2026-02-10T12:05:00.000Z', false, {
        Name: 'M-0002',
        OrderApi__Contact__c: sfId('Contact', 2),
        OrderApi__Status__c: 'Active',
        OrderApi__Start_Date__c: '2026-01-01',
        OrderApi__End_Date__c: '2026-12-31',
    }),
    withSystem('OrderApi__Membership__c', sfId('Membership', 3), '2026-02-10T12:10:00.000Z', false, {
        Name: 'M-0003',
        OrderApi__Contact__c: sfId('Contact', 5),
        OrderApi__Status__c: 'Active',
        OrderApi__Start_Date__c: '2026-01-01',
        OrderApi__End_Date__c: '2026-12-31',
    }),
    withSystem('OrderApi__Membership__c', sfId('Membership', 4), '2026-02-10T12:15:00.000Z', false, {
        Name: 'M-0004',
        OrderApi__Contact__c: sfId('Contact', 8),
        OrderApi__Status__c: 'Lapsed',
        OrderApi__Start_Date__c: '2025-01-01',
        OrderApi__End_Date__c: '2025-12-31',
    }),
];

// ─── Subscriptions (3: incl. 1 EXPIRED) ─────────────────────────────────

export const SUBSCRIPTIONS: SFRecord[] = [
    withSystem('OrderApi__Subscription__c', sfId('Subscription', 1), '2026-02-12T08:00:00.000Z', false, {
        Name: 'S-0001',
        OrderApi__Contact__c: sfId('Contact', 1),
        OrderApi__Plan__c: 'Gold',
        OrderApi__Status__c: 'Active',
        OrderApi__End_Date__c: '2026-12-31',
    }),
    withSystem('OrderApi__Subscription__c', sfId('Subscription', 2), '2026-02-12T08:05:00.000Z', false, {
        Name: 'S-0002',
        OrderApi__Contact__c: sfId('Contact', 5),
        OrderApi__Plan__c: 'Silver',
        OrderApi__Status__c: 'Active',
        OrderApi__End_Date__c: '2026-12-31',
    }),
    // EXPIRED subscription edge case.
    withSystem('OrderApi__Subscription__c', sfId('Subscription', 3), '2026-02-12T08:10:00.000Z', false, {
        Name: 'S-0003',
        OrderApi__Contact__c: sfId('Contact', 8),
        OrderApi__Plan__c: 'Bronze',
        OrderApi__Status__c: 'Expired',
        OrderApi__End_Date__c: '2025-12-31',
    }),
];

// ─── Items / Products (5: incl. 1 INACTIVE, member/nonmember price pair) ─

export const ITEMS: SFRecord[] = [
    withSystem('OrderApi__Item__c', sfId('Item', 1), '2026-02-14T09:00:00.000Z', false, {
        Name: 'Annual Conference Registration',
        OrderApi__Item_Type__c: 'Event',
        OrderApi__List_Price__c: 500,
        OrderApi__Member_Price__c: 350,
        OrderApi__Is_Active__c: true,
    }),
    withSystem('OrderApi__Item__c', sfId('Item', 2), '2026-02-14T09:05:00.000Z', false, {
        Name: 'Membership Dues - Standard',
        OrderApi__Item_Type__c: 'Membership',
        OrderApi__List_Price__c: 200,
        OrderApi__Member_Price__c: 200,
        OrderApi__Is_Active__c: true,
    }),
    withSystem('OrderApi__Item__c', sfId('Item', 3), '2026-02-14T09:10:00.000Z', false, {
        Name: 'Publication - Annual Report',
        OrderApi__Item_Type__c: 'Merchandise',
        OrderApi__List_Price__c: 75,
        OrderApi__Member_Price__c: 50,
        OrderApi__Is_Active__c: true,
    }),
    withSystem('OrderApi__Item__c', sfId('Item', 4), '2026-02-14T09:15:00.000Z', false, {
        Name: 'Webinar Series Subscription',
        OrderApi__Item_Type__c: 'Subscription',
        OrderApi__List_Price__c: 120,
        OrderApi__Member_Price__c: 90,
        OrderApi__Is_Active__c: true,
    }),
    // INACTIVE item edge case (pricing should be unavailable).
    withSystem('OrderApi__Item__c', sfId('Item', 5), '2026-02-14T09:20:00.000Z', false, {
        Name: 'Retired Course (Inactive)',
        OrderApi__Item_Type__c: 'Course',
        OrderApi__List_Price__c: 300,
        OrderApi__Member_Price__c: 250,
        OrderApi__Is_Active__c: false,
    }),
];

/** Member-vs-nonmember price pair on Item #1 (fontevacontext.md §11 explicit case). */
export const MEMBER_VS_NONMEMBER_PRICE = {
    itemId: sfId('Item', 1),
    listPrice: 500,
    memberPrice: 350,
};

// ─── Events (3) ─────────────────────────────────────────────────────────

export const EVENTS: SFRecord[] = [
    withSystem('EventApi__Event__c', sfId('Event', 1), '2026-02-16T07:00:00.000Z', false, {
        Name: 'Annual Conference 2026',
        EventApi__Start_Date__c: '2026-06-01',
        EventApi__End_Date__c: '2026-06-03',
        EventApi__Status__c: 'Open',
        EventApi__Capacity__c: 500,
    }),
    withSystem('EventApi__Event__c', sfId('Event', 2), '2026-02-16T07:05:00.000Z', false, {
        Name: 'Regional Summit Spring',
        EventApi__Start_Date__c: '2026-04-10',
        EventApi__End_Date__c: '2026-04-11',
        EventApi__Status__c: 'Open',
        EventApi__Capacity__c: 150,
    }),
    withSystem('EventApi__Event__c', sfId('Event', 3), '2026-02-16T07:10:00.000Z', false, {
        Name: 'Workshop Series Closed',
        EventApi__Start_Date__c: '2026-03-01',
        EventApi__End_Date__c: '2026-03-01',
        EventApi__Status__c: 'Closed',
        EventApi__Capacity__c: 30,
    }),
];

// ─── Event Registrations (6: incl. 1 CANCELLED) ─────────────────────────

export const REGISTRATIONS: SFRecord[] = [
    withSystem('EventApi__Event_Registration__c', sfId('Registration', 1), '2026-02-18T11:00:00.000Z', false, {
        Name: 'REG-0001',
        EventApi__Event__c: sfId('Event', 1),
        EventApi__Contact__c: sfId('Contact', 1),
        EventApi__Status__c: 'Registered',
    }),
    withSystem('EventApi__Event_Registration__c', sfId('Registration', 2), '2026-02-18T11:05:00.000Z', false, {
        Name: 'REG-0002',
        EventApi__Event__c: sfId('Event', 1),
        EventApi__Contact__c: sfId('Contact', 2),
        EventApi__Status__c: 'Registered',
    }),
    withSystem('EventApi__Event_Registration__c', sfId('Registration', 3), '2026-02-18T11:10:00.000Z', false, {
        Name: 'REG-0003',
        EventApi__Event__c: sfId('Event', 1),
        EventApi__Contact__c: sfId('Contact', 5),
        EventApi__Status__c: 'Attended',
    }),
    withSystem('EventApi__Event_Registration__c', sfId('Registration', 4), '2026-02-18T11:15:00.000Z', false, {
        Name: 'REG-0004',
        EventApi__Event__c: sfId('Event', 2),
        EventApi__Contact__c: sfId('Contact', 6),
        EventApi__Status__c: 'Registered',
    }),
    withSystem('EventApi__Event_Registration__c', sfId('Registration', 5), '2026-02-18T11:20:00.000Z', false, {
        Name: 'REG-0005',
        EventApi__Event__c: sfId('Event', 2),
        EventApi__Contact__c: sfId('Contact', 8),
        EventApi__Status__c: 'Waitlisted',
    }),
    // CANCELLED registration edge case.
    withSystem('EventApi__Event_Registration__c', sfId('Registration', 6), '2026-02-18T11:25:00.000Z', false, {
        Name: 'REG-0006',
        EventApi__Event__c: sfId('Event', 1),
        EventApi__Contact__c: sfId('Contact', 3),
        EventApi__Status__c: 'Cancelled',
    }),
];

// ─── Sales Orders (4) ───────────────────────────────────────────────────

export const SALES_ORDERS: SFRecord[] = [
    withSystem('OrderApi__Sales_Order__c', sfId('SalesOrder', 1), '2026-02-20T13:00:00.000Z', false, {
        Name: 'SO-0001',
        OrderApi__Account__c: sfId('Account', 1),
        OrderApi__Bill_To__c: sfId('Contact', 1),
        OrderApi__Is_Posted__c: true,
        OrderApi__Status__c: 'Posted',
        OrderApi__Total__c: 850,
        OrderApi__Balance_Due__c: 0,
    }),
    withSystem('OrderApi__Sales_Order__c', sfId('SalesOrder', 2), '2026-02-20T13:05:00.000Z', false, {
        Name: 'SO-0002',
        OrderApi__Account__c: sfId('Account', 2),
        OrderApi__Bill_To__c: sfId('Contact', 3),
        OrderApi__Is_Posted__c: false,
        OrderApi__Status__c: 'Proforma',
        OrderApi__Total__c: 500,
        OrderApi__Balance_Due__c: 500,
    }),
    withSystem('OrderApi__Sales_Order__c', sfId('SalesOrder', 3), '2026-02-20T13:10:00.000Z', false, {
        Name: 'SO-0003',
        OrderApi__Account__c: sfId('Account', 3),
        OrderApi__Bill_To__c: sfId('Contact', 5),
        OrderApi__Is_Posted__c: false,
        OrderApi__Status__c: 'Draft',
        OrderApi__Total__c: 120,
        OrderApi__Balance_Due__c: 120,
    }),
    withSystem('OrderApi__Sales_Order__c', sfId('SalesOrder', 4), '2026-02-20T13:15:00.000Z', false, {
        Name: 'SO-0004',
        OrderApi__Account__c: sfId('Account', 1),
        OrderApi__Bill_To__c: sfId('Contact', 6),
        OrderApi__Is_Posted__c: true,
        OrderApi__Status__c: 'Posted',
        OrderApi__Total__c: 275,
        OrderApi__Balance_Due__c: 100,
    }),
];

// ─── Sales Order Lines (8: incl. 1 TAX line) ────────────────────────────

export const SALES_ORDER_LINES: SFRecord[] = [
    withSystem('OrderApi__Sales_Order_Line__c', sfId('SalesOrderLine', 1), '2026-02-20T13:00:01.000Z', false, {
        Name: 'SOL-0001',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 1),
        OrderApi__Item__c: sfId('Item', 1),
        OrderApi__Quantity__c: 1,
        OrderApi__Unit_Price__c: 350,
        OrderApi__Line_Type__c: 'Product',
    }),
    withSystem('OrderApi__Sales_Order_Line__c', sfId('SalesOrderLine', 2), '2026-02-20T13:00:02.000Z', false, {
        Name: 'SOL-0002',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 1),
        OrderApi__Item__c: sfId('Item', 3),
        OrderApi__Quantity__c: 2,
        OrderApi__Unit_Price__c: 50,
        OrderApi__Line_Type__c: 'Product',
    }),
    // TAX line edge case.
    withSystem('OrderApi__Sales_Order_Line__c', sfId('SalesOrderLine', 3), '2026-02-20T13:00:03.000Z', false, {
        Name: 'SOL-0003',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 1),
        OrderApi__Item__c: null,
        OrderApi__Quantity__c: 1,
        OrderApi__Unit_Price__c: 50,
        OrderApi__Line_Type__c: 'Tax',
    }),
    withSystem('OrderApi__Sales_Order_Line__c', sfId('SalesOrderLine', 4), '2026-02-20T13:05:01.000Z', false, {
        Name: 'SOL-0004',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 2),
        OrderApi__Item__c: sfId('Item', 1),
        OrderApi__Quantity__c: 1,
        OrderApi__Unit_Price__c: 500,
        OrderApi__Line_Type__c: 'Product',
    }),
    withSystem('OrderApi__Sales_Order_Line__c', sfId('SalesOrderLine', 5), '2026-02-20T13:10:01.000Z', false, {
        Name: 'SOL-0005',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 3),
        OrderApi__Item__c: sfId('Item', 4),
        OrderApi__Quantity__c: 1,
        OrderApi__Unit_Price__c: 90,
        OrderApi__Line_Type__c: 'Product',
    }),
    withSystem('OrderApi__Sales_Order_Line__c', sfId('SalesOrderLine', 6), '2026-02-20T13:10:02.000Z', false, {
        Name: 'SOL-0006',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 3),
        OrderApi__Item__c: sfId('Item', 3),
        OrderApi__Quantity__c: 1,
        OrderApi__Unit_Price__c: 30,
        OrderApi__Line_Type__c: 'Product',
    }),
    withSystem('OrderApi__Sales_Order_Line__c', sfId('SalesOrderLine', 7), '2026-02-20T13:15:01.000Z', false, {
        Name: 'SOL-0007',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 4),
        OrderApi__Item__c: sfId('Item', 1),
        OrderApi__Quantity__c: 1,
        OrderApi__Unit_Price__c: 175,
        OrderApi__Line_Type__c: 'Product',
    }),
    withSystem('OrderApi__Sales_Order_Line__c', sfId('SalesOrderLine', 8), '2026-02-20T13:15:02.000Z', false, {
        Name: 'SOL-0008',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 4),
        OrderApi__Item__c: sfId('Item', 3),
        OrderApi__Quantity__c: 2,
        OrderApi__Unit_Price__c: 50,
        OrderApi__Line_Type__c: 'Product',
    }),
];

// ─── ePayments (3: incl. 1 FAILED) ──────────────────────────────────────

export const EPAYMENTS: SFRecord[] = [
    withSystem('OrderApi__ePayment__c', sfId('EPayment', 1), '2026-02-22T14:00:00.000Z', false, {
        Name: 'EP-0001',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 1),
        OrderApi__Amount__c: 850,
        OrderApi__Status__c: 'Captured',
        OrderApi__Payment_Method__c: 'Credit Card',
    }),
    withSystem('OrderApi__ePayment__c', sfId('EPayment', 2), '2026-02-22T14:05:00.000Z', false, {
        Name: 'EP-0002',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 4),
        OrderApi__Amount__c: 175,
        OrderApi__Status__c: 'Captured',
        OrderApi__Payment_Method__c: 'Credit Card',
    }),
    // FAILED / DECLINED payment edge case.
    withSystem('OrderApi__ePayment__c', sfId('EPayment', 3), '2026-02-22T14:10:00.000Z', false, {
        Name: 'EP-0003',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 2),
        OrderApi__Amount__c: 500,
        OrderApi__Status__c: 'Declined',
        OrderApi__Payment_Method__c: 'Credit Card',
        OrderApi__Decline_Reason__c: 'Insufficient funds',
    }),
];

// ─── Receipts (2) ───────────────────────────────────────────────────────

export const RECEIPTS: SFRecord[] = [
    withSystem('OrderApi__Receipt__c', sfId('Receipt', 1), '2026-02-22T14:00:01.000Z', false, {
        Name: 'RCPT-0001',
        OrderApi__ePayment__c: sfId('EPayment', 1),
        OrderApi__Amount__c: 850,
    }),
    withSystem('OrderApi__Receipt__c', sfId('Receipt', 2), '2026-02-22T14:05:01.000Z', false, {
        Name: 'RCPT-0002',
        OrderApi__ePayment__c: sfId('EPayment', 2),
        OrderApi__Amount__c: 175,
    }),
];

// ─── Journal entries (2) ────────────────────────────────────────────────

export const JOURNALS: SFRecord[] = [
    withSystem('OrderApi__Journal_Entry__c', sfId('Journal', 1), '2026-02-23T15:00:00.000Z', false, {
        Name: 'JE-0001',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 1),
        OrderApi__Debit__c: 850,
        OrderApi__Credit__c: 0,
    }),
    withSystem('OrderApi__Journal_Entry__c', sfId('Journal', 2), '2026-02-23T15:05:00.000Z', false, {
        Name: 'JE-0002',
        OrderApi__Sales_Order__c: sfId('SalesOrder', 1),
        OrderApi__Debit__c: 0,
        OrderApi__Credit__c: 850,
    }),
];

// ─── Stores (2) ─────────────────────────────────────────────────────────

export const STORES: SFRecord[] = [
    withSystem('OrderApi__Store__c', sfId('Store', 1), '2026-02-24T16:00:00.000Z', false, {
        Name: 'Main Member Store',
        OrderApi__Is_Active__c: true,
    }),
    withSystem('OrderApi__Store__c', sfId('Store', 2), '2026-02-24T16:05:00.000Z', false, {
        Name: 'Events Store',
        OrderApi__Is_Active__c: true,
    }),
];

// ─── Custom fields (5) — exercises custom-column passthrough ─────────────
// Five unmapped/custom __c fields the metadata does NOT declare. Used to prove the
// full-record pass-through contract preserves them in ExternalRecord.Fields.

export const CUSTOM_FIELD_NAMES = [
    'OrderApi__Custom_Loyalty_Tier__c',
    'OrderApi__Custom_Referral_Source__c',
    'OrderApi__Custom_Chapter_Code__c',
    'EventApi__Custom_Dietary_Pref__c',
    'OrderApi__Custom_External_Ref__c',
] as const;

/** A Contact record carrying all 5 custom fields (none declared in metadata). */
export const CONTACT_WITH_CUSTOM_FIELDS: SFRecord = withSystem(
    'Contact', sfId('Contact', 1), '2026-03-01T10:00:00.000Z', false, {
        FirstName: '<scrubbed-name-2>', LastName: '<scrubbed-name-3>',
        Email: 'example+1@example.com',
        AccountId: sfId('Account', 1),
        OrderApi__Custom_Loyalty_Tier__c: 'Platinum',
        OrderApi__Custom_Referral_Source__c: 'Annual Conference',
        OrderApi__Custom_Chapter_Code__c: 'CH-NORTH',
        EventApi__Custom_Dietary_Pref__c: 'Vegetarian',
        OrderApi__Custom_External_Ref__c: 'EXT-99887',
    }
);

// ─── One DELETED record (IsDeleted=true) for the soft-delete sync path ───

export const DELETED_REGISTRATION: SFRecord = withSystem(
    'EventApi__Event_Registration__c', sfId('Registration', 99), '2026-03-02T12:00:00.000Z', true, {
        Name: 'REG-0099',
        EventApi__Event__c: sfId('Event', 1),
        EventApi__Contact__c: sfId('Contact', 9),
        EventApi__Status__c: 'Cancelled',
    }
);

// ─── camelCase wrapper shapes (FDService domain-service responses) ──────
// fontevacontext.md §4: FDService returns almost all fields camel-cased
// (OrderApi__Is_Posted__c → isPosted), under the wrapper
// {statusMessage, statusCode, metadata, errors, errorMap, data}.

/** The documented Fonteva service-response wrapper. */
export interface FontevaServiceWrapper<T> {
    statusMessage: string | null;
    statusCode: string | null;
    metadata: Record<string, unknown>;
    errors: Array<{ code?: string; message?: string }>;
    errorMap: Record<string, unknown> | null;
    data: T;
}

/** camelCase order record as an FDService OrderService GET returns it. */
export interface FDServiceOrderRecord {
    id: string;
    name: string;
    account: string;
    billTo: string;
    isPosted: boolean;
    status: string;
    total: number;
    balanceDue: number;
    SystemModstamp: string;
    [key: string]: unknown;
}

/** Wraps a data payload in the documented Fonteva service wrapper. */
export function wrapFontevaService<T>(data: T, overrides: Partial<FontevaServiceWrapper<T>> = {}): FontevaServiceWrapper<T> {
    return {
        statusMessage: null,
        statusCode: null,
        metadata: {},
        errors: [],
        errorMap: null,
        data,
        ...overrides,
    };
}

/** The 4 Sales Orders rendered in FDService camelCase form (for wrapper/mapping tests). */
export const FDSERVICE_ORDERS: FDServiceOrderRecord[] = SALES_ORDERS.map((so, i) => ({
    id: so.Id,
    name: so.Name as string,
    account: so.OrderApi__Account__c as string,
    billTo: so.OrderApi__Bill_To__c as string,
    isPosted: so.OrderApi__Is_Posted__c as boolean,
    status: so.OrderApi__Status__c as string,
    total: so.OrderApi__Total__c as number,
    balanceDue: so.OrderApi__Balance_Due__c as number,
    SystemModstamp: so.SystemModstamp,
    // a custom field rides through the wrapper too (camelCase passthrough)
    customExternalRef: `EXT-${1000 + i}`,
}));

// ─── Dataset summary (for the test report's fixtureRecordsByObject) ─────

export const FIXTURE_COUNTS = {
    Account: ACCOUNTS.length,
    Contact: CONTACTS.length,
    Membership: MEMBERSHIPS.length,
    Subscription: SUBSCRIPTIONS.length,
    Item: ITEMS.length,
    Event: EVENTS.length,
    Registration: REGISTRATIONS.length,
    SalesOrder: SALES_ORDERS.length,
    SalesOrderLine: SALES_ORDER_LINES.length,
    EPayment: EPAYMENTS.length,
    Receipt: RECEIPTS.length,
    Journal: JOURNALS.length,
    Store: STORES.length,
    CustomFields: CUSTOM_FIELD_NAMES.length,
} as const;

/** A SOQL-shaped query response envelope around a set of records (done=true single page). */
export function soqlResponse(records: SFRecord[], done = true, nextRecordsUrl?: string): {
    totalSize: number;
    done: boolean;
    nextRecordsUrl?: string;
    records: SFRecord[];
} {
    return {
        totalSize: records.length,
        done,
        ...(nextRecordsUrl ? { nextRecordsUrl } : {}),
        records,
    };
}

/** Minimal describe response (just queryable field names) for a set of API field names. */
export function describeResponse(fieldNames: string[]): { fields: Array<Record<string, unknown>> } {
    return {
        fields: fieldNames.map(name => ({
            name,
            label: name,
            type: name === 'Id' ? 'id' : name === 'SystemModstamp' || name === 'LastModifiedDate' || name === 'CreatedDate' ? 'datetime' : name === 'IsDeleted' ? 'boolean' : 'string',
            length: name === 'Id' ? 18 : 255,
            precision: 0, scale: 0,
            nillable: name !== 'Id',
            createable: name !== 'Id' && name !== 'SystemModstamp' && name !== 'IsDeleted',
            updateable: name !== 'Id' && name !== 'SystemModstamp' && name !== 'IsDeleted',
            custom: name.endsWith('__c'),
            calculated: false, externalId: false, defaultedOnCreate: false,
            defaultValue: null, inlineHelpText: null, referenceTo: [], relationshipName: null,
        })),
    };
}

/** Distinct API field names appearing across a set of records (for the describe mock). */
export function fieldNamesOf(records: SFRecord[]): string[] {
    const names = new Set<string>();
    for (const r of records) {
        for (const k of Object.keys(r)) {
            if (k === 'attributes') continue;
            names.add(k);
        }
    }
    return [...names];
}
