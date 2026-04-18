Interactive map component for visualizing geo-enabled entity data as markers, choropleth regions, or heat maps. Built on Leaflet with OpenStreetMap tiles — no API key required.

Use SimpleMap when you need to show geographic data on a map. It works out of the box with any MJ geo-enabled entity (reads `__mj_Latitude` / `__mj_Longitude` virtual fields by default) and can also accept custom latitude/longitude field names for non-MJ data.

- Point mode with auto-fit bounds and optional marker clustering
- Choropleth mode for country/state-level aggregation
- Heat map mode for density visualization
- Click markers to view record details or open the entity record
- Composable with DataGrid and SimpleChart for drill-down dashboards
