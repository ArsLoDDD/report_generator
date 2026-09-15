#!/usr/bin/env python3
"""Build the bundled summary report template from the user-supplied reference DOCX.

The script deliberately edits only the local exported copy. It retains the source
package, section setup, paragraph properties and representative run formatting.
"""

from copy import deepcopy
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}


def q(name: str) -> str:
    return f"{{{W}}}{name}"


def set_paragraph_text(paragraph, text: str) -> None:
    runs = paragraph.xpath("./w:r", namespaces=NS)
    exemplar = runs[0] if runs else None
    for child in list(paragraph):
        if child.tag != q("pPr"):
            paragraph.remove(child)
    run = etree.SubElement(paragraph, q("r"))
    if exemplar is not None:
        run_properties = exemplar.find(q("rPr"))
        if run_properties is not None:
            run.append(deepcopy(run_properties))
    parts = text.split("\n")
    for index, part in enumerate(parts):
        if index:
            etree.SubElement(run, q("br"))
        node = etree.SubElement(run, q("t"))
        node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        node.text = part


def set_mixed_text(paragraph, parts: list[tuple[str, bool]]) -> None:
    runs = paragraph.xpath("./w:r", namespaces=NS)
    exemplar = runs[0] if runs else None
    for child in list(paragraph):
        if child.tag != q("pPr"):
            paragraph.remove(child)
    for text, bold in parts:
        run = etree.SubElement(paragraph, q("r"))
        if exemplar is not None:
            run_properties = exemplar.find(q("rPr"))
            if run_properties is not None:
                properties = deepcopy(run_properties)
                for node in properties.findall(q("b")) + properties.findall(q("bCs")):
                    properties.remove(node)
                if bold:
                    etree.SubElement(properties, q("b")).set(q("val"), "1")
                    etree.SubElement(properties, q("bCs")).set(q("val"), "1")
                run.append(properties)
        node = etree.SubElement(run, q("t"))
        node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        node.text = text


