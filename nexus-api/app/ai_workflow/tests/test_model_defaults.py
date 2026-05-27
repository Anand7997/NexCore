import unittest

from app.ai_workflow.service import _normalize_ai_selection


class ModelDefaultTests(unittest.TestCase):
    def test_null_placeholder_uses_openai_flagship_default(self) -> None:
        provider, model = _normalize_ai_selection("null", "null")

        self.assertEqual(provider, "openai")
        self.assertEqual(model, "gpt-5.5")

    def test_explicit_model_selection_is_preserved(self) -> None:
        provider, model = _normalize_ai_selection("openai", "gpt-5-mini")

        self.assertEqual(provider, "openai")
        self.assertEqual(model, "gpt-5-mini")


if __name__ == "__main__":
    unittest.main()
