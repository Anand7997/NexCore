def build_teststep_binding_prompt(
    testcase_title: str,
    steps_description: str,
    elements_summary: str,
) -> str:
    return (
        f"Bind the following test steps to the available page elements.\n\n"
        f"Test Case: {testcase_title}\n\n"
        f"Steps:\n{steps_description}\n\n"
        f"Available page elements (name → element_id):\n{elements_summary}\n\n"
        "For each step, identify the most appropriate element by name.\n"
        "If no element matches, leave page_element_id as null and set needs_review to true.\n"
        "Return the updated steps list."
    )
