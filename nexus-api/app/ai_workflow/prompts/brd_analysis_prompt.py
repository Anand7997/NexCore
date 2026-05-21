def build_brd_analysis_prompt(brd_text: str, webpage_url: str, project_name: str) -> str:
    return (
        f"Analyse the following Business Requirements Document (BRD) for the project '{project_name}'.\n"
        f"Target URL: {webpage_url}\n\n"
        "BRD:\n"
        f"{brd_text}\n\n"
        "Extract:\n"
        "1. A concise summary (2-3 sentences).\n"
        "2. Key functional features that must be tested.\n"
        "3. Suggested module names (e.g. Authentication, Checkout).\n"
        "4. High-level test objectives.\n\n"
        "Return a JSON object matching the BRDAnalysis schema."
    )
