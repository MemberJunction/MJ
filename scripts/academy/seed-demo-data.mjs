/**
 * MJ Academy — demo seed data for the Harbor Street shelter app.
 *
 * Writes through the REAL GraphQL API (CreateMJBreed / CreateMJHousing / CreateMJAnimal /
 * CreateMJCareLog), never straight into the tables. That matters for two reasons: the rows go
 * through BaseEntity save, its validation and the CRUD sprocs exactly as the app would create
 * them, and every row lands in `MJ: Record Changes` with a real actor -- so the audit trail is
 * not a lie. A raw INSERT would produce rows that look right and skip all of that.
 *
 * Auth: the system API key (`MJ_API_KEY` in packages/MJAPI/.env, sent as `x-mj-api-key`), which
 * authenticates as the MJ system user. Local dev only.
 *
 * Idempotent: re-running deletes nothing, but it checks first and skips any entity that already
 * has rows, so it will not duplicate. Use --force to add a second batch anyway.
 *
 *   node scripts/academy/seed-demo-data.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV = resolve(HERE, '../../packages/MJAPI/.env');
const ENDPOINT = process.env.MJ_GRAPHQL_URL ?? 'http://localhost:4000/';
const FORCE = process.argv.includes('--force');

const apiKey = readFileSync(ENV, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('MJ_API_KEY='))
    ?.split('=')[1]
    ?.trim();
if (!apiKey) {
    console.error('No MJ_API_KEY in packages/MJAPI/.env — add one and restart MJAPI.');
    process.exit(1);
}

async function gql(query, variables) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mj-api-key': apiKey },
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    // A GraphQL error arrives with HTTP 200 and an `errors` array -- checking res.ok alone would
    // report a failed write as a success, which is the whole trap this guards.
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json.data;
}

/** Row count for an entity, via the same RunView path the app uses. */
async function count(entityName) {
    const d = await gql(
        `query($e:String!){ GetData(input:{EntityName:$e, MaxRows:1}) { TotalRowCount } }`,
        { e: entityName },
    ).catch(() => null);
    return d?.GetData?.TotalRowCount ?? null;
}

/** A 1x1 transparent PNG — a genuinely valid base64 image, so the field holds real data. */
const PIXEL_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAX+ncogAAAABJRU5ErkJggg==';

/** Dates are computed relative to today so "overdue" stays true however long this sits unused. */
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(today.getTime() - n * 86400000));
const daysAhead = (n) => iso(new Date(today.getTime() + n * 86400000));

// ── Breeds: both species, every SizeCategory value represented ────────────────
const BREEDS = [
    { Name: 'Beagle',              Species: 'Dog', SizeCategory: 'Small',  TypicalLifespanYears: 14, IsActive: true },
    { Name: 'Border Collie',       Species: 'Dog', SizeCategory: 'Medium', TypicalLifespanYears: 13, IsActive: true },
    { Name: 'German Shepherd',     Species: 'Dog', SizeCategory: 'Large',  TypicalLifespanYears: 11, IsActive: true },
    { Name: 'Great Dane',          Species: 'Dog', SizeCategory: 'Giant',  TypicalLifespanYears: 8,  IsActive: true },
    { Name: 'Retired Mix Listing', Species: 'Dog', SizeCategory: 'Medium', TypicalLifespanYears: 12, IsActive: false },
    { Name: 'Domestic Shorthair',  Species: 'Cat', SizeCategory: 'Small',  TypicalLifespanYears: 15, IsActive: true },
    { Name: 'Maine Coon',          Species: 'Cat', SizeCategory: 'Large',  TypicalLifespanYears: 12, IsActive: true },
];

