import packageMetadata from "../../package.json";
import updateNotesText from "../../UPDATE_NOTES.md?raw";
import previousReleases from "../../UPDATE_HISTORY.json";

export const releaseNotesStorageKey = "shablonizator.release-notes.last-seen-version";

export const currentRelease = {
  version: packageMetadata.version,
  notes: updateNotesText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim()),
};

export const releaseHistory = [currentRelease, ...previousReleases];
