def build_brd_analysis_prompt(brd_text: str, webpage_url: str, project_name: str) -> str:
    return (
        f"Analyse the following Business Requirements Document (BRD) for the project '{project_name}'.\n"
        f"Target URL: {webpage_url}\n\n"
        "BRD:\n"
        f"{brd_text}\n\n"
        "Sparse BRD handling:\n"
        "- BRDs can be incomplete or only describe the product at a high level.\n"
        "- Infer likely business-critical user journeys from the project name, target URL, domain clues, and BRD text.\n"
        "- Prefer practical QA assumptions over saying there is not enough detail, but do not invent exact field names, credentials, or hidden rules.\n"
        "- Include inferred features/objectives when they are needed for useful automation coverage, and phrase them as inferred.\n\n"
        "Extract:\n"
        "1. A concise summary (2-3 sentences).\n"
        "2. Key functional features that must be tested, including important inferred features when the BRD is sparse.\n"
        "3. Suggested module names using product areas described or strongly implied by the BRD.\n"
        "4. High-level test objectives that can drive scenario and test-step generation before scraping.\n\n"
        "Return a JSON object matching the BRDAnalysis schema."
    )
