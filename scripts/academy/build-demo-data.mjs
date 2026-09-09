#!/usr/bin/env node
/**
 * MJ Academy — generate the per-stage `demo-data/` MetadataSync tree.
 *
 * WHY A GENERATOR. Each module branch needs its own demo-data tree showing exactly that stage's
 * functionality, and the stages differ only in which entities exist and which columns are present.
 * Hand-maintaining six near-identical trees would drift; one data definition emitting all six
 * cannot.
 *
 * WHY A SEPARATE PARENT FOLDER (`demo-data/`, not `metadata/demo-*`). `mj sync push --dir=X` scans
 * X for ANY subfolder containing `.mj-sync.json`. The parent config's `directoryOrder` **orders but
 * does not gate** -- `provider-utils.ts` appends every unlisted directory alphabetically after the
 * ordered ones. So a `metadata/animals/` folder would be swept into every ordinary metadata push,
 * silently. Disjoint parents cannot be got wrong; `--include`/`--exclude` filters can, because they
 * rely on someone remembering a flag.
 *
 * IDS ARE STABLE ACROSS STAGES (`demo-data-ids.json`, generated once with `uuidgen` per
 * `metadata/CLAUDE.md`). The same animal keeps one ID at module 3 and at module 7, so wiping and
 * re-pushing at a later stage UPDATES rows rather than duplicating them.
 *
 * DATES ARE FIXED, not relative. Static JSON cannot compute, so every date is offset from
 * ANCHOR below. That is fine and here is why: overdue-ness only ever GROWS with time, so the
 * dashboard's overdue tiles keep working forever. The only rows that drift are the two
 * deliberately-still-in-window follow-ups (Mabel, Rufus), which eventually read as overdue.
 * Re-run this generator with a new ANCHOR to refresh.
 *
 *   node scripts/academy/build-demo-data.mjs --stage 5 [--anchor 2026-09-08] [--out demo-data]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const STAGE = Number(arg('stage', '5'));
const ANCHOR = arg('anchor', '2026-09-08');
const OUT = arg('out', 'demo-data');
if (![3, 4, 5, 6, 7].includes(STAGE)) { console.error('--stage must be 3..7'); process.exit(1); }

const IDS = JSON.parse(fs.readFileSync(new URL('./demo-data-ids.json', import.meta.url), 'utf8'));
const anchorMs = new Date(`${ANCHOR}T00:00:00Z`).getTime();
const day = (n) => new Date(anchorMs - n * 86400000).toISOString().slice(0, 10);

// ── data ────────────────────────────────────────────────────────────────────────────────────────
const BREEDS = [
    ['Beagle','Dog','Small',14,true],['Border Collie','Dog','Medium',13,true],
    ['German Shepherd','Dog','Large',11,true],['Great Dane','Dog','Giant',8,true],
    ['Retired Mix Listing','Dog','Medium',12,false],
    ['Domestic Shorthair','Cat','Small',15,true],['Maine Coon','Cat','Large',12,true],
].map(([Name,Species,SizeCategory,TypicalLifespanYears,IsActive]) =>
    ({ Name, Species, SizeCategory, TypicalLifespanYears, IsActive }));

const HOUSING = [
    ['Kennel A-1','A','Dog',3,false,true],['Kennel A-3','A','Dog',3,false,true],
    ['Kennel B-1','B','Dog',2,false,true],['Cattery C-1','C','Cat',4,false,true],
    ['Cattery C-4','C','Cat',4,false,true],['Isolation M-1','M','Any',2,true,true],
    ['Kennel D-9','D','Dog',2,false,false],
].map(([Name,Building,Species,Capacity,IsQuarantine,IsActive]) =>
    ({ Name, Building, Species, Capacity, IsQuarantine, IsActive }));

// Status is applied in a SECOND pass at stages >= 6 -- see writeAnimals().
const ANIMALS = [
 ['Biscuit','Dog','Beagle','Kennel A-3','Hold','Stray','Female','985141004512779',51,900,11.4,'Sweet, food-motivated beagle. Underweight at intake, gaining steadily. Good with other dogs; not yet cat-tested.'],
 ['Willa','Dog','Border Collie','Kennel A-3','Available','Surrender','Female','985141004512780',12,1500,18.2,'Bright and busy. Needs a job and a yard. Knows sit and down; pulls hard on lead.'],
 ['Sable','Dog','German Shepherd',null,'Adopted','Transfer','Male','985141004512781',68,2100,34.0,'Adopted by a repeat adopter in July. Confident, crate-trained, good with older children.'],
 ['Otis','Dog','Great Dane','Kennel A-1','Hold','Returned','Male','985141004512782',16,1200,52.5,'Returned after a failed placement — leash reactivity toward other dogs. In behaviour programme, progressing well.'],
 ['Marlowe','Dog','Beagle','Kennel B-1','Hold','Stray','Male','985141004512783',35,1050,12.8,'Bilateral ear infection at intake, on drops. Vocal but friendly. Loves a tennis ball.'],
 ['Rufus','Dog','Border Collie','Kennel A-1','Intake','Stray','Male','985141004512784',2,800,16.1,'Found on Harbor Street. No collar, no chip on arrival — chipped here. Awaiting stray hold expiry.'],
 ['Poppy','Dog','German Shepherd','Kennel B-1','Available','Surrender','Female','985141004512785',24,1700,29.7,'Surrendered due to a house move. House-trained, quiet in a crate, walks nicely.'],
 ['Gus','Dog','Great Dane',null,'Transferred','Transfer','Male','985141004512786',44,1400,48.9,'Transferred to a breed-specific rescue with more space for a giant breed.'],
 ['Juniper','Cat','Domestic Shorthair','Isolation M-1','Hold','Stray','Female','985141004512787',23,400,3.6,'Spayed here; recovering in isolation. Shy but not fearful — will come out for wet food.'],
 ['Pepper','Cat','Domestic Shorthair','Cattery C-4','Available','Surrender','Female','985141004512788',30,1100,4.1,'Confident lap cat. Fine with other cats, unbothered by dogs behind glass.'],
 ['Nutmeg','Cat','Maine Coon','Cattery C-1','Available','Transfer','Female','985141004512789',56,1900,6.8,'Long coat needs weekly grooming. Placid, tolerates handling, good with children.'],
 ['Clementine','Cat','Maine Coon','Cattery C-1','Intake','Other','Unknown','985141004512790',4,300,2.9,'Brought in by a member of the public; circumstances unclear. Intake exam pending, sex not yet confirmed.'],
 ['Domino','Cat','Domestic Shorthair','Cattery C-4','Available','Returned','Male','985141004512791',9,950,4.7,'Returned after a household allergy. No behaviour concerns; known quantity, easy placement.'],
 ['Mabel','Cat','Maine Coon','Isolation M-1','Hold','Stray','Female','985141004512792',7,1300,5.2,'Upper respiratory infection — isolated and on antibiotics. Appetite good, prognosis good.'],
].map(([Name,Species,Breed,Housing,Status,IntakeReason,Sex,Micro,IntakeDaysAgo,BirthDaysAgo,WeightKg,Description]) =>
    ({ Name, Species, Breed, Housing, Status, IntakeReason, Sex, Micro, IntakeDaysAgo, BirthDaysAgo, WeightKg, Description }));

const CARE = [
 ['Biscuit','Exam',51,'Intake exam. Underweight, coat poor, no obvious injury.','Dr. Halloran',true,-32,'Start weight-gain diet; recheck in three weeks.'],
 ['Biscuit','Exam',32,'Weight recheck — up 1.8kg. Cleared for vaccination.','Dr. Halloran',true,null,'Good progress. Proceed to DHPP.'],
 ['Biscuit','Vaccination',3,'DHPP, first of two.','Dr. Halloran',false,-1,'Second dose due — OVERDUE, book this week.'],
 ['Marlowe','Exam',35,'Intake exam. Bilateral ear infection noted.','Dr. Halloran',true,-21,'Otic drops twice daily for 14 days.'],
 ['Marlowe','Treatment',21,'Ear drops course completed.','R. Okonkwo',false,-4,'Recheck to confirm resolution — OVERDUE.'],
 ['Juniper','Surgery',9,'Spay. Routine, no complications.','Dr. Halloran',false,-2,'Post-op check and suture removal — OVERDUE.'],
 ['Otis','Behavioral',14,'Leash reactivity assessment. Reactive to dogs within 5m.','M. Vance',true,-7,'Begin counter-conditioning, three sessions weekly.'],
 ['Otis','Behavioral',5,'Session 3. Threshold improved to roughly 2m.','M. Vance',false,-1,'Re-assessment due — OVERDUE.'],
 ['Pepper','Vaccination',28,'FVRCP and rabies.','Dr. Halloran',false,-3,'Rabies booster due — OVERDUE.'],
 ['Pepper','Grooming',6,'Nail trim and brush-out.','R. Okonkwo',true,24,'Monthly is enough for this coat.'],
 ['Nutmeg','Vaccination',50,'FVRCP, rabies, and FeLV test (negative).','Dr. Halloran',true,null,'Fully vaccinated on arrival paperwork; confirmed here.'],
 ['Nutmeg','Grooming',4,'Full groom — mats behind both ears cleared.','R. Okonkwo',true,10,'Weekly brushing needed; note for adopter.'],
 ['Willa','Vaccination',11,'DHPP and rabies.','Dr. Halloran',true,null,'Complete for her age.'],
 ['Willa','Exam',12,'Intake exam. Healthy, good body condition.','Dr. Halloran',true,null,'No concerns.'],
 ['Poppy','Vaccination',23,'DHPP and rabies, records confirmed from surrendering owner.','Dr. Halloran',true,null,'Owner records verified.'],
 ['Domino','Vaccination',8,'FVRCP booster.','Dr. Halloran',true,null,'Previously vaccinated here before first adoption.'],
 ['Mabel','Treatment',6,'Upper respiratory infection — antibiotics started.','Dr. Halloran',false,3,'Recheck in three days; still within window.'],
 ['Rufus','Exam',2,'Intake exam. Sound, slightly thin, no chip on arrival.','Dr. Halloran',false,5,'Vaccinate once stray hold expires.'],
 ['Clementine','Other',4,'Intake weigh-in and photograph only; full exam deferred.','R. Okonkwo',false,2,'Very young — exam booked, sex to be confirmed then.'],
 ['Sable','Exam',60,'Pre-adoption health check. Cleared.','Dr. Halloran',true,null,'Signed off for adoption.'],
 ['Gus','Exam',40,'Pre-transfer health certificate issued.','Dr. Halloran',true,null,'Paperwork travelled with him.'],
].map(([Animal,CareType,DaysAgo,Description,PerformedBy,IsComplete,FollowUpIn,Notes]) =>
    ({ Animal, CareType, DaysAgo, Description, PerformedBy, IsComplete, FollowUpIn, Notes }));

/**
 * Stage >= 6 only. Pepper is listed Available but her only vaccination is an INCOMPLETE overdue
 * booster, which module 6's rule refuses. The completed primary course that preceded it was always
 * implied and never recorded -- day 29, i.e. AFTER her day-30 intake, or module 6's "care date
 * cannot predate intake" rule refuses that instead. The overdue booster stays: module 5's dashboard
 * needs an overdue follow-up.
 */
