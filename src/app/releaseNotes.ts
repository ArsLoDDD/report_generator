import packageMetadata from "../../package.json";
import updateNotesText from "../../UPDATE_NOTES.md?raw";
import previousReleases from "../../UPDATE_HISTORY.json";

export const releaseNotesStorageKey = "shablonizator.release-notes.last-seen-version";

const currentNotes = updateNotesText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());

function releaseFingerprint(version: string, notes: string[]) {
  const source = `${version}\n${notes.join("\n")}`;
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${version}:${(hash >>> 0).toString(36)}`;
}

export const currentRelease = {
  version: packageMetadata.version,
  notes: currentNotes,
  fingerprint: releaseFingerprint(packageMetadata.version, currentNotes),
};

export const releaseHistory = [currentRelease, ...previousReleases];
