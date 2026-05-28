"""NL-to-Desktop-Workflow Compiler API.

Accepts a natural language description of a desktop test scenario and compiles
it into a structured NexCore workflow with:
- Desktop node candidates mapped to the described actions
- Object repository placeholders for each UI element referenced
- Required test data placeholders
- Clarifying questions for missing / ambiguous information
"""
from __future__ import annotations

import json
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import PageElementModel, PageRepositoryModel
from app.database.session import get_db

router = APIRouter(prefix="/desktop-nl", tags=["desktop-nl"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class NLCompileRequest(BaseModel):
    description: str = Field(..., min_length=5, description="Natural language test description")
    application: str = Field("", description="Known application name or path (optional)")
    platform: str = Field("Desktop", description="Always 'Desktop' for this compiler")
    use_repository: bool = Field(True, description="Look up existing repository objects to reduce placeholders")


class WorkflowNode(BaseModel):
    id: str
    node_type: str
    label: str
    config: dict[str, Any]
    notes: str = ""


class RepositoryPlaceholder(BaseModel):
    placeholder_key: str
    suggested_name: str
    control_type: str
    locator_hint: str
    existing_element_id: str | None = None


class TestDataPlaceholder(BaseModel):
    key: str
    description: str
    suggested_value: str = ""


class ClarifyingQuestion(BaseModel):
    field: str
    question: str
    options: list[str] = Field(default_factory=list)


class NLCompileResponse(BaseModel):
    workflow_id: str
    workflow_name: str
    description: str
    application: str
    nodes: list[WorkflowNode]
    repository_placeholders: list[RepositoryPlaceholder]
    test_data_placeholders: list[TestDataPlaceholder]
    clarifying_questions: list[ClarifyingQuestion]
    warnings: list[str]


# ── Action-to-NodeType Mapping ────────────────────────────────────────────────

_ACTION_PATTERNS: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"\bdouble.?click\b", re.I), "desktop.double_click", "Double Click Element"),
    (re.compile(r"\bright.?click\b|\bcontext.?menu\b", re.I), "desktop.right_click", "Right Click Element"),
    (re.compile(r"\bdrag\b.*\bto\b|\bmove\b.*\bto\b", re.I), "desktop.drag_and_drop", "Drag and Drop"),
    (re.compile(r"\bhotkey\b|\bshortcut\b|\bctrl\+|\balt\+|\bshift\+", re.I), "desktop.hotkey", "Hotkey"),
    (re.compile(r"\bkey\s+sequence\b|\bkeys\b.*\bin order\b", re.I), "desktop.key_sequence", "Key Sequence"),
    (re.compile(r"\bpress\s+(?:the\s+)?(?:key\s+)?(?:enter|tab|escape|esc|space|backspace|delete|home|end|page\s*up|page\s*down)\b", re.I), "desktop.press_key", "Press Key"),
    (re.compile(r"\brestart\b|\brelaunch\b", re.I), "desktop.restart", "Restart Application"),
    (re.compile(r"\blaunch\b|\bopen\b|\bstart\b|\brun\b.*application", re.I), "desktop.launch", "Launch Application"),
    (re.compile(r"\bclose\b|\bkill\b|\bquit\b|\bexit\b.*application", re.I), "desktop.close", "Close Application"),
    (re.compile(r"\bactivate\b|\bbring.*front\b", re.I), "desktop.activate_window", "Activate Window"),
    (re.compile(r"\bswitch.*window\b|\battach.*window\b|\bfocus.*window\b", re.I), "desktop.switch_window", "Switch Window"),
    (re.compile(r"\bwait\b.*(?:window|dialog|screen)\b", re.I), "desktop.wait_window", "Wait For Window"),
    (re.compile(r"\bwait\b.*(?:app|application|process)\b", re.I), "desktop.wait_app", "Wait For App"),
    (re.compile(r"\bhover\b|\bmove mouse\b", re.I), "desktop.hover", "Hover Element"),
    (re.compile(r"\bclick\b|\btap\b|\bselect\b", re.I), "desktop.click", "Click Element"),
    (re.compile(r"\btype\b|\benter\b|\binput\b|\bfill\b|\bset\b.*text\b", re.I), "desktop.type_text", "Type Text"),
    (re.compile(r"\bclear\b|\berase\b|\bwipe\b.*(?:field|text|input)", re.I), "desktop.clear", "Clear Text"),
    (re.compile(r"\bscroll\b", re.I), "desktop.scroll", "Scroll"),
    (re.compile(r"\bverify\b|\bassert\b|\bcheck\b|\bconfirm\b.*(?:text|value|label)\b", re.I), "desktop.assert_text", "Assert Text"),
    (re.compile(r"\bverify\b|\bassert\b|\bcheck\b.*(?:visible|exist|present|shown)\b", re.I), "desktop.assert_property", "Assert Element Property"),
    (re.compile(r"\bverify\b|\bassert\b.*(?:image|screenshot|visual)\b", re.I), "desktop.assert_visual", "Assert Visual"),
    (re.compile(r"\bverify\b|\bassert\b.*(?:table|grid)\b", re.I), "desktop.assert_table", "Assert Table"),
    (re.compile(r"\bget\b|\bread\b|\bcapture\b|\bextract\b.*(?:text|value)", re.I), "desktop.extract_text", "Extract Text"),
    (re.compile(r"\bscreenshot\b|\bcapture\b.*(?:screen|window)\b", re.I), "desktop.screenshot", "Capture Screenshot"),
    (re.compile(r"\bmenu\b.*click\b|\bnavigate\b.*menu\b", re.I), "desktop.menu_action", "Menu Action"),
    (re.compile(r"\buncheck\b", re.I), "desktop.uncheck", "Uncheck Control"),
    (re.compile(r"\bcheckbox\b|\bcheck\b.*box\b", re.I), "desktop.check", "Check Control"),
    (re.compile(r"\bdropdown\b|\bcombo\b|\bselect\b.*(?:option|item)\b", re.I), "desktop.select", "Select Value"),
    (re.compile(r"\btree\b|\bexpand\b|\bcollapse\b.*(?:node|tree)", re.I), "desktop.tree_action", "Tree Action"),
    (re.compile(r"\btable\b|\bgrid\b.*(?:click|select|cell)\b", re.I), "desktop.table_cell_action", "Table Cell Action"),
    (re.compile(r"\bfile.*dialog\b|\bbrowse.*for.*file\b|\bopen.*file\b", re.I), "desktop.file_dialog", "File Dialog"),
    (re.compile(r"\bprint.*dialog\b|\bprint.*document\b", re.I), "desktop.print_dialog", "Print Dialog"),
    (re.compile(r"\bdownload\b|\bwait.*download\b", re.I), "desktop.download_wait", "Wait for Download"),
    (re.compile(r"\bupload\b", re.I), "desktop.upload_file", "Upload File"),
]