const CARE_STAGE6_EXTRA = [
    { Animal:'Pepper', CareType:'Vaccination', DaysAgo:29, Description:'FVRCP primary course, completed.',
      PerformedBy:'Dr. Halloran', IsComplete:true, FollowUpIn:null, Notes:'Primary course complete; booster scheduled.' },
];

// ── emit ────────────────────────────────────────────────────────────────────────────────────────
const w = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); };
const folderCfg = (entity, extra = {}) => ({ entity, filePattern: '**/.*.json', ...extra });

function writeAnimals(dir, twoPhase) {
    // Phase 1 (or the only phase): every animal, at stage >= 6 forced to 'Intake' so it cannot be
    // Available before its care logs exist -- directoryOrder runs animals BEFORE care-logs, and a
    // care log cannot exist before the animal it points at, so the status pass has to come after.
    const rows = ANIMALS.map((a) => {
        const f = {
            Name: a.Name, Species: a.Species,
            BreedID: `@lookup:MJ: Breeds.Name=${a.Breed}`,
            MicrochipNumber: a.Micro,
            IntakeDate: day(a.IntakeDaysAgo),
            IntakeReason: a.IntakeReason,
            Sex: a.Sex,
            EstimatedBirthDate: day(a.BirthDaysAgo),
            WeightKg: a.WeightKg,
            Status: twoPhase ? 'Intake' : a.Status,
            Description: a.Description,
        };
        if (STAGE >= 4 && a.Housing) f.HousingID = `@lookup:MJ: Housings.Name=${a.Housing}`;
        return { fields: f, primaryKey: { ID: IDS.animals[a.Name] } };
    });
    w(path.join(dir, 'animals', '.animals.json'), rows);
    w(path.join(dir, 'animals', '.mj-sync.json'), folderCfg('MJ: Animals'));

    if (!twoPhase) return;
    // Phase 2: the real statuses, as UPDATES on the same primary keys.
    const pass = ANIMALS.filter((a) => a.Status !== 'Intake').map((a) => ({
        fields: { Status: a.Status }, primaryKey: { ID: IDS.animals[a.Name] },
    }));
    w(path.join(dir, 'animals-status', '.animals-status.json'), pass);
    w(path.join(dir, 'animals-status', '.mj-sync.json'), folderCfg('MJ: Animals'));
}

