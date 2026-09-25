import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createOfflineUpdateArchive } from "./offline-update-archive.mjs";

test("creates a readable update archive with the manifest and Unicode installer name", async () => {
  const installerName = "Шаблонізатор — просунута версія_0.2.1_x64-setup.exe";
  const installerBytes = Buffer.from("signed installer bytes");
  const manifest = {
    formatVersion: 1,
    identifier: "ua.shablonizator.advanced",
    edition: "advanced",
    version: "0.2.1",
    architecture: "x86_64",
    notes: "Перевірка оновлення",
    installer: installerName,
    signature: "test-signature",
    sha256: "test-sha256",
  };

  const archiveBytes = await createOfflineUpdateArchive(manifest, installerName, installerBytes);
  const archive = await JSZip.loadAsync(archiveBytes);

  assert.deepEqual(Object.keys(archive.files).sort(), ["manifest.json", installerName].sort());
  assert.deepEqual(JSON.parse(await archive.file("manifest.json").async("string")), manifest);
  assert.deepEqual(await archive.file(installerName).async("nodebuffer"), installerBytes);
});
