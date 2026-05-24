def build_testcase_prompt(
    scenario_title: str,
    business_requirement: str,
    test_type: str,
    priority: str,
    page_name: str,
    elements_summary: str,
) -> str:
    return (
        f"Generate test cases for the following scenario:\n\n"
        f"Scenario: {scenario_title}\n"
        f"Business Requirement: {business_requirement}\n"
        f"Test Type: {test_type}\n"
        f"Priority: {priority}\n\n"
        f"Available page: {page_name}\n"
        f"Available elements:\n{elements_summary}\n\n"
        "Create test cases that cover the scenario thoroughly.\n"
        "Each test case must have a title, description, test_type, priority, and steps.\n"
        "Each step must include: step_number, description, action_type.\n"
        "Use action types: navigate, click, fill, select, assert_visible, assert_text, "
        "assert_enabled, hover, wait, scroll, clear, upload, submit.\n\n"
        "Configure steps like a human tester would:\n"
        "- Use select only for real dropdown/listbox/combobox controls, and include the option label/value in input_value.\n"
        "- Use click for radio buttons, tabs, toggles, buttons, links, and trip-type choices such as one-way or round trip.\n"
        "- Use fill only when text must be typed, and always include a realistic input_value.\n"
        "- Use assert_text/assert_visible with an expected_result that can be observed on the page.\n\n"
        "Return a JSON object matching the TestCaseList schema."
    )
