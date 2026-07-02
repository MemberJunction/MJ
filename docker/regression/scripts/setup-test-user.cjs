/**
 * Seed the regression-test user with everything they need to "feel real" on
 * a fresh database, before the browser ever authenticates:
 *
 *   1. Upsert the user (TEST_UID, default computeruse@bluecypress.io)
 *   2. Assign UI + Integration roles
 *   3. Pin every Active application to the user (UserApplication)
 *   4. Pin every entity within those apps (UserApplicationEntity)
 *   5. Seed dynamic example data:
 *      - 5 members → "VIP Members" list
 *      - 3 events → "Spring Events" list
 *      - 5 members + 3 events → favorites
 *
 * Why SQL and not just metadata sync? mj-sync may fail (System user bootstrap
 * issues on a fresh DB) or autoCreateNewUsers may create the user with only
 * the UI role. This script guarantees the user + both roles exist before the
 * browser logs in. The Lists themselves are created via metadata sync, but
 * their CONTENTS need to reference actual record IDs which only exist after
 * the AssociationDB seed runs — keeping this in SQL avoids stamping
 * environment-specific record IDs into the metadata files.
 *
 * Bulk SQL is fine here — we run pre-login on a fresh DB, so MJAPI has no
 * user-scoped cache to invalidate yet.
 */

const { sql, connect } = require('./lib/db.cjs');

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

    // 5a. Add 5 Member records to the metadata-seeded "VIP Members" list.
    const vipResult = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
            DECLARE @listId UNIQUEIDENTIFIER = (
                SELECT TOP 1 ID FROM __mj.List WHERE UserID = @userId AND Name = 'VIP Members'
            );
            IF @listId IS NULL BEGIN SELECT 0 AS inserted; RETURN; END;

            INSERT INTO __mj.ListDetail (ListID, RecordID, Sequence, Status)
            SELECT TOP 5 @listId, CAST(m.ID AS NVARCHAR(255)), ROW_NUMBER() OVER (ORDER BY m.ID), 'Active'
            FROM AssociationDemo.Member m
            WHERE NOT EXISTS (
                SELECT 1 FROM __mj.ListDetail ld
                WHERE ld.ListID = @listId AND ld.RecordID = CAST(m.ID AS NVARCHAR(255))
            );
            SELECT @@ROWCOUNT AS inserted;
        `);
    console.log(`  Added ${vipResult.recordset[0].inserted} members to VIP list`);

    // 5b. Add 3 Event records to the metadata-seeded "Spring Events" list.
    const eventsResult = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
            DECLARE @listId UNIQUEIDENTIFIER = (
                SELECT TOP 1 ID FROM __mj.List WHERE UserID = @userId AND Name = 'Spring Events'
            );
            IF @listId IS NULL BEGIN SELECT 0 AS inserted; RETURN; END;

            INSERT INTO __mj.ListDetail (ListID, RecordID, Sequence, Status)
            SELECT TOP 3 @listId, CAST(e.ID AS NVARCHAR(255)), ROW_NUMBER() OVER (ORDER BY e.ID), 'Active'
            FROM AssociationDemo.Event e
            WHERE NOT EXISTS (
                SELECT 1 FROM __mj.ListDetail ld
                WHERE ld.ListID = @listId AND ld.RecordID = CAST(e.ID AS NVARCHAR(255))
            );
            SELECT @@ROWCOUNT AS inserted;
        `);
    console.log(`  Added ${eventsResult.recordset[0].inserted} events to Spring Events list`);

    // 5c. Mark some records as favorites so the star icon has a "filled" state.
    const favResult = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
            DECLARE @membersEntityId UNIQUEIDENTIFIER = (
                SELECT TOP 1 ID FROM __mj.Entity WHERE Name = 'Members'
            );
            DECLARE @eventsEntityId UNIQUEIDENTIFIER = (
                SELECT TOP 1 ID FROM __mj.Entity WHERE Name = 'Events'
            );

            INSERT INTO __mj.UserFavorite (UserID, EntityID, RecordID)
            SELECT TOP 5 @userId, @membersEntityId, CAST(m.ID AS NVARCHAR(255))
            FROM AssociationDemo.Member m
            WHERE @membersEntityId IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM __mj.UserFavorite uf
                  WHERE uf.UserID = @userId AND uf.EntityID = @membersEntityId
                    AND uf.RecordID = CAST(m.ID AS NVARCHAR(255))
              );
            DECLARE @memberFavs INT = @@ROWCOUNT;

            INSERT INTO __mj.UserFavorite (UserID, EntityID, RecordID)
            SELECT TOP 3 @userId, @eventsEntityId, CAST(e.ID AS NVARCHAR(255))
            FROM AssociationDemo.Event e
            WHERE @eventsEntityId IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM __mj.UserFavorite uf
                  WHERE uf.UserID = @userId AND uf.EntityID = @eventsEntityId
                    AND uf.RecordID = CAST(e.ID AS NVARCHAR(255))
              );
            SELECT @memberFavs + @@ROWCOUNT AS inserted;
        `);
    console.log(`  Added ${favResult.recordset[0].inserted} favorites`);

    await pool.close();
})().catch(e => {
    // This script is safety-net for the metadata sync — surface a warning but
    // don't fail the entrypoint, because login + roles may already exist.
    console.error('  WARNING: SQL user setup failed:', e.message);
});