// ── Housing: both species plus 'Any', a quarantine unit, and one out of service ──
const HOUSINGS = [
    { Name: 'Kennel A-1',   Building: 'A', Species: 'Dog', Capacity: 3, IsQuarantine: false, IsActive: true },
    { Name: 'Kennel A-3',   Building: 'A', Species: 'Dog', Capacity: 3, IsQuarantine: false, IsActive: true },
    { Name: 'Kennel B-1',   Building: 'B', Species: 'Dog', Capacity: 2, IsQuarantine: false, IsActive: true },
    { Name: 'Cattery C-1',  Building: 'C', Species: 'Cat', Capacity: 4, IsQuarantine: false, IsActive: true },
    { Name: 'Cattery C-4',  Building: 'C', Species: 'Cat', Capacity: 4, IsQuarantine: false, IsActive: true },
    { Name: 'Isolation M-1',Building: 'M', Species: 'Any', Capacity: 2, IsQuarantine: true,  IsActive: true },
    { Name: 'Kennel D-9',   Building: 'D', Species: 'Dog', Capacity: 2, IsQuarantine: false, IsActive: false },
];

/**
 * Animals. Every Status and IntakeReason value appears at least once, so the dashboard's status
 * bar has all five segments and the grid's filters have something to bite on. Adopted and
 * Transferred animals deliberately carry no housing -- they have left the shelter.
 */
const ANIMALS = [
    { Name: 'Biscuit',  Species: 'Dog', Breed: 'Beagle',             Housing: 'Kennel A-3',    Status: 'Hold',        IntakeReason: 'Stray',     Sex: 'Female',  Micro: '985141004512779', IntakeDaysAgo: 51, BirthDaysAgo: 900,  WeightKg: 11.4, Description: 'Sweet, food-motivated beagle. Underweight at intake, gaining steadily. Good with other dogs; not yet cat-tested.' },
    { Name: 'Willa',    Species: 'Dog', Breed: 'Border Collie',      Housing: 'Kennel A-3',    Status: 'Available',   IntakeReason: 'Surrender', Sex: 'Female',  Micro: '985141004512780', IntakeDaysAgo: 12, BirthDaysAgo: 1500, WeightKg: 18.2, Description: 'Bright and busy. Needs a job and a yard. Knows sit and down; pulls hard on lead.' },
    { Name: 'Sable',    Species: 'Dog', Breed: 'German Shepherd',    Housing: null,            Status: 'Adopted',     IntakeReason: 'Transfer',  Sex: 'Male',    Micro: '985141004512781', IntakeDaysAgo: 68, BirthDaysAgo: 2100, WeightKg: 34.0, Description: 'Adopted by a repeat adopter in July. Confident, crate-trained, good with older children.' },
    { Name: 'Otis',     Species: 'Dog', Breed: 'Great Dane',         Housing: 'Kennel A-1',    Status: 'Hold',        IntakeReason: 'Returned',  Sex: 'Male',    Micro: '985141004512782', IntakeDaysAgo: 16, BirthDaysAgo: 1200, WeightKg: 52.5, Description: 'Returned after a failed placement — leash reactivity toward other dogs. In behaviour programme, progressing well.' },
    { Name: 'Marlowe',  Species: 'Dog', Breed: 'Beagle',             Housing: 'Kennel B-1',    Status: 'Hold',        IntakeReason: 'Stray',     Sex: 'Male',    Micro: '985141004512783', IntakeDaysAgo: 35, BirthDaysAgo: 1050, WeightKg: 12.8, Description: 'Bilateral ear infection at intake, on drops. Vocal but friendly. Loves a tennis ball.' },
    { Name: 'Rufus',    Species: 'Dog', Breed: 'Border Collie',      Housing: 'Kennel A-1',    Status: 'Intake',      IntakeReason: 'Stray',     Sex: 'Male',    Micro: '985141004512784', IntakeDaysAgo: 2,  BirthDaysAgo: 800,  WeightKg: 16.1, Description: 'Found on Harbor Street. No collar, no chip on arrival — chipped here. Awaiting stray hold expiry.' },
    { Name: 'Poppy',    Species: 'Dog', Breed: 'German Shepherd',    Housing: 'Kennel B-1',    Status: 'Available',   IntakeReason: 'Surrender', Sex: 'Female',  Micro: '985141004512785', IntakeDaysAgo: 24, BirthDaysAgo: 1700, WeightKg: 29.7, Description: 'Surrendered due to a house move. House-trained, quiet in a crate, walks nicely.' },
    { Name: 'Gus',      Species: 'Dog', Breed: 'Great Dane',         Housing: null,            Status: 'Transferred', IntakeReason: 'Transfer',  Sex: 'Male',    Micro: '985141004512786', IntakeDaysAgo: 44, BirthDaysAgo: 1400, WeightKg: 48.9, Description: 'Transferred to a breed-specific rescue with more space for a giant breed.' },
    { Name: 'Juniper',  Species: 'Cat', Breed: 'Domestic Shorthair', Housing: 'Isolation M-1', Status: 'Hold',        IntakeReason: 'Stray',     Sex: 'Female',  Micro: '985141004512787', IntakeDaysAgo: 23, BirthDaysAgo: 400,  WeightKg: 3.6,  Description: 'Spayed here; recovering in isolation. Shy but not fearful — will come out for wet food.' },
    { Name: 'Pepper',   Species: 'Cat', Breed: 'Domestic Shorthair', Housing: 'Cattery C-4',   Status: 'Available',   IntakeReason: 'Surrender', Sex: 'Female',  Micro: '985141004512788', IntakeDaysAgo: 30, BirthDaysAgo: 1100, WeightKg: 4.1,  Description: 'Confident lap cat. Fine with other cats, unbothered by dogs behind glass.' },
    { Name: 'Nutmeg',   Species: 'Cat', Breed: 'Maine Coon',         Housing: 'Cattery C-1',   Status: 'Available',   IntakeReason: 'Transfer',  Sex: 'Female',  Micro: '985141004512789', IntakeDaysAgo: 56, BirthDaysAgo: 1900, WeightKg: 6.8,  Description: 'Long coat needs weekly grooming. Placid, tolerates handling, good with children.' },
    { Name: 'Clementine',Species:'Cat', Breed: 'Maine Coon',         Housing: 'Cattery C-1',   Status: 'Intake',      IntakeReason: 'Other',     Sex: 'Unknown', Micro: '985141004512790', IntakeDaysAgo: 4,  BirthDaysAgo: 300,  WeightKg: 2.9,  Description: 'Brought in by a member of the public; circumstances unclear. Intake exam pending, sex not yet confirmed.' },
    { Name: 'Domino',   Species: 'Cat', Breed: 'Domestic Shorthair', Housing: 'Cattery C-4',   Status: 'Available',   IntakeReason: 'Returned',  Sex: 'Male',    Micro: '985141004512791', IntakeDaysAgo: 9,  BirthDaysAgo: 950,  WeightKg: 4.7,  Description: 'Returned after a household allergy. No behaviour concerns; known quantity, easy placement.' },
    { Name: 'Mabel',    Species: 'Cat', Breed: 'Maine Coon',         Housing: 'Isolation M-1', Status: 'Hold',        IntakeReason: 'Stray',     Sex: 'Female',  Micro: '985141004512792', IntakeDaysAgo: 7,  BirthDaysAgo: 1300, WeightKg: 5.2,  Description: 'Upper respiratory infection — isolated and on antibiotics. Appetite good, prognosis good.' },
];

