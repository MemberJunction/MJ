function MyOpenTasks({ utilities, styles, components, callbacks, maxItems = 5, statusFilter, taskOpened }: MyOpenTasksProps) {
  const { StatTile } = components;
  const [rows, setRows] = useState<Row_Tasks[]>([]);

  useEffect(() => {
    (async () => {
      const result = await utilities.rv.RunView({
        EntityName: 'MJ_BizApps_Tasks: Tasks',
        Fields: ['ID', 'Name', 'DueDate', 'Status'],
        ExtraFilter: statusFilter ? `Status='${statusFilter}'` : undefined,
        MaxRows: maxItems,
      });
      if (result.Success) setRows(result.Results);
    })();
  }, [maxItems, statusFilter]);

  const overdue = rows.filter((r) => r.DueAt < new Date() && r.Status !== 'Done');

  return (
    <div style={{ padding: styles.spacing.md, color: styles.colors.muted }}>
      <StatTile label="Overdue" value={String(overdue.length)} tone="alert" />
      {rows.map((r) => (
        <div key={r.ID} onClick={() => taskOpened(r.ID)}>
          {r.Name} ({r.BlockedReason})
        </div>
      ))}
    </div>
  );
}
