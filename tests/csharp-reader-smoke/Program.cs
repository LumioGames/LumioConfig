using Server = Lumio.Config.Generated.Server;
using Client = Lumio.Config.Generated.Client;
using Voxel = Lumio.Config.Generated.Voxel;

// Compile-only smoke: construct typed tables from caller-supplied rows.
// No table source values live in generated code (R-00535 / ADR-077 §3).
var serverSkills = new Server.SkillsTable(Array.Empty<Server.SkillsRow>());
var clientSkills = new Client.SkillsTable(Array.Empty<Client.SkillsRow>());
var voxelEffects = new Voxel.EffectsTable(Array.Empty<Voxel.EffectsRow>());
var serverDrops = new Server.DropsTable(Array.Empty<Server.DropsRow>());
_ = serverSkills.TryGet(0, out _) || clientSkills.Count == 0;
_ = voxelEffects.Rows;
_ = serverDrops.Count;
_ = typeof(Client.DropsRow);
_ = typeof(Voxel.SkillsRow);
Console.WriteLine("csharp-reader-smoke: OK");
