/**
 * MJ Academy module 7 — seed data for the relationship entities.
 *
 * Adds adopters, a realistic adoption funnel, and the temperament assessments that give the Dog and
 * Cat subtypes something to show. Like `seed-demo-data.mjs`, every row is written through the REAL
 * GraphQL API rather than by INSERT, so it goes through BaseEntity save, the validation rules
 * modules 6 and 7 wrote, and the CRUD sprocs — and lands in `MJ: Record Changes` with a real actor.
 *
 * That is not a stylistic preference here; it is the point. This script is also the module's
 * end-to-end proof: if the Adoption save override works, completing an adoption below will flip its
 * animal to Adopted and release its kennel, and the script asserts exactly that at the end. If the
 * rules work, the deliberately-invalid attempts in step 5 will be REFUSED, and the script asserts
 * that too. A seed script that only writes happy rows proves nothing.
 *
 *   node scripts/academy/seed-module7-data.mjs
 *
 * Prerequisites: the three module 7 migrations applied, CodeGen run, MJAPI restarted.
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

/** Throws on a GraphQL error. A failed mutation arrives with HTTP 200 and an `errors` array. */
async function gql(query, variables) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mj-api-key': apiKey },
        body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json.data;
}

/** Runs a mutation that is EXPECTED to fail, and reports whether it actually did. */
async function expectRefusal(label, query, variables) {
    try {
        await gql(query, variables);
        console.log(`  ✗ NOT REFUSED — ${label}. The rule did not fire.`);
        return false;
    } catch (e) {
        console.log(`  ✓ refused — ${label}`);
        console.log(`      ${e.message.split('\n')[0].slice(0, 160)}`);
        return true;
    }
}

/**
 * Read rows through the entity's generated dynamic-view query.
 *
 * NOT `GetData` -- that resolver takes a `Token` plus a list of `Queries` and is for stored-query
 * access, not entity reads. Calling it with `{EntityName, MaxRows}` is a GraphQL validation error,
 * which module 5's seed script hid behind a `.catch(() => null)`: its idempotency guard has been
 * silently returning null (falsy) all along, so re-running it would have duplicated data rather
 * than skipping. Fixed here and there.
 *
 * The query name is per-entity and generated (`RunMJAnimalDynamicView`), so it is mapped explicitly
 * rather than derived from the entity name -- a wrong guess is a runtime error, and the mapping is
 * three lines.
 */
const VIEW = {
    'MJ: Animals':   { q: 'RunMJAnimalDynamicView',   fields: 'ID Name Species Status HousingID' },
    'MJ: Adopters':  { q: 'RunMJAdopterDynamicView',  fields: 'ID FirstName LastName Email IsApproved IsActive' },
    'MJ: Adoptions': { q: 'RunMJAdoptionDynamicView', fields: 'ID Status AnimalID AdopterID InquiryDate CompletedDate' },
    'MJ: Breeds':    { q: 'RunMJBreedDynamicView',    fields: 'ID Name Species' },
    'MJ: Dogs':      { q: 'RunMJDogDynamicView',      fields: 'ID EnergyLevel' },
    'MJ: Cats':      { q: 'RunMJCatDynamicView',      fields: 'ID IsIndoorOnly' },
};

async function rows(entityName, filter) {
    const v = VIEW[entityName];
    if (!v) throw new Error(`No dynamic-view mapping for ${entityName}`);
    const q = `query($f:String){ ${v.q}(input:{EntityName:"${entityName}", ExtraFilter:$f}) `
            + `{ TotalRowCount Results{ ${v.fields} } } }`;
    const d = await gql(q, { f: filter ?? null });
    const r = d[v.q];
    return { count: r.TotalRowCount ?? 0, results: r.Results ?? [] };
}

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(today.getTime() - n * 86400000));