_ELEMENT_HINTS = re.compile(
    r"\b(?:button|field|input|textbox|label|link|icon|checkbox|radio|dropdown|combobox|"
    r"listbox|tree|table|grid|tab|menu|toolbar|panel|dialog|window|frame|"
    r"scroll.*bar|spin.*box|slider|progress|image|picture|icon)\b",
    re.I,
)

_VALUE_HINTS = re.compile(
    r'"([^"]+)"|\'([^\']+)\'|(?:value|text|data)\s*[:=]\s*(\S+)', re.I
)


def _tokenise_sentences(description: str) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+|\bstep\s*\d+[.:]\s*|\bthen\b|\band\b|\bfinally\b", description, flags=re.I)
    return [s.strip() for s in sentences if len(s.strip()) > 3]


def _match_node_type(sentence: str) -> tuple[str, str]:
    for pattern, node_type, label in _ACTION_PATTERNS:
        if pattern.search(sentence):
            return node_type, label
    return "desktop.click", "Interact"


def _extract_element_hint(sentence: str) -> str:
    m = _ELEMENT_HINTS.search(sentence)
    return m.group(0).lower().replace(" ", "_") if m else "element"


def _extract_value_hint(sentence: str) -> str:
    m = _VALUE_HINTS.search(sentence)
    if m:
        return m.group(1) or m.group(2) or m.group(3) or ""
    typed = re.search(r"\b(?:type|enter|input|fill)\s+(.+?)\s+(?:in|into|to)\b", sentence, re.I)
    if typed:
        return typed.group(1).strip(" '\"")
    return ""


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:48]


