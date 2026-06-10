def build_testcase_prompt(
    scenario_title: str,
    business_requirement: str,
    test_type: str,
    priority: str,
    page_name: str,
    elements_summary: str,
    platform: str = "web",
    app_target: str = "",
    application_profile: str = "",
) -> str:
    return (
        f"Generate test cases for the following scenario:\n\n"
        f"Scenario: {scenario_title}\n"
        f"Business Requirement: {business_requirement}\n"
        f"Test Type: {test_type}\n"
        f"Priority: {priority}\n\n"
        f"Platform: {platform}\n"
        f"Application or URL target: {app_target or 'not provided'}\n"
        f"Application learning profile:\n"
        f"{application_profile or 'Not available. Infer carefully from the scenario, target, and page name.'}\n\n"
        f"Available page: {page_name}\n"
        f"Available elements:\n{elements_summary}\n\n"
        "Create test cases that cover the scenario thoroughly.\n"
        "Each test case must have a title, description, test_type, priority, and steps.\n"
        "Each step must include: step_number, description, action_type.\n"
        "Use action types: navigate, click, fill, select, assert_visible, assert_text, "
        "assert_enabled, hover, wait, scroll, clear, upload, submit.\n\n"
        "Sparse BRD and step-driven scraping guidance:\n"
        "- Before writing steps, use the application learning profile to decide the product domain, core user goals, likely controls, and what is out of scope.\n"
        "- Think like a senior QA engineer when details are missing: infer the minimum realistic flow needed to prove the business requirement.\n"
        "- Generate executable human-like steps first; later scraping will use these steps to identify only important elements.\n"
        "- Make each interaction step describe the intended target clearly, such as \"Click digit 7\", \"Click Add\", or \"Click Save\", without inventing locator syntax.\n"
        "- Include navigate or application launch, meaningful user actions, and observable assertions.\n"
        "- Prefer fewer, high-signal steps over generic checks; every click/fill/select/assert step should help the scraper choose an element for the Pages repository.\n"
        "- If a field, button, or message is inferred from the requirement, keep the wording business-level and set confidence below fully specified steps.\n\n"
        "Application-domain guardrails:\n"
        "- Do not invent sign-in, email, password, authentication, account, or dashboard steps unless the scenario, BRD, page name, or app target explicitly requires them.\n"
        "- For desktop Calculator/calc.exe, generate arithmetic workflows only: launch Calculator, click digits/operators, clear if needed, and assert the displayed result.\n"
        "- For simple desktop utilities, prefer direct tool actions over generic web portal flows.\n\n"
        "Configure steps like a human tester would:\n"
        "- Use select only for real dropdown/listbox/combobox controls, and include the option label/value in input_value.\n"
        "- Use click for radio buttons, tabs, toggles, buttons, links, and trip-type choices such as one-way or round trip.\n"
        "- Use fill only when text must be typed, and always include a realistic input_value.\n"
        "- Use assert_text/assert_visible with an expected_result that can be observed on the page.\n\n"
        "Return a JSON object matching the TestCaseList schema."
    )
