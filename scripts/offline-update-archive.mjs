import JSZip from "jszip";

export const createOfflineUpdateArchive = async (manifest, installerName, installerBytes) => {
  const archive = new JSZip();
  archive.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  archive.file(installerName, installerBytes);
  return archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
  });
};