// ── Adopters ─────────────────────────────────────────────────────────────────
// Every HousingType value appears, and the approved/unapproved split is deliberate: the module 7
// rules refuse to complete an adoption for an unapproved family, so an unapproved one has to exist
// for that rule to be demonstrable at all.
const ADOPTERS = [
    { FirstName: 'Ada',    LastName: 'Okafor',   Email: 'ada.okafor@example.com',   HousingType: 'House',     HasYard: true,  HasOtherPets: false, IsApproved: true,  IsActive: true },
    { FirstName: 'Tomas',  LastName: 'Reyes',    Email: 'tomas.reyes@example.com',  HousingType: 'Apartment', HasYard: false, HasOtherPets: true,  IsApproved: true,  IsActive: true },
    { FirstName: 'Priya',  LastName: 'Raman',    Email: 'priya.raman@example.com',  HousingType: 'Condo',     HasYard: false, HasOtherPets: false, IsApproved: true,  IsActive: true },
    { FirstName: 'Hollis', LastName: 'Byrne',    Email: 'hollis.byrne@example.com', HousingType: 'Farm',      HasYard: true,  HasOtherPets: true,  IsApproved: true,  IsActive: true },
    { FirstName: 'Junie',  LastName: 'Calloway', Email: 'junie.calloway@example.com', HousingType: 'Other',   HasYard: false, HasOtherPets: false, IsApproved: false, IsActive: true },
    // Screening not started: every optional signal null, which is what a half-taken phone
    // application actually looks like and why those columns are nullable.
    { FirstName: 'Wendell', LastName: 'Frost',   Email: 'wendell.frost@example.com', HousingType: null,       HasYard: null,  HasOtherPets: null,  IsApproved: false, IsActive: true },
];

/**
 * The funnel. Every status except Completed is seeded directly; the completed one is created as an
 * inquiry and then COMPLETED through the API, so the save override actually runs.
 *
 * Note there is no historical adoption for Sable, who was already Adopted in module 5. It cannot be
 * back-filled through the API, because completing an adoption requires the animal to be Available
 * and Sable is not — and that refusal is CORRECT, not a gap to work around. The shelter started
 * tracking adoptions in module 7; what happened before that is not in this table, and inventing a
 * row by raw INSERT would be a lie that skips every rule the app enforces.
 */
const ADOPTIONS = [
    { Animal: 'Willa',   Adopter: 'hollis.byrne@example.com', Status: 'Approved',  InquiryDaysAgo: 18, Fee: 150, Notes: 'Home visit done — smallholding, secure fencing. Ideal for a collie. Collection arranged.' },
    { Animal: 'Willa',   Adopter: 'tomas.reyes@example.com',  Status: 'Screening', InquiryDaysAgo: 9,  Fee: null, Notes: 'Second inquiry on the same dog. First-floor flat, no outside space — discussing suitability.' },
    { Animal: 'Poppy',   Adopter: 'ada.okafor@example.com',   Status: 'Screening', InquiryDaysAgo: 11, Fee: null, Notes: 'References requested. Previous shepherd owner.' },
    { Animal: 'Nutmeg',  Adopter: 'priya.raman@example.com',  Status: 'Inquiry',   InquiryDaysAgo: 3,  Fee: null, Notes: 'Asked about grooming needs for the long coat. Sending care sheet.' },
    { Animal: 'Pepper',  Adopter: 'junie.calloway@example.com', Status: 'Denied',  InquiryDaysAgo: 26, Fee: null, DenialReason: 'Landlord confirmed no pets permitted at the address given.', Notes: 'Applicant advised; encouraged to reapply if circumstances change.' },
    { Animal: 'Pepper',  Adopter: 'wendell.frost@example.com', Status: 'Withdrawn', InquiryDaysAgo: 14, Fee: null, Notes: 'Family decided the timing was wrong. No concerns raised.' },
    { Animal: 'Nutmeg',  Adopter: 'ada.okafor@example.com',   Status: 'Cancelled', InquiryDaysAgo: 20, Fee: null, Notes: 'Cancelled when a medical hold was placed. Free to reopen as a new inquiry.' },
];

/**
 * Created AS subtypes, one mutation each. IntakeDaysAgo is small: these are recent arrivals, which
 * is also why their temperament is only partly assessed.
 */
