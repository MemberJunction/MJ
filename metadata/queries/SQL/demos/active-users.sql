-- Reusable base query: Returns all active users with basic profile info
-- This query is marked Reusable=true so other queries can compose it via {{query:"..."}}
SELECT
    u.ID,
    u.Name,
    u.Email,
    u.Type,
    u.__mj_CreatedAt AS CreatedAt
FROM
    __mj.vwUsers u
WHERE
    u.IsActive = 1
