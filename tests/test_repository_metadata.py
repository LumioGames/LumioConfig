import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


class RepositoryMetadataTests(unittest.TestCase):
    def test_metadata_declares_public_lumioconfig_baseline_and_targets(self):
        root = Path(__file__).resolve().parents[1]
        text = (root / "repository.yaml").read_text(encoding="utf-8")
        self.assertIn("name: LumioConfig", text)
        self.assertIn("kind: configuration-tooling", text)
        self.assertIn("visibility: public", text)
        self.assertIn("sourceCommit: a7c1221d3797db696e60bf8a8c748c907975a64c", text)
        self.assertIn("designCommit: d2a7883ea447d2c34b92269c1f84ac9c3c53f5eb", text)
        self.assertIn("baselineId: LGE-V1.4-2026-08-27", text)
        self.assertIn("    - S", text)
        self.assertIn("    - C", text)
        self.assertIn("    - V", text)


if __name__ == "__main__":
    unittest.main()
