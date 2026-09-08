"""Execute the Blender-contract and validator regression suites."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent), pattern="test_*.py")
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
