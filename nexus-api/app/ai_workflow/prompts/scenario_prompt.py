def build_scenario_prompt(
    brd_text: str,
    project_name: str,
    page_name: str,
    elements_summary: str,
    brd_analysis_summary: str,
    scenario_count: str = "6 to 10",
    analysis_depth: str = "balanced coverage of critical and common flows",
) -> str:
    return (
        f"You are a senior QA engineer generating test scenarios for '{project_name}'.\n\n"
        f"BRD Summary:\n{brd_analysis_summary}\n\n"
        f"Full BRD:\n{brd_text}\n\n"
        f"Discovered page: {page_name}\n"
        f"Discovered elements:\n{elements_summary}\n\n"
        f"Generate {scenario_count} high-value test scenarios. "
        f"Use {analysis_depth}. "
        "If the BRD is large, prioritize the most business-critical flows. "
        "Never exceed the requested scenario count.\n\n"
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
