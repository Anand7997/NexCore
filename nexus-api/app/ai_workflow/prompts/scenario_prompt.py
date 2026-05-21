def build_scenario_prompt(
    brd_text: str,
    project_name: str,
    page_name: str,
    elements_summary: str,
    brd_analysis_summary: str,
) -> str:
    return (
        f"You are a senior QA engineer generating test scenarios for '{project_name}'.\n\n"
        f"BRD Summary:\n{brd_analysis_summary}\n\n"
        f"Full BRD:\n{brd_text}\n\n"
        f"Discovered page: {page_name}\n"
        f"Discovered elements:\n{elements_summary}\n\n"
        "Generate a comprehensive list of test scenarios covering:\n"
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
        "Return a JSON object matching the ScenarioList schema."
    )
