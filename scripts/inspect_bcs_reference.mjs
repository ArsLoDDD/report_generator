import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = "/Users/macbook/Downloads/РБАК 14.08.2026.xlsx";
const output = "/private/tmp/bcs-reference-preview";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));

const summary = await workbook.inspect({ kind: "workbook,sheet,table", maxChars: 18000, tableMaxRows: 35, tableMaxCols: 30, tableMaxCellChars: 100 });
console.log(summary.ndjson);

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name" });
console.log(sheets.ndjson);

await fs.mkdir(output, { recursive: true });
for (const sheetName of (await workbook.inspect({ kind: "sheet", include: "name" })).ndjson.match(/"name":"([^"]+)"/g)?.map((item) => item.slice(8, -1)) ?? []) {
  const image = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${output}/${sheetName.replaceAll("/", "-")}.png`, new Uint8Array(await image.arrayBuffer()));
}
