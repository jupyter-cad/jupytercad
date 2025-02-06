import os
import unittest

from jupytercad_lab import CadDocument


class ProjectCreation(unittest.TestCase):
    filename = "test.jcad"

    def setUp(self):
        if os.path.isfile(self.filename):
            os.remove(self.filename)

    def tearDown(self):
        if os.path.isfile(self.filename):
            os.remove(self.filename)

    def test_creation(self):
        self.doc = CadDocument(self.filename)

        assert os.path.isfile(self.filename)
