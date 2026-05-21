def build_locator_classify_prompt(
    tag: str,
    role: str | None,
    label: str | None,
    placeholder: str | None,
    id_attr: str | None,
    name_attr: str | None,
    test_id: str | None,
    text: str | None,
    css_selector: str,
    xpath: str,
) -> str:
    attrs = (
        f"tag={tag}, role={role or '-'}, label={label or '-'}, "
        f"placeholder={placeholder or '-'}, id={id_attr or '-'}, "
        f"name={name_attr or '-'}, testid={test_id or '-'}, text={text or '-'}"
    )
    return (
        f"Classify this UI element and recommend the best locator strategy.\n\n"
        f"Element attributes: {attrs}\n"
        f"CSS selector: {css_selector}\n"
        f"XPath: {xpath}\n\n"
        "Provide:\n"
        "- ai_suggested_name: a short camelCase name for this element\n"
        "- ai_suggested_action: the most likely user action (click, fill, select, assert_visible)\n"
        "- confidence: how confident you are (0.0-1.0)\n"
        "- locator_order: ordered list of locator strategies to prefer "
        "(testid, role, label, id, name, css, text, xpath)\n\n"
        "Return a JSON object matching the ElementClassification schema."
    )
