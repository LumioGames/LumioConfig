using System.Collections;
using Server = Lumio.Config.Generated.Server;

internal static class ImmutabilityChecks
{
    public static void Run(string scenario)
    {
        var original = new Server.SkillsRow(1, "original", 2, 10, 3);
        var replacement = new Server.SkillsRow(1, "replacement", 2, 99, 3);
        var source = new[] { original };
        var table = new Server.SkillsTable(source);
        var rows = table.Rows;

        switch (scenario)
        {
            case "array-alias":
                if (rows is Server.SkillsRow[] array)
                    array[0] = replacement;
                break;
            case "generic-list-alias":
                if (rows is IList<Server.SkillsRow> list)
                    RejectWrite(() => list[0] = replacement);
                break;
            case "list-alias":
                if (rows is IList untypedList)
                    RejectWrite(() => untypedList[0] = replacement);
                break;
            case "sync-root-alias":
                if (rows is ICollection collection && collection.SyncRoot is IList storage)
                    RejectWrite(() => storage[0] = replacement);
                break;
            case "input-and-old-snapshot":
                source[0] = replacement;
                var next = new Server.SkillsTable(source);
                Check(next.TryGet(1, out var updated) && updated.Damage == 99,
                    "The new snapshot must contain the replacement row.");
                break;
            case "zero-allocation":
                ReadLoop(table, 10_000);
                var before = GC.GetAllocatedBytesForCurrentThread();
                ReadLoop(table, 100_000);
                var allocated = GC.GetAllocatedBytesForCurrentThread() - before;
                Check(allocated == 0, $"Repeated typed reads allocated {allocated} bytes.");
                break;
            default:
                throw new ArgumentException($"Unknown scenario: {scenario}");
        }

        Check(table.Count == 1 && rows.Count == 1, "The snapshot count changed.");
        Check(rows[0].Name == "original" && rows[0].Damage == 10,
            "Rows exposed a mutable alias to the old snapshot.");
        Check(table.TryGet(1, out var row) && row.Damage == 10,
            "TryGet observed a mutation of the old snapshot.");
        Check(!table.TryGet(999, out var missing) && missing.Id == 0,
            "Missing ids must return false and the default row.");
        var visited = 0;
        foreach (var value in rows)
        {
            Check(value.Name == "original" && value.Damage == 10, "Enumeration changed a row.");
            visited++;
        }
        Check(visited == table.Count, "Enumeration returned the wrong row count.");
        visited = 0;
        foreach (Server.SkillsRow value in (IEnumerable)rows)
        {
            Check(value.Damage == 10, "Non-generic enumeration changed a row.");
            visited++;
        }
        Check(visited == table.Count, "Non-generic enumeration returned the wrong row count.");
    }

    private static void ReadLoop(Server.SkillsTable table, int count)
    {
        for (var i = 0; i < count; i++)
        {
            Check(table.TryGet(1, out var row) && row.Damage == 10, "Lookup failed.");
            Check(!table.TryGet(999, out _), "Unexpected lookup hit.");
            Check(table.Rows[0].Damage == 10, "Traversal failed.");
        }
    }

    private static void RejectWrite(Action write)
    {
        try
        {
            write();
        }
        catch (NotSupportedException)
        {
            return;
        }
        throw new InvalidOperationException("Rows allowed a write through a collection interface.");
    }

    private static void Check(bool condition, string message)
    {
        if (!condition)
            throw new InvalidOperationException(message);
    }
}