def main() -> None:
    source = Path("/private/tmp/summary-report-reference.docx")
    destination = Path("src-tauri/resources/summary-report-template.docx")
    if not source.is_file():
        raise SystemExit(f"Reference DOCX is missing: {source}")

    replacements = {
        5: "Командиру {{recipient}} (через групу бойового управління штабу)",
        7: "ПІДСУМКОВЕ БОЙОВЕ ДОНЕСЕННЯ {{report_number}} командира {{unit_short_name}} {{military_unit_short_name}}, КСП «{{ksp_name}}» – н.п. {{ksp_locality}} 18:00 год {{report_date}}.",
        12: "",
        16: "особового складу – {{enemy_personnel}}, з них:",
        17: "безповоротні – {{enemy_irreversible}};",
        18: "санітарні – {{enemy_sanitary}};",
        19: "полон – {{enemy_captured}}.",
        20: "ОВТ – {{enemy_ovt}} од., з них: знищено – {{enemy_ovt_destroyed}} од.; пошкоджено – {{enemy_ovt_damaged}} од.;",
        21: "танків – {{enemy_tanks}} од., з них: знищено – {{enemy_tanks_destroyed}} од.; пошкоджено – {{enemy_tanks_damaged}} од.;",
        22: "ББМ – {{enemy_afv}} од., з них: знищено – {{enemy_afv_destroyed}} од.; пошкоджено – {{enemy_afv_damaged}} од.;",
        23: "ГіМ – {{enemy_artillery}} од., з них: знищено – {{enemy_artillery_destroyed}} од.; пошкоджено – {{enemy_artillery_damaged}} од.;",
        24: "РСЗВ – {{enemy_mlrs}} од., з них: знищено – {{enemy_mlrs_destroyed}} од.; пошкоджено – {{enemy_mlrs_damaged}} од.;",
        25: "РЕБ – {{enemy_reb}} од., з них: знищено – {{enemy_reb_destroyed}} од.; пошкоджено – {{enemy_reb_damaged}} од.;",
        26: "АТТ – {{enemy_vehicles}} од., з них: знищено – {{enemy_vehicles_destroyed}} од.; пошкоджено – {{enemy_vehicles_damaged}} од.;",
        27: "Літаки/гелікоптери – {{enemy_aircraft}} од., з них: знищено – {{enemy_aircraft_destroyed}} од.; пошкоджено – {{enemy_aircraft_damaged}} од.;",
        28: "БпЛА – {{enemy_uav}} од., знищено по типам: баражуючий боєприпас – {{enemy_uav_loitering}} од. ({{enemy_uav_molniya}} од. молнія, {{enemy_uav_lancet}} од. ланцет, пошкоджено – {{enemy_uav_damaged}}; пункти управління/укриття – {{enemy_command_posts}}/{{enemy_shelters}}, з них знищено – {{enemy_command_posts_destroyed}} од., пошкоджено – {{enemy_command_posts_damaged}} од. ({{enemy_shelters_damaged}} од. укриття).",
        29: "БпЛА (посаджені РЕБ) – {{enemy_uav_reb}} од.",
        30: "Спеціальна техніка – {{enemy_special_equipment}} од., з них: знищено – {{enemy_special_equipment_destroyed}} од.; пошкоджено – {{enemy_special_equipment_damaged}} од.;",
        31: "Технічні засоби розвідки – {{enemy_recon_equipment}} од., з них: знищено – {{enemy_recon_equipment_destroyed}} од.; пошкоджено – {{enemy_recon_equipment_damaged}} од.;",
        32: "ПУ БпЛА – {{enemy_uav_control}} од., з них: знищено – {{enemy_uav_control_destroyed}} од.; пошкоджено – {{enemy_uav_control_damaged}} од.;",
        33: "Зв’язок/системи зв’язку – {{enemy_communications}} од., з них: знищено – {{enemy_communications_destroyed}} од.; пошкоджено – {{enemy_communications_damaged}} од.;",
        34: "пункти управління/укриття – {{enemy_command_posts}}/{{enemy_shelters}}, з них знищено – {{enemy_command_posts_destroyed}} од., пошкоджено – {{enemy_command_posts_damaged}} од.",
        35: "склади боєприпасів/ПММ – {{enemy_ammo_depots}}/{{enemy_fuel_depots}}, з них: знищено – {{enemy_depots_destroyed}} од.; пошкоджено – {{enemy_depots_damaged}} од.",
        42: "-{{composition_changes}}.",
        45: "{{force_composition}}",
        47: "",
        49: "{{completeness}}",
        51: "КСП {{unit_short_name}} – {{ksp_outskirts}} населеного пункту {{ksp_locality}}.",
        53: "{{positions}}",
        62: "{{enemy_actions}}",
        65: "Противник здійснив обстріли:",
        69: "{{assault_actions}}",
        70: "Розвідка противника та виконання спланованих завдань {{unit_short_name}} {{battalion_short_name}} за період з 18:01 год {{period_start_date}} по 18:00 год {{period_end_date}} {{flight_count}}",
        72: "{{flight_operations}}",
        88: "На КСП {{unit_short_name}} в районі {{ksp_locality}} ({{ksp_mgrs}}) залучені:",
        90: "{{command_duties}}",
        92: "{{guard_duties}}",
        94: "В період з 18:01 год {{period_start_date}} по 18:00 год {{period_end_date}} було проведено:",
        95: "{{period_events}}",
        102: "{{commissions}}",
        104: "{{fortification}}",
        107: "{{dzvin}}",
        110: "{{next_tasks}}",
        114: "Загальні втрати особового складу за період з 18:01 год {{period_start_date}} по 18:00 год {{period_end_date}} склали {{own_personnel_total}} осіб, з них:",
        115: "Безповоротні – {{own_personnel_irreversible}}, у тому числі:",
        116: "Бойові – {{own_personnel_combat_irreversible}}, з них:",
        117: "загинули – {{own_personnel_killed}};",
        118: "померли від ран – {{own_personnel_died_from_wounds}};",
        119: "Інші – {{own_personnel_other}};",
        120: "Тимчасові – {{own_personnel_temporary}}, у тому числі:",
        121: "Бойові – {{own_personnel_combat_temporary}}, з них:",
        122: "санітарні бойові – {{own_personnel_wounded}};",
        123: "полон – {{own_personnel_captured}};",
        124: "зникли безвісті – {{own_personnel_missing}};",
        125: "дезертири – {{own_personnel_deserters}};",
        126: "СЗЧ – {{own_personnel_szch}};",
        127: "6.2. ВТРАТИ ОВТ",
        130: "Всього: – {{own_equipment_total}} од., з них: знищено – {{own_equipment_destroyed}} од., втрачено – {{own_equipment_lost}} од., пошкоджено – {{own_equipment_damaged}} од.;",
        131: "танків – {{own_tanks}} од., з них: знищено – {{own_tanks_destroyed}} од., пошкоджено – {{own_tanks_damaged}} од.;",
        132: "ББМ – {{own_afv}} од., з них: знищено – {{own_afv_destroyed}} од., пошкоджено – {{own_afv_damaged}} од.;",
        133: "ГіМ – {{own_artillery}} од., з них: знищено – {{own_artillery_destroyed}} од., пошкоджено – {{own_artillery_damaged}} од.;",
        134: "засоби ППО – {{own_air_defence}} од., з них: знищено – {{own_air_defence_destroyed}} од., пошкоджено – {{own_air_defence_damaged}} од.;",
        135: "АТ – {{own_vehicles}} од., з них: знищено – {{own_vehicles_destroyed}} од., пошкоджено – {{own_vehicles_damaged}} од.;",
        136: "засоби РЕБ – {{own_reb}} од., з них знищено {{own_reb_destroyed}} од.; засоби зв’язку – {{own_communications}} од., з них знищено {{own_communications_destroyed}} од.;",
        137: "БпЛА – {{own_uav}} од., з них втрачено – {{own_uav_lost}} од., пошкоджено – {{own_uav_damaged}} од.",
        139: "Втрати ОВТ {{unit_short_name}} за період 18:01 год {{period_start_date}} по 18:00 год {{period_end_date}}:",
        140: "{{equipment_losses_details}}",
        143: "{{ammunition_expenses}}",
        146: "{{problems}}",
        153: "{{other_issues}}",
        155: "{{signer_position}}",
        157: "{{signer_rank}}\t{{signer_given_name}} {{signer_surname}}",
        158: "{{report_date}}",
        164: "АРМ № {{arm_number}}",
        165: "Виконав і надрукував {{signer_given_name}} {{signer_surname}}",
        166: "{{report_date}}",
    }
    remove = {34, 46, 54, 55, 63, 64} | set(range(73, 85)) | set(range(96, 100))

    with ZipFile(source) as archive:
        document = etree.fromstring(archive.read("word/document.xml"))
        body = document.find("w:body", namespaces=NS)
        paragraphs = body.xpath("./w:p", namespaces=NS)
        for index, paragraph in enumerate(paragraphs):
            if index in remove:
                body.remove(paragraph)
            elif index in replacements:
                # An explicitly empty replacement is a deliberate blank line from
                # the supplied template, not a paragraph deletion.
                set_paragraph_text(paragraph, replacements[index])

        paragraphs = body.xpath("./w:p", namespaces=NS)
        temporary = next((paragraph for paragraph in paragraphs if "Тимчасові – {{own_personnel_temporary}}" in "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))), None)
        if temporary is not None:
            set_mixed_text(temporary, [("Тимчасові – {{own_personnel_temporary}}", True), (", у тому числі:", False)])

        tables = body.xpath("./w:tbl", namespaces=NS)
        if not tables:
            raise SystemExit("Shelling table not found in reference document")
        rows = tables[0].xpath("./w:tr", namespaces=NS)
        if len(rows) < 2:
            raise SystemExit("Shelling table data row not found")
        for row in rows[:2]:
            row_properties = row.find(q("trPr"))
            if row_properties is not None:
                for height in row_properties.findall(q("trHeight")):
                    row_properties.remove(height)
        data_paragraph = rows[1].xpath("./w:tc[1]/w:p[1]", namespaces=NS)[0]
        set_paragraph_text(data_paragraph, "{{shelling_rows}}")
        document_bytes = etree.tostring(document, xml_declaration=True, encoding="UTF-8", standalone="yes")

        with ZipFile(destination, "w", ZIP_DEFLATED) as output:
            for entry in archive.infolist():
                payload = document_bytes if entry.filename == "word/document.xml" else archive.read(entry.filename)
                output.writestr(entry, payload)


if __name__ == "__main__":
    main()