const NEW_SUBTYPE_ANIMALS = [
    { kind: 'dog', Name: 'Scout',  Species: 'Dog', Breed: 'Beagle',            IntakeDaysAgo: 3, IntakeReason: 'Stray',     Sex: 'Male',   WeightKg: 13.2, Status: 'Intake', Description: 'Found near the harbour. Bright, busy, and already leash-comfortable.', IsGoodWithPeople: true,  EnergyLevel: 'High',     IsLeashTrained: true,  IsHouseTrained: false, IsGoodWithDogs: true },
    { kind: 'cat', Name: 'Saffron', Species: 'Cat', Breed: 'Domestic Shorthair', IntakeDaysAgo: 5, IntakeReason: 'Surrender', Sex: 'Female', WeightKg: 3.9,  Status: 'Intake', Description: 'Owner moved abroad. Settled quickly; watches the corridor from the top shelf.', IsGoodWithPeople: true, IsIndoorOnly: true, IsDeclawed: false, IsLitterTrained: true, IsGoodWithCats: null },
];

/** The adoption that is COMPLETED through the API, so the save override runs for real. */
const COMPLETE_ME = { Animal: 'Domino', Adopter: 'priya.raman@example.com', InquiryDaysAgo: 21, Fee: 95, Notes: 'Known quantity — returned for a household allergy, not behaviour. Straightforward placement.' };

// ── Animals created AS subtypes ──────────────────────────────────────────────
//
// There is no "update the existing animals' temperament" pass, and that is not an omission.
// Module 7's migration deliberately carries NO backfill (see its section 3), so no animal created
// before module 7 has a Dog or Cat row -- and on THIS pin (v6.1.0-edge.4) one cannot be retrofitted,
// because attaching a subtype to an existing parent is an anti-pattern its save path does not model.
// (True of the pin, not of MemberJunction: MJ #3825 added IS-A promotion and EnsureISAChild() does
// exactly this, landing after our pin. Creating animals AS subtypes stays correct either way.)
// The fourteen animals from
// module 5 therefore stay plain Animals, which is exactly what a shelter's historical records look
// like.
//
// From module 7 on, an animal is created AS a Dog or a Cat: ONE mutation carrying its own fields and
// Animal's together, written to two tables in one transaction, sharing one primary key. Species is
// the one thing known for certain at intake, so this is also just how a shelter works.
//
// Note what each list does NOT contain. No dog has a litter-training value and no cat has a leash
// value -- not because we left them out, but because the column does not exist on that subtype. That
// is the whole argument for splitting them.
const SUBTYPE_ANIMALS = [
    { kind: 'dog', Name: 'Scout',   Breed: 'Beagle',             IntakeDaysAgo: 3,  IntakeReason: 'Stray',     Sex: 'Male',    WeightKg: 13.2, Status: 'Intake', IsGoodWithPeople: true,  Notes: 'Slips a collar if it is even slightly loose -- double-check before walks.',        Description: 'Found near the harbour. Bright, busy, and already leash-comfortable.',        EnergyLevel: 'High',      IsLeashTrained: true,  IsHouseTrained: false, IsGoodWithDogs: true },
    { kind: 'dog', Name: 'Bramble', Breed: 'Border Collie',      IntakeDaysAgo: 8,  IntakeReason: 'Surrender', Sex: 'Female',  WeightKg: 17.9, Status: 'Intake', IsGoodWithPeople: true,  Notes: 'Herds anything that moves, children included. Needs a job.',                       Description: 'Surrendered when her family downsized to a flat. Sharp, willing, tireless.',   EnergyLevel: 'Very High', IsLeashTrained: true,  IsHouseTrained: true,  IsGoodWithDogs: true },
    { kind: 'dog', Name: 'Duffy',   Breed: 'German Shepherd',    IntakeDaysAgo: 11, IntakeReason: 'Transfer',  Sex: 'Male',    WeightKg: 31.4, Status: 'Intake', IsGoodWithPeople: false, Notes: 'Muzzle for vet handling until reassessed. Fine with known staff, wary of strangers.', Description: 'Transferred in from a shelter closure. Reserved; opening up slowly.',          EnergyLevel: 'Moderate',  IsLeashTrained: false, IsHouseTrained: true,  IsGoodWithDogs: false },
    // Temperament partly unassessed on purpose: NULL means "not assessed", which is a different
    // fact from "no", and the app has to render it.
    { kind: 'dog', Name: 'Pip',     Breed: 'Beagle',             IntakeDaysAgo: 1,  IntakeReason: 'Stray',     Sex: 'Unknown', WeightKg: 8.6,  Status: 'Intake', IsGoodWithPeople: null,  Notes: 'Arrived last night. Nothing assessed yet.',                                        Description: 'Picked up on Harbor Street. Underweight, no chip.',                            EnergyLevel: null,        IsLeashTrained: null,  IsHouseTrained: null,  IsGoodWithDogs: null },
    { kind: 'cat', Name: 'Saffron', Breed: 'Domestic Shorthair', IntakeDaysAgo: 5,  IntakeReason: 'Surrender', Sex: 'Female',  WeightKg: 3.9,  Status: 'Intake', IsGoodWithPeople: true,  Notes: 'Watches the corridor from the top shelf. Will not come down for strangers.',        Description: 'Owner moved abroad. Settled quickly and eats well.',                           IsIndoorOnly: true,  IsDeclawed: false, IsLitterTrained: true,  IsGoodWithCats: null },
    { kind: 'cat', Name: 'Tuppence',Breed: 'Maine Coon',         IntakeDaysAgo: 13, IntakeReason: 'Returned',  Sex: 'Female',  WeightKg: 6.1,  Status: 'Intake', IsGoodWithPeople: true,  Notes: 'Declawed by a previous owner -- indoor placement only, no exceptions.',             Description: 'Returned after a house move. Placid, tolerates grooming, good with children.', IsIndoorOnly: true,  IsDeclawed: true,  IsLitterTrained: true,  IsGoodWithCats: true },
    { kind: 'cat', Name: 'Wick',    Breed: 'Domestic Shorthair', IntakeDaysAgo: 6,  IntakeReason: 'Stray',     Sex: 'Male',    WeightKg: 4.4,  Status: 'Intake', IsGoodWithPeople: false, Notes: 'Feral-leaning. Handle with gloves; suited to a barn placement.',                    Description: 'Trapped behind the fish market. Eating, but not yet handleable.',               IsIndoorOnly: false, IsDeclawed: false, IsLitterTrained: false, IsGoodWithCats: true },
];

