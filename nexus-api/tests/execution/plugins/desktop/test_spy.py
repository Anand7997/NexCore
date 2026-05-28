from __future__ import annotations

from app.execution.plugins.desktop.spy import parse_desktop_ui_tree


def test_parse_uia_tree_creates_desktop_spy_candidates():
    tree = """
    <UITree>
      <control type="Button" name="Submit Invoice" auto_id="btnSubmit" />
      <control type="Edit" name="Customer Name" auto_id="txtCustomer" class_name="Edit" />
    </UITree>
    """

    objects = parse_desktop_ui_tree(tree)

    assert len(objects) == 2
    assert objects[0].object_key == "btnsubmit"
    assert objects[0].control_type == "button"
    assert objects[0].automation_id == "btnSubmit"
    assert objects[0].locator_strategy == "accessibility id"
    assert objects[0].primary_locator == "btnSubmit"
    assert objects[0].alternative_locators[0]["strategy"] == "accessibility id"


def test_parse_ocr_tree_creates_ocr_candidates():
    tree = """
    <OCRTree>
      <text value="Approved" x="120" y="80" conf="87" />
    </OCRTree>
    """

    objects = parse_desktop_ui_tree(tree)

    assert len(objects) == 1
    assert objects[0].object_key == "approved"
    assert objects[0].locator_strategy == "ocr"
    assert objects[0].primary_locator == "Approved"
    assert objects[0].confidence_score == 0.87
    assert objects[0].bounding_box == {"x": 120.0, "y": 80.0}


def test_parse_invalid_xml_falls_back_to_regex_parser():
    tree = '<UITree><control type="Button" name="Save" auto_id="btnSave" /></broken>'

    objects = parse_desktop_ui_tree(tree)

    assert len(objects) == 1
    assert objects[0].automation_id == "btnSave"
