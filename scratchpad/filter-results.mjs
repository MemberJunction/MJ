#!/usr/bin/env node
import fs from 'fs';

// Read the full results
const input = fs.readFileSync(0, 'utf-8');
const fullResults = JSON.parse(input);

// Filter to only the expected objects (the ones the agent reported emitting)
const expectedObjects = [
    "Session",
    "Report",
    "ReportReason",
    "UserNote",
    "OnlineUser",
    "EventParticipant",
    "GroupApplicant",
    "GroupInvite",
    "GroupMember",
    "GroupTag",
    "UserBadge",
    "WebhookDelivery",
    "RoleApplication"
];

const filtered = fullResults.perObject.filter(obj => expectedObjects.includes(obj.object));

// Return ONLY the filtered structured output
console.log(JSON.stringify({ perObject: filtered }, null, 2));