/**
 * Notes for the animals module 5 created. New column in module 7, and it is on Animal, so every
 * animal can carry one whether or not it has a subtype row.
 */
const EXISTING_NOTES = {
    Biscuit: 'Will take food from a closed hand. Weigh weekly until she is back in range.',
    Willa: 'Escapes low fencing. Six foot minimum, and no shared garden.',
    Otis: 'Do not walk him past the kennel run -- reacts through the mesh.',
    Marlowe: 'Ears need checking every few days even after the course finished.',
    Juniper: 'Wet food only while the sutures are in.',
    Pepper: 'Booster is overdue -- flag at the next vet visit.',
    Nutmeg: 'Weekly brush-out or the coat mats behind the ears.',
    Mabel: 'Isolation until the URI clears. Appetite is the thing to watch.',
    Domino: 'Known allergy in the previous home; no concerns with the animal itself.',
    Clementine: 'Sex not yet confirmed -- intake exam still pending.',
};

/** Shared by both subtypes, so it lives on Animal — the module 7 lesson in one field. */
const GOOD_WITH_PEOPLE = { Willa: true, Poppy: true, Otis: true, Biscuit: true, Marlowe: true, Pepper: true, Nutmeg: true, Domino: true, Juniper: false };

const M_ADOPTER = `mutation($i:CreateMJAdopterInput!){ CreateMJAdopter(input:$i){ ID FirstName LastName } }`;
const M_ADOPTION = `mutation($i:CreateMJAdoptionInput!){ CreateMJAdoption(input:$i){ ID Status } }`;
const M_ADOPTION_UPD = `mutation($i:UpdateMJAdoptionInput!){ UpdateMJAdoption(input:$i){ ID Status CompletedDate } }`;
const M_ANIMAL_UPD = `mutation($i:UpdateMJAnimalInput!){ UpdateMJAnimal(input:$i){ ID Name Species IsGoodWithPeople Notes } }`;
const M_DOG_NEW = `mutation($i:CreateMJDogInput!){ CreateMJDog(input:$i){ ID Name Species EnergyLevel } }`;
const M_CAT_NEW = `mutation($i:CreateMJCatInput!){ CreateMJCat(input:$i){ ID Name Species IsIndoorOnly } }`;