def _display_name(value: str) -> str:
    return str(value or "element").replace("_", " ").strip() or "element"


def _locator_config(elem_key: str, element_hint: str) -> dict[str, Any]:
    label = _display_name(element_hint)
    return {
        "object_key": elem_key,
        "selector": label,
        "strategy": "name",
        "name": label,
    }


def _value_placeholder(
    test_data: list[TestDataPlaceholder],
    seen_values: set[str],
    key_seed: str,
    description: str,
    suggested_value: str = "",
) -> str:
    key = _slug(key_seed)
    if key not in seen_values:
        seen_values.add(key)
        test_data.append(TestDataPlaceholder(
            key=key,
            description=description,
            suggested_value=suggested_value,
        ))
    return f"{{{{test_data.{key}}}}}"


def _extract_hotkey(sentence: str) -> list[str]:
    match = re.search(r"\b((?:ctrl|control|alt|shift|win|meta|cmd|command)\s*\+\s*[a-z0-9]+)\b", sentence, re.I)
    if not match:
        return ["Control", "S"]
    aliases = {"ctrl": "Control", "cmd": "Meta", "command": "Meta", "win": "Meta"}
    return [
        aliases.get(part.strip().lower(), part.strip().title())
        for part in re.split(r"\s*\+\s*", match.group(1))
        if part.strip()
    ]


def _extract_key(sentence: str) -> str:
    match = re.search(r"\b(?:press\s+(?:the\s+)?(?:key\s+)?)((?:page\s*)?up|(?:page\s*)?down|enter|tab|escape|esc|space|backspace|delete|home|end)\b", sentence, re.I)
    if not match:
        return "Enter"
    key = match.group(1).replace(" ", "").title()
    return "Escape" if key.lower() == "esc" else key


