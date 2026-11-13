/**
 * Seed the regression-test user with everything they need to "feel real" on
 * a fresh database, before the browser ever authenticates:
 *
 *   1. Upsert the user (TEST_UID, default computeruse@bluecypress.io)
 *   2. Assign UI + Integration roles
 *   3. Pin every Active application to the user (UserApplication)
 *   4. Pin every entity within those apps (UserApplicationEntity)
 *   5. Seed dynamic example data from the MoreCheese Open App:
 *      - 5 hero people → "VIP Members" list
 *      - 6 hero people (3 shared with VIP) → "Recent Sign-ups" list
 *      - 3 scheduled committee meetings → "Upcoming Meetings" list
 *      - the 5 VIP people + the 3 meetings → favorites
 *
 * Why SQL and not just metadata sync? mj-sync may fail (System user bootstrap
 * issues on a fresh DB) or autoCreateNewUsers may create the user with only
 * the UI role. This script guarantees the user + both roles exist before the
 * browser logs in. The Lists themselves are created via metadata sync, but
 * their CONTENTS need to reference actual record IDs which only exist after
 * the Open Apps' database step — keeping this in SQL avoids stamping
 * environment-specific record IDs into the metadata files. Hero people are
 * found by email: MoreCheese pins their names and emails across data refreshes.
 *
 * Bulk SQL is fine here — we run pre-login on a fresh DB, so MJAPI has no
 * user-scoped cache to invalidate yet.
 */

const { sql, connect } = require('./lib/db.cjs');

const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';
const MEETINGS_ENTITY = 'Committees: Meetings';

/** MoreCheese heroes HERO-ICF-001..005 (Elena Rodriguez, Marcus Chen, Danielle Okafor, Priya Natarajan, Bob Kowalski). */
const VIP_EMAILS = [
    'elena.rodriguez.000101@lakemail.example',
    'marcus.chen.000102@quillpost.example',
    'danielle.okafor.000103@mailhaven.example',
    'priya.natarajan.000104@postfield.example',
    'bob.kowalski.000105@bluebarn.example',
];

/** MoreCheese heroes HERO-ICF-013..015 (Jamie Fuller, Victor Sandoval, Nia Thompson). */
const SIGNUP_EMAILS = [
    'jamie.fuller.000113@postfield.example',
    'victor.sandoval.000114@reedmeredairysystems.example',
    'nia.thompson.000115@thequietcurd.example',
];

/** Returns an entity's ID and its quoted `[schema].[table]`, or null when the entity is missing. */
async function entityTable(pool, entityName) {
    const row = (await pool.request()
        .input('name', sql.NVarChar, entityName)
        .query('SELECT ID, SchemaName, BaseTable FROM __mj.Entity WHERE Name = @name')).recordset[0];
    if (!row) {
        return null;
    }
    const quote = (name) => `[${name.replace(/]/g, ']]')}]`;
    return { id: row.ID, table: `${quote(row.SchemaName)}.${quote(row.BaseTable)}` };
}

/** Adds one input per email to the request and returns `(@p0, 1), (@p1, 2), ...` for a VALUES list. */
function emailValues(request, emails, prefix) {
    return emails.map((email, i) => {
        request.input(`${prefix}${i}`, sql.NVarChar, email);
        return `(@${prefix}${i}, ${i + 1})`;
    }).join(', ');
}

