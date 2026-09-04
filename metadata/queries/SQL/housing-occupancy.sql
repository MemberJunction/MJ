SELECT
    h.Name                        AS Unit,
    h.Building                    AS Building,
    h.Species                     AS Species,
    h.Capacity                    AS Capacity,
    COUNT(a.ID)                   AS Occupied,
    h.Capacity - COUNT(a.ID)      AS Spaces
FROM __mj.vwHousings h
-- The status filter belongs in the JOIN, not a WHERE: on a LEFT JOIN a WHERE would discard
-- empty units entirely, and an empty unit reporting zero is the whole point of this view.
-- Without it, an Adopted animal still carrying its old HousingID counts as occupying a space.
LEFT JOIN __mj.vwAnimals a
       ON a.HousingID = h.ID
      AND a.Status IN ('Intake', 'Available', 'Hold')
WHERE h.IsActive = 1
GROUP BY h.Name, h.Building, h.Species, h.Capacity