def _build_nodes(sentences: list[str], application: str) -> tuple[
    list[WorkflowNode],
    list[RepositoryPlaceholder],
    list[TestDataPlaceholder],
]:
    nodes: list[WorkflowNode] = []
    placeholders: list[RepositoryPlaceholder] = []
    test_data: list[TestDataPlaceholder] = []
    seen_elements: dict[str, str] = {}
    seen_values: set[str] = set()

    for i, sentence in enumerate(sentences):
        node_type, label = _match_node_type(sentence)
        element_hint = _extract_element_hint(sentence)
        value_hint = _extract_value_hint(sentence)
        node_id = f"node_{i + 1:03d}"

        # Build placeholder key
        elem_key = _slug(f"{element_hint}_{i + 1}")
        if element_hint in seen_elements:
            elem_key = seen_elements[element_hint]
        else:
            seen_elements[element_hint] = elem_key
            placeholders.append(RepositoryPlaceholder(
                placeholder_key=elem_key,
                suggested_name=element_hint.replace("_", " ").title(),
                control_type=element_hint,
                locator_hint=f"Derived from: '{sentence[:80]}'",
            ))

        app_value = application or "{{test_data.application}}"
        cfg: dict[str, Any] = {"app": app_value}
        element_nodes = {
            "desktop.click", "desktop.double_click", "desktop.right_click", "desktop.hover",
            "desktop.type_text", "desktop.clear", "desktop.select", "desktop.check", "desktop.uncheck",
            "desktop.assert_text", "desktop.assert_property", "desktop.extract_text",
            "desktop.table_cell_action", "desktop.tree_action", "desktop.upload_file",
        }
        if node_type in element_nodes:
            cfg.update(_locator_config(elem_key, element_hint))

        if node_type in {"desktop.launch", "desktop.restart"}:
            cfg["app"] = app_value
        elif node_type == "desktop.type_text":
            cfg["value"] = _value_placeholder(
                test_data,
                seen_values,
                f"value_{value_hint[:24] or elem_key}",
                f"Text to type for '{_display_name(element_hint)}'",
                value_hint,
            )
        elif node_type == "desktop.select":
            cfg["value"] = value_hint or _value_placeholder(
                test_data,
                seen_values,
                f"select_{elem_key}",
                f"Value to select for '{_display_name(element_hint)}'",
            )
        elif node_type == "desktop.assert_text":
            cfg["expected"] = value_hint or _value_placeholder(
                test_data,
                seen_values,
                f"expected_{elem_key}",
                f"Expected text for '{_display_name(element_hint)}'",
            )
        elif node_type == "desktop.assert_property":
            cfg["property"] = "name"
            cfg["expected"] = value_hint or _display_name(element_hint)
        elif node_type == "desktop.extract_text":
            cfg["variable"] = _slug(f"{elem_key}_text") or "desktop_text"
        elif node_type == "desktop.wait_window":
            cfg["window_title"] = value_hint or application or _display_name(element_hint)
        elif node_type == "desktop.wait_app":
            cfg["process_name"] = application
        elif node_type in {"desktop.activate_window", "desktop.switch_window"}:
            cfg["window_title"] = value_hint or application or _display_name(element_hint)
        elif node_type == "desktop.drag_and_drop":
            cfg["source_selector"] = _display_name(element_hint)
            cfg["source_strategy"] = "name"
            cfg["target_selector"] = value_hint or "target"
            cfg["target_strategy"] = "name"
        elif node_type == "desktop.hotkey":
            cfg["keys"] = _extract_hotkey(sentence)
        elif node_type == "desktop.press_key":
            cfg["key"] = _extract_key(sentence)
        elif node_type == "desktop.key_sequence":
            cfg["keys"] = [_extract_key(sentence)]
        elif node_type == "desktop.menu_action":
            cfg["menu_path"] = value_hint or sentence
        elif node_type == "desktop.table_cell_action":
            cfg["row"] = 0
            cfg["column"] = value_hint or "Name"
            cfg["action"] = "click"
        elif node_type == "desktop.tree_action":
            cfg["node_path"] = value_hint or _display_name(element_hint)
            cfg["action"] = "select"
        elif node_type == "desktop.assert_table":
            cfg["expected_rows"] = []
        elif node_type == "desktop.file_dialog":
            cfg["file_path"] = value_hint or _value_placeholder(
                test_data,
                seen_values,
                "file_path",
                "File path for the desktop file dialog",
            )
        elif node_type == "desktop.download_wait":
            cfg["download_dir"] = value_hint or _value_placeholder(
                test_data,
                seen_values,
                "download_dir",
                "Download directory for desktop download wait",
            )
        elif node_type == "desktop.upload_file":
            cfg["file_path"] = value_hint or _value_placeholder(
                test_data,
                seen_values,
                "upload_file_path",
                "File path to upload",
            )

        nodes.append(WorkflowNode(
            id=node_id,
            node_type=node_type,
            label=f"{label}",
            config=cfg,
            notes=sentence[:160],
        ))

    return nodes, placeholders, test_data


