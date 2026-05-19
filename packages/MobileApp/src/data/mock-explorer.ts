/**
 * Mock data for Data Explorer surfaces.
 * Replaced with RunView / RunQuery against MJAPI once auth lands.
 */

export type OppRecord = {
    id: string;
    name: string;
    account: string;
    amount: string;
    stage: 'Negotiation' | 'Proposal' | 'Discovery';
    closeDate: string;
    owner: { name: string; initials: string };
    probability: number;
};

export const MOCK_OPPORTUNITIES: OppRecord[] = [
    { id: 'opp-1', name: 'Q2 platform expansion', account: 'Acme Corp', amount: '$145K', stage: 'Negotiation', closeDate: 'Close 6/15', owner: { name: 'Sarah Park', initials: 'SP' }, probability: 70 },
    { id: 'opp-2', name: 'Annual contract — Globex', account: 'Globex Inc', amount: '$120K', stage: 'Proposal', closeDate: 'Close 7/2', owner: { name: 'Daniel Lin', initials: 'DL' }, probability: 50 },
    { id: 'opp-3', name: 'Initech expansion', account: 'Initech', amount: '$96K', stage: 'Negotiation', closeDate: 'Close 6/22', owner: { name: 'Maya Rao', initials: 'MR' }, probability: 65 },
    { id: 'opp-4', name: 'Renewal — Enterprise tier', account: 'Acme Corp', amount: '$84K', stage: 'Proposal', closeDate: 'Close 6/30', owner: { name: 'Daniel Lin', initials: 'DL' }, probability: 50 },
    { id: 'opp-5', name: 'SSO & SCIM add-on', account: 'Acme Corp', amount: '$56K', stage: 'Discovery', closeDate: 'Close 7/12', owner: { name: 'Maya Rao', initials: 'MR' }, probability: 30 },
    { id: 'opp-6', name: 'Pilot — Soylent', account: 'Soylent Corp', amount: '$42K', stage: 'Discovery', closeDate: 'Close 8/1', owner: { name: 'Sarah Park', initials: 'SP' }, probability: 25 },
];

export function getOpportunity(id: string | undefined): OppRecord | null {
    if (!id) return null;
    return MOCK_OPPORTUNITIES.find(o => o.id === id) ?? null;
}

export type QueryResultAccount = {
    id: string;
    name: string;
    arr: string;
    renewsOn: string;
    health: number;
    risk: 'high' | 'medium';
    riskPct: number;
};

export const MOCK_QUERY_RESULTS: QueryResultAccount[] = [
    { id: 'q-1', name: 'Northwind Industries', arr: '$284K', renewsOn: 'Jun 28', health: 52, risk: 'high', riskPct: 88 },
    { id: 'q-2', name: 'Soylent Corp', arr: '$192K', renewsOn: 'Jul 4', health: 58, risk: 'high', riskPct: 82 },
    { id: 'q-3', name: 'Initech', arr: '$148K', renewsOn: 'Jul 22', health: 67, risk: 'medium', riskPct: 56 },
    { id: 'q-4', name: 'Hooli', arr: '$126K', renewsOn: 'Aug 12', health: 65, risk: 'medium', riskPct: 52 },
    { id: 'q-5', name: 'Pied Piper', arr: '$108K', renewsOn: 'Aug 19', health: 69, risk: 'medium', riskPct: 48 },
];
