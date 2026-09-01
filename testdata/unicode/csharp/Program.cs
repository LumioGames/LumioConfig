using System.Security.Cryptography;
using System.Text;

var path = args[0];
foreach (var rawLine in File.ReadAllLines(path))
{
    var line = rawLine.Trim();
    if (line.Length == 0 || line.StartsWith('#'))
    {
        continue;
    }

    var parts = line.Split('\t');
    var id = parts[0];
    var hex = parts[1];
    var raw = Convert.FromHexString(hex);
    var text = Encoding.UTF8.GetString(raw);
    var nfc = text.Normalize(NormalizationForm.FormC);
    var digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(nfc))).ToLowerInvariant();
    Console.WriteLine($"{id} {digest}");
}