/**
 * Care logs. Every CareType appears; five are OVERDUE (follow-up in the past, not complete) so
 * the dashboard's warning tile and its queue have real content, and several are complete so the
 * card is not uniformly red.
 */
const CARE = [
    { Animal: 'Biscuit',    CareType: 'Exam',        DaysAgo: 51, Description: 'Intake exam. Underweight, coat poor, no obvious injury.',        PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: -32, Notes: 'Start weight-gain diet; recheck in three weeks.' },
    { Animal: 'Biscuit',    CareType: 'Exam',        DaysAgo: 32, Description: 'Weight recheck — up 1.8kg. Cleared for vaccination.',           PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: null, Notes: 'Good progress. Proceed to DHPP.' },
    { Animal: 'Biscuit',    CareType: 'Vaccination', DaysAgo: 3,  Description: 'DHPP, first of two.',                                            PerformedBy: 'Dr. Halloran', IsComplete: false, FollowUpIn: -1,  Notes: 'Second dose due — OVERDUE, book this week.' },
    { Animal: 'Marlowe',    CareType: 'Exam',        DaysAgo: 35, Description: 'Intake exam. Bilateral ear infection noted.',                    PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: -21, Notes: 'Otic drops twice daily for 14 days.' },
    { Animal: 'Marlowe',    CareType: 'Treatment',   DaysAgo: 21, Description: 'Ear drops course completed.',                                    PerformedBy: 'R. Okonkwo',   IsComplete: false, FollowUpIn: -4,  Notes: 'Recheck to confirm resolution — OVERDUE.' },
    { Animal: 'Juniper',    CareType: 'Surgery',     DaysAgo: 9,  Description: 'Spay. Routine, no complications.',                               PerformedBy: 'Dr. Halloran', IsComplete: false, FollowUpIn: -2,  Notes: 'Post-op check and suture removal — OVERDUE.' },
    { Animal: 'Otis',       CareType: 'Behavioral',  DaysAgo: 14, Description: 'Leash reactivity assessment. Reactive to dogs within 5m.',       PerformedBy: 'M. Vance',     IsComplete: true,  FollowUpIn: -7,  Notes: 'Begin counter-conditioning, three sessions weekly.' },
    { Animal: 'Otis',       CareType: 'Behavioral',  DaysAgo: 5,  Description: 'Session 3. Threshold improved to roughly 2m.',                   PerformedBy: 'M. Vance',     IsComplete: false, FollowUpIn: -1,  Notes: 'Re-assessment due — OVERDUE.' },
    { Animal: 'Pepper',     CareType: 'Vaccination', DaysAgo: 28, Description: 'FVRCP and rabies.',                                              PerformedBy: 'Dr. Halloran', IsComplete: false, FollowUpIn: -3,  Notes: 'Rabies booster due — OVERDUE.' },
    { Animal: 'Pepper',     CareType: 'Grooming',    DaysAgo: 6,  Description: 'Nail trim and brush-out.',                                       PerformedBy: 'R. Okonkwo',   IsComplete: true,  FollowUpIn: 24,  Notes: 'Monthly is enough for this coat.' },
    { Animal: 'Nutmeg',     CareType: 'Vaccination', DaysAgo: 50, Description: 'FVRCP, rabies, and FeLV test (negative).',                       PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: null, Notes: 'Fully vaccinated on arrival paperwork; confirmed here.' },
    { Animal: 'Nutmeg',     CareType: 'Grooming',    DaysAgo: 4,  Description: 'Full groom — mats behind both ears cleared.',                    PerformedBy: 'R. Okonkwo',   IsComplete: true,  FollowUpIn: 10,  Notes: 'Weekly brushing needed; note for adopter.' },
    { Animal: 'Willa',      CareType: 'Vaccination', DaysAgo: 11, Description: 'DHPP and rabies.',                                               PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: null, Notes: 'Complete for her age.' },
    { Animal: 'Willa',      CareType: 'Exam',        DaysAgo: 12, Description: 'Intake exam. Healthy, good body condition.',                     PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: null, Notes: 'No concerns.' },
    { Animal: 'Poppy',      CareType: 'Vaccination', DaysAgo: 23, Description: 'DHPP and rabies, records confirmed from surrendering owner.',    PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: null, Notes: 'Owner records verified.' },
    { Animal: 'Domino',     CareType: 'Vaccination', DaysAgo: 8,  Description: 'FVRCP booster.',                                                 PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: null, Notes: 'Previously vaccinated here before first adoption.' },
    { Animal: 'Mabel',      CareType: 'Treatment',   DaysAgo: 6,  Description: 'Upper respiratory infection — antibiotics started.',             PerformedBy: 'Dr. Halloran', IsComplete: false, FollowUpIn: 3,   Notes: 'Recheck in three days; still within window.' },
    { Animal: 'Rufus',      CareType: 'Exam',        DaysAgo: 2,  Description: 'Intake exam. Sound, slightly thin, no chip on arrival.',         PerformedBy: 'Dr. Halloran', IsComplete: false, FollowUpIn: 5,   Notes: 'Vaccinate once stray hold expires.' },
    { Animal: 'Clementine', CareType: 'Other',       DaysAgo: 4,  Description: 'Intake weigh-in and photograph only; full exam deferred.',       PerformedBy: 'R. Okonkwo',   IsComplete: false, FollowUpIn: 2,   Notes: 'Very young — exam booked, sex to be confirmed then.' },
    { Animal: 'Sable',      CareType: 'Exam',        DaysAgo: 60, Description: 'Pre-adoption health check. Cleared.',                            PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: null, Notes: 'Signed off for adoption.' },
    { Animal: 'Gus',        CareType: 'Exam',        DaysAgo: 40, Description: 'Pre-transfer health certificate issued.',                        PerformedBy: 'Dr. Halloran', IsComplete: true,  FollowUpIn: null, Notes: 'Paperwork travelled with him.' },
];

