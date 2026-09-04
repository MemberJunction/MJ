-- Every scalar the shelter dashboard shows, aggregated on the SERVER and returned as ONE row.
--
-- Why a Query rather than RunView calls: a dashboard figure is an aggregate, and an aggregate
-- belongs in SQL. Capacity is a SUM and vaccination compliance is a COUNT(DISTINCT) over a join --
-- neither is expressible as a filtered row count, so doing them with RunView meant reading every
-- housing row and every vaccination row to the browser and folding them there. This replaces eight
-- round-trips and two client-side loops with one row.
--
-- THREE CONSTRAINTS, all because MJ wraps a Query in `WITH [__count] AS ( ... )`:
--   1. NO ORDER BY -- illegal inside a CTE.
--   2. NO leading WITH of our own -- a CTE cannot be nested inside another CTE's body in T-SQL,
--      which is why this uses scalar subqueries rather than the named CTEs it would otherwise want.
--   3. The schema is written literally as __mj, NOT ${flyway:defaultSchema} -- migrations are
--      flyway-processed, metadata files are not, so a placeholder is stored verbatim and fails.
--
-- "In care" is Intake/Available/Hold. Adopted and Transferred animals have left the shelter, and an
-- adopted animal can still carry its old HousingID -- counting those would report a kennel as full
-- when it is empty.
SELECT
    (SELECT COUNT(*)
       FROM __mj.vwAnimals
      WHERE Status IN ('Intake', 'Available', 'Hold'))                      AS AnimalsInCare,

    (SELECT COUNT(*)
       FROM __mj.vwAnimals
      WHERE Status IN ('Intake', 'Available', 'Hold')
        AND HousingID IS NOT NULL)                                          AS Housed,

    -- ISNULL so an empty shelter reports 0 capacity rather than NULL.
    (SELECT ISNULL(SUM(Capacity), 0)
       FROM __mj.vwHousings
      WHERE IsActive = 1)                                                   AS Capacity,

    -- GETUTCDATE cast to DATE: FollowUpDate is a DATE column, so comparing it to an instant would
    -- make "overdue" depend on the time of day as well as the day.
    (SELECT COUNT(*)
       FROM __mj.vwCareLogs
      WHERE FollowUpDate IS NOT NULL
        AND IsComplete = 0
        AND FollowUpDate < CAST(GETUTCDATE() AS DATE))                      AS OverdueFollowUps,

    -- DISTINCT animals, not rows: two vaccinations for one animal is still one animal covered.
    (SELECT COUNT(DISTINCT c.AnimalID)
       FROM __mj.vwCareLogs c
       INNER JOIN __mj.vwAnimals a ON a.ID = c.AnimalID
      WHERE c.CareType = 'Vaccination'
        AND a.Status IN ('Intake', 'Available', 'Hold'))                    AS VaccinatedInCare
