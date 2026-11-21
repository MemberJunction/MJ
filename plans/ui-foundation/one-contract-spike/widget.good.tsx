function MyOpenTasks({ utilities, styles, components, callbacks, maxItems = 5, statusFilter, taskOpened }: MyOpenTasksProps) {
  const { StatTile } = components;
  const [rows, setRows] = useState<Row_Tasks[]>([]);

  useEffect(() => {
    (async () => {
      const result = await utilities.rv.RunView({
        EntityName: 'MJ_BizApps_Tasks: Tasks',
        Fields: ['ID', 'Name', 'DueAt', 'Status'],
        ExtraFilter: statusFilter ? `Status='${statusFilter}'` : undefined,
        MaxRows: maxItems,
      });
      if (result.Success) setRows(result.Results);
    })();
  }, [maxItems, statusFilter]);

  const now = new Date();
  const overdue = rows.filter((r) => r.DueAt != null && r.DueAt < now && r.Status !== 'Completed');

  return (
    <div style={{ padding: styles.spacing.md, color: styles.colors.textSecondary }}>
      <StatTile label="Overdue" value={overdue.length} tone="warning" />
      {rows.map((r) => (
        <div key={r.ID} onClick={() => taskOpened?.(r.ID)}>
          {r.Name}
        </div>
      ))}
    </div>
  );
}