const dir = OUT;
fs.rmSync(dir, { recursive: true, force: true });
const twoPhase = STAGE >= 6;
const order = ['breeds'];

w(path.join(dir, 'breeds', '.breeds.json'), BREEDS.map((b) => ({ fields: b, primaryKey: { ID: IDS.breeds[b.Name] } })));
w(path.join(dir, 'breeds', '.mj-sync.json'), folderCfg('MJ: Breeds'));

if (STAGE >= 4) {
    order.push('housing');
    w(path.join(dir, 'housing', '.housing.json'), HOUSING.map((h) => ({ fields: h, primaryKey: { ID: IDS.housing[h.Name] } })));
    w(path.join(dir, 'housing', '.mj-sync.json'), folderCfg('MJ: Housings'));
}

order.push('animals');
writeAnimals(dir, twoPhase);

if (STAGE >= 5) {
    order.push('care-logs');
    const care = STAGE >= 6 ? [...CARE, ...CARE_STAGE6_EXTRA] : CARE;
    w(path.join(dir, 'care-logs', '.care-logs.json'), care.map((c, i) => ({
        fields: {
            AnimalID: `@lookup:MJ: Animals.Name=${c.Animal}`,
            CareDate: day(c.DaysAgo),
            CareType: c.CareType,
            Description: c.Description,
            PerformedBy: c.PerformedBy,
            IsComplete: c.IsComplete,
            // FollowUpIn is relative to TODAY (the anchor), not to the care date: negative means
            // already due -- which is what makes module 5's "overdue follow-ups" tile non-empty.
            // Both signs collapse to day(-FollowUpIn), since day() takes days-BEFORE-anchor.
            FollowUpDate: c.FollowUpIn === null ? null : day(-c.FollowUpIn),
            Notes: c.Notes,
        },
        primaryKey: { ID: IDS.carelogs[i] },
    })));
    w(path.join(dir, 'care-logs', '.mj-sync.json'), folderCfg('MJ: Care Logs'));
}

if (twoPhase) order.push('animals-status');

w(path.join(dir, '.mj-sync.json'), {
    version: '1.0.0',
    push: { autoCreateMissingRecords: true },
    directoryOrder: order,
});

console.log(`demo-data for stage ${STAGE} (anchor ${ANCHOR}) -> ${dir}/`);
console.log(`  directoryOrder: ${order.join(' -> ')}`);
