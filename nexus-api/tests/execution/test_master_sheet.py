import json
import sqlite3
import uuid
from pathlib import Path

import pytest

from app.execution.master_sheet import (
    DesktopMasterSheet,
    load_master_sheet,
    load_master_sheet_sql,
    validate_master_sheet,
)


def test_inline_master_sheet_resolves_app_element_path_and_data():
    sheet = DesktopMasterSheet.from_variables({
        "master_sheet": {
            "applications": {
                "invoice_app": {"executable_path": r"C:\Apps\Invoice.exe"}
            },
            "elements": {
                "submit_button": {"automation_id": "btnSubmit"}
            },
            "paths": {
                "export_folder": {"path": r"C:\Exports"}
            },
            "test_data": {
                "customers": {"default": {"name": "Asha Rao"}}
            },
        }
    })

    assert sheet.application_path("invoice_app") == r"C:\Apps\Invoice.exe"
    assert sheet.element("submit_button")["automation_id"] == "btnSubmit"
    assert sheet.path_value("export_folder") == r"C:\Exports"
    assert sheet.data_value("customers.default.name") == "Asha Rao"


def test_json_master_sheet_file():
    path = Path(__file__).with_name("_desktop-master.json")
    try:
        path.write_text(json.dumps({
            "apps": {"invoice_app": r"C:\Apps\Invoice.exe"},
            "objects": {"ok_button": {"automation_id": "btnOk"}},
        }), encoding="utf-8")

        sheet = DesktopMasterSheet.from_variables({"master_sheet_path": str(path)})

        assert sheet.application_path("invoice_app") == r"C:\Apps\Invoice.exe"
        assert sheet.element("ok_button")["automation_id"] == "btnOk"
    finally:
        path.unlink(missing_ok=True)


def test_csv_master_sheet_file():
    path = Path(__file__).with_name("_desktop-master.csv")
    try:
        path.write_text(
            "section,key,application_path,automation_id,value\n"
            "applications,invoice_app,C:\\Apps\\Invoice.exe,,\n"
            "elements,submit_button,,btnSubmit,\n"
            "test_data,customer_name,,,Asha Rao\n",
            encoding="utf-8",
        )

        data = load_master_sheet(str(path))
        sheet = DesktopMasterSheet(data)

        assert sheet.application_path("invoice_app") == r"C:\Apps\Invoice.exe"
        assert sheet.element("submit_button")["automation_id"] == "btnSubmit"
        assert sheet.data_value("customer_name") == "Asha Rao"
    finally:
        path.unlink(missing_ok=True)


def test_xlsx_master_sheet_file():
    openpyxl = pytest.importorskip("openpyxl")
    path = Path(__file__).with_name("_desktop-master.xlsx")
    workbook = openpyxl.Workbook()
    apps = workbook.active
    apps.title = "Applications"
    apps.append(["key", "application_path"])
    apps.append(["invoice_app", r"C:\Apps\Invoice.exe"])
    elements = workbook.create_sheet("Elements")
    elements.append(["key", "automation_id", "control_type"])
    elements.append(["submit_button", "btnSubmit", "Button"])
    try:
        workbook.save(path)

        data = load_master_sheet(str(path))
        sheet = DesktopMasterSheet(data)

        assert sheet.application_path("invoice_app") == r"C:\Apps\Invoice.exe"
        assert sheet.element("submit_button")["automation_id"] == "btnSubmit"
    finally:
        path.unlink(missing_ok=True)


def test_yaml_master_sheet_file():
    yaml = pytest.importorskip("yaml")
    path = Path(__file__).with_name("_desktop-master.yaml")
    try:
        path.write_text(
            yaml.safe_dump({
                "applications": {"invoice_app": {"application_path": r"C:\Apps\Invoice.exe"}},
                "elements": {"submit_button": {"automation_id": "btnSubmit"}},
            }),
            encoding="utf-8",
        )

        data = load_master_sheet(str(path))
        sheet = DesktopMasterSheet(data)

        assert sheet.application_path("invoice_app") == r"C:\Apps\Invoice.exe"
        assert sheet.element("submit_button")["automation_id"] == "btnSubmit"
    finally:
        path.unlink(missing_ok=True)


def test_database_master_sheet_rows():
    path = Path(__file__).with_name(f"_desktop-master-{uuid.uuid4().hex}.db")
    con = sqlite3.connect(path)
    try:
        con.execute("CREATE TABLE master_rows(section TEXT, key TEXT, application_path TEXT, automation_id TEXT, value TEXT)")
        con.execute("INSERT INTO master_rows(section, key, application_path) VALUES('applications', 'invoice_app', 'C:\\Apps\\Invoice.exe')")
        con.execute("INSERT INTO master_rows(section, key, automation_id) VALUES('elements', 'submit_button', 'btnSubmit')")
        con.commit()
    finally:
        con.close()

    try:
        data = load_master_sheet_sql(f"sqlite:///{path}", "SELECT * FROM master_rows")
        sheet = DesktopMasterSheet(data)

        assert sheet.application_path("invoice_app") == r"C:\Apps\Invoice.exe"
        assert sheet.element("submit_button")["automation_id"] == "btnSubmit"
    finally:
        path.unlink(missing_ok=True)


def test_master_sheet_validation_flags_missing_app_path_and_weak_object():
    issues = validate_master_sheet({
        "applications": {"invoice_app": {"name": "Invoice"}},
        "elements": {"submit_button": {"control_type": "Button"}},
        "paths": {"export_folder": {"description": "missing path"}},
    })

    messages = {issue["message"] for issue in issues}
    assert "Application is missing executable/application path" in messages
    assert "Desktop object has no usable locator" in messages
    assert "Path entry is missing path/value" in messages


def test_master_sheet_validation_flags_duplicate_list_keys():
    issues = validate_master_sheet({
        "elements": [
            {"key": "submit_button", "automation_id": "btnSubmit"},
            {"key": "submit_button", "automation_id": "btnSubmit2"},
        ]
    })

    assert any(issue["message"] == "Duplicate key in master-sheet section" for issue in issues)
