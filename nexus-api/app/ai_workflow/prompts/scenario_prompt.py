def build_scenario_prompt(
    brd_text: str,
    project_name: str,
    page_name: str,
    elements_summary: str,
    brd_analysis_summary: str,
    scenario_count: str = "6 to 10",
    analysis_depth: str = "balanced coverage of critical and common flows",
    platform: str = "web",
    app_target: str = "",
    application_profile: str = "",
) -> str:
    return (
        f"You are a senior QA engineer generating test scenarios for '{project_name}'.\n\n"
        f"BRD Summary:\n{brd_analysis_summary}\n\n"
        f"Full BRD:\n{brd_text}\n\n"
        f"Platform: {platform}\n"
        f"Application or URL target: {app_target or 'not provided'}\n"
        f"Application learning profile:\n"
        f"{application_profile or 'Not available. Infer carefully from the BRD, target, and page name.'}\n\n"
        f"Discovered page: {page_name}\n"
        f"Discovered elements:\n{elements_summary}\n\n"
        f"Generate {scenario_count} high-value test scenarios. "
        f"Use {analysis_depth}. "
        "If the BRD is large, prioritize the most business-critical flows. "
        "Never exceed the requested scenario count.\n\n"
        "Application-first generation rules:\n"
        "- First classify the product domain from the platform, target application, BRD, page name, and application learning profile.\n"
        "- Scenarios must be grounded in the learned app capabilities; do not create unrelated generic flows.\n"
        "- Do not create sign-in, email, password, authentication, account, or dashboard scenarios unless the BRD, target, page name, or profile explicitly requires them.\n"
        "- For desktop utilities, generate direct utility operations instead of web-portal flows.\n"
        "- For desktop Calculator/calc.exe, generate arithmetic, clear-entry, decimal, negative-number, operator, and result-verification scenarios only.\n"
        "- For IDEs such as IntelliJ IDEA, generate project, file, editor, run/debug, search, settings, or plugin-related scenarios, not customer-login flows unless explicitly required.\n\n"
        "Sparse BRD reasoning mode:\n"
        "- If the BRD is missing details, infer the most likely automation journeys from the business domain, page name, target application, and BRD summary.\n"
        "- Scenarios should drive later test-step generation and scraping; scraping may run after these scenarios, so do not depend on already-discovered elements being complete.\n"
        "- Include inferred positive, negative, validation, navigation, and regression flows when they are important for realistic coverage.\n"
        "- Lower the confidence score for scenarios that rely on inference, and mention the inferred assumption in business_requirement.\n\n"
        "Cover:\n"
        "- Happy path (positive)\n"
        "- Error conditions (negative)\n"
        "- Edge cases\n"
        "- Regression-critical paths\n\n"
        "For each scenario provide:\n"
        "- A unique scenario_id (UUID format)\n"
        "- A clear title\n"
        "- The business requirement it covers\n"
        "- Priority: high / medium / low\n"
        "- Test type: functional / regression / smoke / e2e\n"
        "- Classification: positive / negative / edge\n"
        "- Pages involved (list of page names)\n"
        "- Estimated test case count\n"
        "- Confidence score (0.0-1.0)\n\n"
        "Set selected to false for every scenario.\n"
        "Return a JSON object matching the ScenarioList schema."
    )
