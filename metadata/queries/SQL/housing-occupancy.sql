SELECT
    h.Name                        AS Unit,
    h.Building                    AS Building,
    h.Species                     AS Species,
    h.Capacity                    AS Capacity,
    COUNT(a.ID)                   AS Occupied,
    h.Capacity - COUNT(a.ID)      AS Spaces
FROM __mj.vwHousings h
LEFT JOIN __mj.vwAnimals a ON a.HousingID = h.ID
WHERE h.IsActive = 1
GROUP BY h.Name, h.Building, h.Species, h.Capacity