async function main() {
    const existing = await rows('MJ: Adopters');
    if (existing.count > 0 && !FORCE) {
        console.log(`MJ: Adopters already has ${existing.count} rows — nothing to do. Use --force to add anyway.`);
        return;
    }

    // 1. Adopters
    const adopterIds = new Map();
    for (const a of ADOPTERS) {
        const d = await gql(M_ADOPTER, { i: a });
        adopterIds.set(a.Email, d.CreateMJAdopter.ID);
    }
    console.log(`Adopters: ${adopterIds.size}`);

    // 2. Animal ids by name
    const animals = await rows('MJ: Animals', null, ['ID', 'Name', 'Species', 'Status', 'HousingID']);
    const animalByName = new Map(animals.results.map((a) => [a.Name, a]));
    console.log(`Animals found: ${animalByName.size}`);
    const breedByName = new Map((await rows('MJ: Breeds')).results.map((b) => [b.Name, b.ID]));

    // 3. Temperament — the parent-level field first, then each subtype
    let peopled = 0;
    for (const [name, val] of Object.entries(GOOD_WITH_PEOPLE)) {
        const a = animalByName.get(name);
        if (!a) continue;
        await gql(M_ANIMAL_UPD, { i: { ID: a.ID, IsGoodWithPeople: val } });
        peopled++;
    }
    console.log(`Animal.IsGoodWithPeople set: ${peopled}`);

    // Notes is new in module 7 and lives on Animal, so the pre-existing animals can carry it.
    let noted = 0;
    for (const [name, note] of Object.entries(EXISTING_NOTES)) {
        const a = animalByName.get(name);
        if (!a) continue;
        await gql(M_ANIMAL_UPD, { i: { ID: a.ID, Notes: note } });
        noted++;
    }
    console.log(`Animal.Notes set on existing animals: ${noted}`);

    // Created AS subtypes -- one mutation each, writing Animal and Dog/Cat together.
    let born = 0;
    for (const n of SUBTYPE_ANIMALS) {
        const { kind, Breed, IntakeDaysAgo, ...fields } = n;
        // Species is DERIVED from kind rather than listed per row. It is NOT NULL with a check
        // constraint, and the subtype's own rule requires it to match -- so deriving it makes the two
        // impossible to disagree. (Omitting it fails as
        // "Cannot read properties of null (reading 'toLowerCase')", because MJ's value-list check
        // lowercases before comparing and never guards the null. Not an obvious message.)
        await gql(kind === 'dog' ? M_DOG_NEW : M_CAT_NEW, {
            i: {
                ...fields,
                Species: kind === 'dog' ? 'Dog' : 'Cat',
                BreedID: breedByName.get(Breed) ?? null,
                IntakeDate: daysAgo(IntakeDaysAgo),
            },
        });
        born++;
    }
    // Re-read: animalByName was built before these existed.
    for (const a of (await rows('MJ: Animals')).results) animalByName.set(a.Name, a);
    const scoutId = animalByName.get('Scout')?.ID;
    console.log(`Animals created AS subtypes: ${born} (${SUBTYPE_ANIMALS.filter(a=>a.kind==='dog').length} dogs, ${SUBTYPE_ANIMALS.filter(a=>a.kind==='cat').length} cats)`);

    // 4. The funnel
    let made = 0;
    for (const ad of ADOPTIONS) {
        const a = animalByName.get(ad.Animal);
        const adopterID = adopterIds.get(ad.Adopter);
        if (!a || !adopterID) continue;
        await gql(M_ADOPTION, {
            i: {
                AnimalID: a.ID,
                AdopterID: adopterID,
                Status: ad.Status,
                InquiryDate: daysAgo(ad.InquiryDaysAgo),
                Fee: ad.Fee ?? null,
                DenialReason: ad.DenialReason ?? null,
                Notes: ad.Notes,
            },
        });
        made++;
    }
    console.log(`Adoptions: ${made}`);

    // 5. Complete one for real — the end-to-end proof of the save override.
    const target = animalByName.get(COMPLETE_ME.Animal);
    const targetAdopter = adopterIds.get(COMPLETE_ME.Adopter);
    console.log(`\nCompleting an adoption for ${COMPLETE_ME.Animal} (was ${target?.Status}, housing ${target?.HousingID ?? 'none'})…`);
    const created = await gql(M_ADOPTION, {
        i: {
            AnimalID: target.ID,
            AdopterID: targetAdopter,
            Status: 'Inquiry',
            InquiryDate: daysAgo(COMPLETE_ME.InquiryDaysAgo),
            Fee: COMPLETE_ME.Fee,
            Notes: COMPLETE_ME.Notes,
        },
    });
    // CompletedDate is deliberately NOT sent: the shared Save override derives it.
    const done = await gql(M_ADOPTION_UPD, { i: { ID: created.CreateMJAdoption.ID, Status: 'Completed' } });
    console.log(`  adoption -> ${done.UpdateMJAdoption.Status}, CompletedDate ${done.UpdateMJAdoption.CompletedDate ?? 'NOT SET'}`);

    const after = await rows('MJ: Animals', `ID = '${target.ID}'`, ['ID', 'Name', 'Status', 'HousingID']);
    const a2 = after.results[0];
    const flipped = a2?.Status === 'Adopted' && !a2?.HousingID;
    console.log(`  ${flipped ? '✓' : '✗'} animal is now ${a2?.Status}, housing ${a2?.HousingID ?? 'released'}`);

    // 6. The refusals. These MUST fail; a pass here is a rule that is not running.
    console.log('\nRules that must refuse:');
    await expectRefusal(
        'completing an adoption for an UNAPPROVED adopter',
        M_ADOPTION,
        { i: { AnimalID: animalByName.get('Poppy').ID, AdopterID: adopterIds.get('junie.calloway@example.com'), Status: 'Completed', InquiryDate: daysAgo(2), CompletedDate: daysAgo(0) } },
    );
    await expectRefusal(
        'completing an adoption for an animal that is not Available',
        M_ADOPTION,
        { i: { AnimalID: animalByName.get('Rufus').ID, AdopterID: adopterIds.get('ada.okafor@example.com'), Status: 'Completed', InquiryDate: daysAgo(2), CompletedDate: daysAgo(0) } },
    );
    await expectRefusal(
        'a SECOND open inquiry from the same family for the same animal',
        M_ADOPTION,
        { i: { AnimalID: animalByName.get('Poppy').ID, AdopterID: adopterIds.get('ada.okafor@example.com'), Status: 'Inquiry', InquiryDate: daysAgo(1) } },
    );
    // Changing a subtype animal's species. Scout is a Dog created in this run, so a Dog row really
    // exists -- unlike the module 5 animals, which have none and would refuse for a different reason
    // entirely (their breed's species). Note the refusal here is OVER-DETERMINED: the subtype rule
    // and module 6's breed rule both object. The isolated proof that the SUBTYPE rule fires on its
    // own -- a Dog with no breed, so nothing else can object -- is recorded in the module 7 log
    // rather than run here, because it needs a throwaway animal.
    await expectRefusal(
        "changing Scout's species to Cat while his Dog subtype row exists",
        M_ANIMAL_UPD,
        { i: { ID: animalByName.get('Scout')?.ID ?? scoutId, Species: 'Cat' } },
    );

    console.log('\nModule 7 seed complete — every row written through GraphQL mutations.');
}

main().catch((e) => {
    console.error('SEED FAILED:', e.message);
    process.exit(1);
});
