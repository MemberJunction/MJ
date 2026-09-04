-- One row per Animal.Status with its count -- the shelter dashboard's composition bar.
--
-- GROUP BY on the server rather than reading every animal to the browser and tallying there.
-- A status with no animals does not appear; the dashboard maps these onto the full Status value
-- list so every segment is represented and the bar's proportions stay honest.
--
-- No ORDER BY (illegal inside MJ's __count CTE wrapper) and the schema is literal __mj.
-- Display order comes from the component, which knows the intended lifecycle sequence.
SELECT
    a.Status      AS Status,
    COUNT(*)      AS AnimalCount
FROM __mj.vwAnimals a
GROUP BY a.Status