const M_BREED = `mutation($i:CreateMJBreedInput!){ CreateMJBreed(input:$i){ ID Name } }`;
const M_HOUSING = `mutation($i:CreateMJHousingInput!){ CreateMJHousing(input:$i){ ID Name } }`;
const M_ANIMAL = `mutation($i:CreateMJAnimalInput!){ CreateMJAnimal(input:$i){ ID Name Status } }`;
const M_CARE = `mutation($i:CreateMJCareLogInput!){ CreateMJCareLog(input:$i){ ID CareType } }`;

async function main() {
    const existing = {
        breeds: await count('MJ: Breeds'),
        housings: await count('MJ: Housings'),
        animals: await count('MJ: Animals'),
        care: await count('MJ: Care Logs'),
    };
    const anyRows = Object.values(existing).some((n) => (n ?? 0) > 0);
    if (anyRows && !FORCE) {
        console.log('Data already present — nothing written. Counts:', existing);
        console.log('Pass --force to add another batch anyway.');
        return;
    }

    const breedIds = new Map();
    for (const b of BREEDS) {
        const d = await gql(M_BREED, { i: b });
        breedIds.set(b.Name, d.CreateMJBreed.ID);
    }
    console.log(`Breeds: ${breedIds.size}`);

    const housingIds = new Map();
    for (const h of HOUSINGS) {
        const d = await gql(M_HOUSING, { i: h });
        housingIds.set(h.Name, d.CreateMJHousing.ID);
    }
    console.log(`Housing: ${housingIds.size}`);

    const animalIds = new Map();
    for (const a of ANIMALS) {
        const d = await gql(M_ANIMAL, {
            i: {
                Name: a.Name,
                Species: a.Species,
                BreedID: breedIds.get(a.Breed),
                MicrochipNumber: a.Micro,
                IntakeDate: daysAgo(a.IntakeDaysAgo),
                IntakeReason: a.IntakeReason,
                Sex: a.Sex,
                EstimatedBirthDate: daysAgo(a.BirthDaysAgo),
                WeightKg: a.WeightKg,
                Status: a.Status,
                Description: a.Description,
                PhotoBase64: PIXEL_PNG,
                HousingID: a.Housing ? housingIds.get(a.Housing) : null,
            },
        });
        animalIds.set(a.Name, d.CreateMJAnimal.ID);
    }
    console.log(`Animals: ${animalIds.size}`);

    let care = 0;
    for (const c of CARE) {
        await gql(M_CARE, {
            i: {
                AnimalID: animalIds.get(c.Animal),
                CareDate: daysAgo(c.DaysAgo),
                CareType: c.CareType,
                Description: c.Description,
                PerformedBy: c.PerformedBy,
                IsComplete: c.IsComplete,
                // FollowUpIn is relative to TODAY: negative = already due (overdue when not
                // complete), positive = still ahead. null = no follow-up needed.
                FollowUpDate: c.FollowUpIn === null ? null : c.FollowUpIn < 0 ? daysAgo(-c.FollowUpIn) : daysAhead(c.FollowUpIn),
                Notes: c.Notes,
            },
        });
        care++;
    }
    console.log(`Care logs: ${care}`);
    console.log('\nSeed complete — all rows written through GraphQL mutations.');
}

main().catch((e) => {
    console.error('SEED FAILED:', e.message);
    process.exit(1);
});