(async () => {
    const pool = await connect();
    const email = process.env.TEST_UID || 'computeruse@bluecypress.io';

    // 1. Upsert user
    let userId = (await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT ID FROM __mj.[User] WHERE Email = @email')).recordset[0]?.ID;

    if (!userId) {
        await pool.request()
            .input('name', sql.NVarChar, email)
            .input('email', sql.NVarChar, email)
            .input('firstName', sql.NVarChar, 'Computer')
            .input('lastName', sql.NVarChar, 'Use')
            .input('type', sql.NChar, 'User')
            .query(`INSERT INTO __mj.[User] (Name, Email, FirstName, LastName, Type, IsActive, LinkedRecordType)
                    VALUES (@name, @email, @firstName, @lastName, @type, 1, 'None')`);
        userId = (await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT ID FROM __mj.[User] WHERE Email = @email')).recordset[0].ID;
        console.log(`  Created user: ${email}`);
    } else {
        console.log(`  User exists: ${email} (${userId})`);
    }

    // 2. Ensure both UI and Integration roles are assigned.
    for (const roleName of ['UI', 'Integration']) {
        const roleRow = (await pool.request()
            .input('name', sql.NVarChar, roleName)
            .query('SELECT ID FROM __mj.[Role] WHERE Name = @name')).recordset[0];
        if (!roleRow) {
            console.log(`  WARNING: Role not found: ${roleName}`);
            continue;
        }

        const exists = (await pool.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('roleId', sql.UniqueIdentifier, roleRow.ID)
            .query('SELECT 1 FROM __mj.UserRole WHERE UserID = @userId AND RoleID = @roleId')).recordset.length > 0;

        if (!exists) {
            await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .input('roleId', sql.UniqueIdentifier, roleRow.ID)
                .query('INSERT INTO __mj.UserRole (UserID, RoleID) VALUES (@userId, @roleId)');
            console.log(`  Assigned role: ${roleName}`);
        } else {
            console.log(`  Role already assigned: ${roleName}`);
        }
    }

    // 3. Pin every Active application to the user.
    // MJAPI's autoCreateNewUsers (CreateUserApplicationRecords:true) only pins
    // apps where DefaultForNewUser=1 (~8 of 20 apps), leaving Admin/AI/etc.
    // hidden behind the configure modal. We pin the rest here.
    const appPin = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
            INSERT INTO __mj.UserApplication (UserID, ApplicationID, Sequence, IsActive)
            SELECT @userId, a.ID, a.DefaultSequence, 1
            FROM __mj.Application a
            WHERE a.Status = 'Active'
              AND NOT EXISTS (
                  SELECT 1 FROM __mj.UserApplication ua
                  WHERE ua.UserID = @userId AND ua.ApplicationID = a.ID
              );
            SELECT @@ROWCOUNT AS pinned;
        `);
    console.log(`  Pinned ${appPin.recordset[0].pinned} applications to user`);

    // 4. Make every entity within those apps visible.
    // Without UserApplicationEntity rows, the user's app navigation shows the
    // app card but no entities under it.
    const entityPin = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
            INSERT INTO __mj.UserApplicationEntity (UserApplicationID, EntityID, Sequence)
            SELECT ua.ID, ae.EntityID, ae.Sequence
            FROM __mj.UserApplication ua
            JOIN __mj.ApplicationEntity ae ON ae.ApplicationID = ua.ApplicationID
            WHERE ua.UserID = @userId
              AND NOT EXISTS (
                  SELECT 1 FROM __mj.UserApplicationEntity uae
                  WHERE uae.UserApplicationID = ua.ID AND uae.EntityID = ae.EntityID
              );
            SELECT @@ROWCOUNT AS pinned;
        `);
    console.log(`  Pinned ${entityPin.recordset[0].pinned} entities to user-applications`);

    // 5. Example data. People and meetings come from the Open Apps' database step.
    const people = await entityTable(pool, PEOPLE_ENTITY);
    const meetings = await entityTable(pool, MEETINGS_ENTITY);
    if (!people || !meetings) {
        console.log(`  WARNING: ${PEOPLE_ENTITY} or ${MEETINGS_ENTITY} not found — lists and favorites not seeded`);
        await pool.close();
        return;
    }

    // 5a. Fill the metadata-seeded "VIP Members" list with 5 MoreCheese hero people.
    const vipRequest = pool.request().input('userId', sql.UniqueIdentifier, userId);
    const vipResult = await vipRequest.query(`
            DECLARE @listId UNIQUEIDENTIFIER = (
                SELECT TOP 1 ID FROM __mj.List WHERE UserID = @userId AND Name = 'VIP Members'
            );
            IF @listId IS NULL BEGIN SELECT 0 AS inserted; RETURN; END;

            INSERT INTO __mj.ListDetail (ListID, RecordID, Sequence, Status)
            SELECT @listId, CAST(p.ID AS NVARCHAR(255)), v.Ord, 'Active'
            FROM (VALUES ${emailValues(vipRequest, VIP_EMAILS, 'vip')}) v(Email, Ord)
            CROSS APPLY (SELECT TOP 1 ID FROM ${people.table} WHERE Email = v.Email ORDER BY ID) p
            WHERE NOT EXISTS (
                SELECT 1 FROM __mj.ListDetail ld
                WHERE ld.ListID = @listId AND ld.RecordID = CAST(p.ID AS NVARCHAR(255))
            );
            SELECT @@ROWCOUNT AS inserted;
        `);
    console.log(`  Added ${vipResult.recordset[0].inserted} people to VIP Members list`);

    // 5b. Fill the metadata-seeded "Recent Sign-ups" list so it overlaps "VIP Members":
    // the first 3 of VIP's people plus 3 other hero people (union 8, intersection 3).
    const signupsRequest = pool.request().input('userId', sql.UniqueIdentifier, userId);
    const signupsResult = await signupsRequest.query(`
            DECLARE @vipId UNIQUEIDENTIFIER = (
                SELECT TOP 1 ID FROM __mj.List WHERE UserID = @userId AND Name = 'VIP Members'
            );
            DECLARE @listId UNIQUEIDENTIFIER = (
                SELECT TOP 1 ID FROM __mj.List WHERE UserID = @userId AND Name = 'Recent Sign-ups'
            );
            IF @vipId IS NULL OR @listId IS NULL BEGIN SELECT 0 AS inserted; RETURN; END;

            INSERT INTO __mj.ListDetail (ListID, RecordID, Sequence, Status)
            SELECT @listId, src.RecordID, ROW_NUMBER() OVER (ORDER BY src.Ord), 'Active'
            FROM (
                SELECT RecordID, Ord FROM (
                    SELECT TOP 3 ld.RecordID, ld.Sequence AS Ord FROM __mj.ListDetail ld
                    WHERE ld.ListID = @vipId
                    ORDER BY ld.Sequence, ld.RecordID
                ) shared
                UNION ALL
                SELECT CAST(p.ID AS NVARCHAR(255)), 100 + v.Ord
                FROM (VALUES ${emailValues(signupsRequest, SIGNUP_EMAILS, 'new')}) v(Email, Ord)
                CROSS APPLY (SELECT TOP 1 ID FROM ${people.table} WHERE Email = v.Email ORDER BY ID) p
            ) src
            WHERE NOT EXISTS (
                SELECT 1 FROM __mj.ListDetail ld
                WHERE ld.ListID = @listId AND ld.RecordID = src.RecordID
            );
            SELECT @@ROWCOUNT AS inserted;
        `);
    console.log(`  Added ${signupsResult.recordset[0].inserted} people to Recent Sign-ups list`);

    // 5c. Fill the metadata-seeded "Upcoming Meetings" list with the 3 earliest scheduled meetings.
    const meetingsResult = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
            DECLARE @listId UNIQUEIDENTIFIER = (
                SELECT TOP 1 ID FROM __mj.List WHERE UserID = @userId AND Name = 'Upcoming Meetings'
            );
            IF @listId IS NULL BEGIN SELECT 0 AS inserted; RETURN; END;

            INSERT INTO __mj.ListDetail (ListID, RecordID, Sequence, Status)
            SELECT @listId, src.RecordID, src.Ord, 'Active'
            FROM (
                SELECT TOP 3 CAST(m.ID AS NVARCHAR(255)) AS RecordID,
                       ROW_NUMBER() OVER (ORDER BY m.StartDateTime, m.ID) AS Ord
                FROM ${meetings.table} m
                WHERE m.Status = 'Scheduled'
                ORDER BY m.StartDateTime, m.ID
            ) src
            WHERE NOT EXISTS (
                SELECT 1 FROM __mj.ListDetail ld
                WHERE ld.ListID = @listId AND ld.RecordID = src.RecordID
            );
            SELECT @@ROWCOUNT AS inserted;
        `);
    console.log(`  Added ${meetingsResult.recordset[0].inserted} meetings to Upcoming Meetings list`);

    // 5d. Mark the VIP people and the 3 earliest scheduled meetings as favorites, so the
    // star icon has a "filled" state.
    const favRequest = pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('peopleEntityId', sql.UniqueIdentifier, people.id)
        .input('meetingsEntityId', sql.UniqueIdentifier, meetings.id);
    const favResult = await favRequest.query(`
            INSERT INTO __mj.UserFavorite (UserID, EntityID, RecordID)
            SELECT @userId, @peopleEntityId, CAST(p.ID AS NVARCHAR(255))
            FROM (VALUES ${emailValues(favRequest, VIP_EMAILS, 'fav')}) v(Email, Ord)
            CROSS APPLY (SELECT TOP 1 ID FROM ${people.table} WHERE Email = v.Email ORDER BY ID) p
            WHERE NOT EXISTS (
                SELECT 1 FROM __mj.UserFavorite uf
                WHERE uf.UserID = @userId AND uf.EntityID = @peopleEntityId
                  AND uf.RecordID = CAST(p.ID AS NVARCHAR(255))
            );
            DECLARE @peopleFavs INT = @@ROWCOUNT;

            INSERT INTO __mj.UserFavorite (UserID, EntityID, RecordID)
            SELECT TOP 3 @userId, @meetingsEntityId, CAST(m.ID AS NVARCHAR(255))
            FROM ${meetings.table} m
            WHERE m.Status = 'Scheduled'
              AND NOT EXISTS (
                  SELECT 1 FROM __mj.UserFavorite uf
                  WHERE uf.UserID = @userId AND uf.EntityID = @meetingsEntityId
                    AND uf.RecordID = CAST(m.ID AS NVARCHAR(255))
              )
            ORDER BY m.StartDateTime, m.ID;
            SELECT @peopleFavs + @@ROWCOUNT AS inserted;
        `);
    console.log(`  Added ${favResult.recordset[0].inserted} favorites`);

    await pool.close();
})().catch(e => {
    // This script is safety-net for the metadata sync — surface a warning but
    // don't fail the entrypoint, because login + roles may already exist.
    console.error('  WARNING: SQL user setup failed:', e.message);
});