async def _resolve_repository_matches(
    placeholders: list[RepositoryPlaceholder],
    application: str,
    db: AsyncSession,
) -> list[RepositoryPlaceholder]:
    """Attempt to match each placeholder to an existing repository element."""
    if not application:
        return placeholders

    page_result = await db.execute(
        select(PageRepositoryModel)
        .where(PageRepositoryModel.platform == "desktop")
        .where(PageRepositoryModel.name == application)
        .limit(1)
    )
    page = page_result.scalar_one_or_none()
    if page is None:
        return placeholders

    elem_result = await db.execute(
        select(PageElementModel).where(PageElementModel.page_id == page.id)
    )
    elements = elem_result.scalars().all()

    updated: list[RepositoryPlaceholder] = []
    for ph in placeholders:
        needle = ph.suggested_name.lower()
        match: PageElementModel | None = None
        for elem in elements:
            if needle in (elem.name or "").lower() or needle in (elem.element_type or "").lower():
                match = elem
                break
        if match:
            updated.append(ph.model_copy(update={"existing_element_id": match.id}))
        else:
            updated.append(ph)
    return updated


def _build_clarifying_questions(
    description: str,
    application: str,
    nodes: list[WorkflowNode],
    placeholders: list[RepositoryPlaceholder],
) -> list[ClarifyingQuestion]:
    questions: list[ClarifyingQuestion] = []
    if not application:
        questions.append(ClarifyingQuestion(
            field="application",
            question="Which application should this workflow test? Please provide the application name or executable path.",
        ))
    unresolved = [p for p in placeholders if p.existing_element_id is None]
    if len(unresolved) > 5:
        questions.append(ClarifyingQuestion(
            field="element_details",
            question=f"{len(unresolved)} UI elements could not be matched to existing repository objects. "
                     "Would you like to map these during recording or provide locators manually?",
            options=["Map during recording", "Provide locators manually", "Skip for now"],
        ))
    type_nodes = [n for n in nodes if n.node_type == "desktop.type_text" and "{{test_data." in json.dumps(n.config)]
    if type_nodes:
        questions.append(ClarifyingQuestion(
            field="test_data_source",
            question="Some steps require typed text values. Should test data come from a data-driven table or be hardcoded?",
            options=["Data table (Excel/CSV)", "Hardcoded values", "Environment variables"],
        ))
    assert_nodes = [n for n in nodes if "assert" in n.node_type]
    if assert_nodes:
        questions.append(ClarifyingQuestion(
            field="assert_tolerance",
            question="For visual / image assertions, what similarity threshold should be used (0–100%)?",
            options=["90%", "95%", "99%", "100% (exact)"],
        ))
    return questions


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/compile", response_model=NLCompileResponse)
async def compile_nl_to_workflow(
    body: NLCompileRequest,
    db: AsyncSession = Depends(get_db),
) -> NLCompileResponse:
    """Compile a natural language test description into a NexCore desktop workflow."""
    sentences = _tokenise_sentences(body.description)
    if not sentences:
        raise HTTPException(status_code=400, detail="Could not extract any steps from the description.")

    nodes, placeholders, test_data = _build_nodes(sentences, body.application)

    if body.use_repository and body.application:
        placeholders = await _resolve_repository_matches(placeholders, body.application, db)

    questions = _build_clarifying_questions(body.description, body.application, nodes, placeholders)

    warnings: list[str] = []
    if not body.application:
        warnings.append("No application specified — nodes use {{test_data.application}} placeholder.")
    unresolved = sum(1 for p in placeholders if p.existing_element_id is None)
    if unresolved:
        warnings.append(f"{unresolved} object(s) could not be matched to the repository — review placeholders before execution.")

    return NLCompileResponse(
        workflow_id=str(uuid.uuid4()),
        workflow_name=f"Compiled: {body.description[:60]}",
        description=body.description,
        application=body.application,
        nodes=nodes,
        repository_placeholders=placeholders,
        test_data_placeholders=test_data,
        clarifying_questions=questions,
        warnings=warnings,
    )
