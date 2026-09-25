import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createOfflineUpdateArchive } from "./offline-update-archive.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const requestedVersion = valueAfter("--version");
const notes = valueAfter("--notes") ?? "Оновлення Шаблонізатора";
const skipTests = args.includes("--skip-tests");

if (args.includes("--help")) {
  console.log('Використання: npm run update:build -- --version 0.3.0 --notes "Опис змін" [--skip-tests]');
  process.exit(0);
}
if (process.platform !== "win32") {
  throw new Error("Офлайн-пакет оновлення збирається лише у Windows.");
}
if (!requestedVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedVersion)) {
  throw new Error("Вкажіть коректну версію: --version 0.3.0");
}

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) {
    throw new Error(`Не вдалося запустити команду «${command}»: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`Команду «${command}» перервано сигналом ${result.signal}.`);
  }
  if (result.status !== 0) {
    throw new Error(`Команда «${command}» завершилась з кодом ${result.status}. Деталі наведені вище.`);
  }
};
const runNpm = (commandArgs, options = {}) => {
  const npmCliPath = process.env.npm_execpath;
  if (!npmCliPath || !existsSync(npmCliPath)) {
    throw new Error("Не знайдено npm CLI. Запускайте створення оновлення через npm run update:build.");
  }
  run(process.execPath, [npmCliPath, ...commandArgs], options);
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value, indentation = 2) => writeFileSync(path, `${JSON.stringify(value, null, indentation)}\n`);

const packagePath = join(projectRoot, "package.json");
const lockPath = join(projectRoot, "package-lock.json");
const packageJson = readJson(packagePath);
const packageLock = readJson(lockPath);
packageJson.version = requestedVersion;
packageLock.version = requestedVersion;
packageLock.packages[""].version = requestedVersion;
writeJson(packagePath, packageJson, "\t");
writeJson(lockPath, packageLock, 2);

for (const name of ["tauri.conf.json", "tauri.simple.conf.json", "tauri.advanced.conf.json", "tauri.admin.conf.json"]) {
  const path = join(projectRoot, "src-tauri", name);
  const config = readJson(path);
  config.version = requestedVersion;
  writeJson(path, config, 2);
}

const cargoPath = join(projectRoot, "src-tauri", "Cargo.toml");
const cargoLockPath = join(projectRoot, "src-tauri", "Cargo.lock");
writeFileSync(cargoPath, readFileSync(cargoPath, "utf8").replace(/(\[package\][\s\S]*?\nversion = ")[^"]+("\n)/, `$1${requestedVersion}$2`));
writeFileSync(cargoLockPath, readFileSync(cargoLockPath, "utf8").replace(/(name = "shablonizator"\nversion = ")[^"]+("\n)/, `$1${requestedVersion}$2`));

if (!skipTests) runNpm(["run", "test:full"]);

const privateKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH
  || join(projectRoot, ".tauri-private", "shablonizator-updater.key");
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !existsSync(privateKeyPath)) {
  throw new Error("Не знайдено приватний ключ оновлень. Відновіть .tauri-private/shablonizator-updater.key або задайте TAURI_SIGNING_PRIVATE_KEY.");
}

const advancedPath = join(projectRoot, "src-tauri", "tauri.advanced.conf.json");
const updateConfigPath = join(projectRoot, "src-tauri", "tauri.update.generated.conf.json");
const updateConfig = readJson(advancedPath);
updateConfig.bundle = { ...updateConfig.bundle, createUpdaterArtifacts: true };
writeJson(updateConfigPath, updateConfig, 2);

const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY) env.TAURI_SIGNING_PRIVATE_KEY_PATH = privateKeyPath;
runNpm(["run", "tauri", "--", "build", "--config", "src-tauri/tauri.update.generated.conf.json", "--bundles", "nsis", "--ci"], { env });

const bundleDirectory = join(projectRoot, "src-tauri", "target", "release", "bundle", "nsis");
const installers = readdirSync(bundleDirectory)
  .filter((name) => name.toLowerCase().endsWith(".exe") && existsSync(join(bundleDirectory, `${name}.sig`)))
  .sort();
const installerName = installers.at(-1);
if (!installerName) throw new Error("Не знайдено підписаний NSIS-інсталятор та файл .sig.");

const installerPath = join(bundleDirectory, installerName);
const signature = readFileSync(`${installerPath}.sig`, "utf8").trim();
const installerBytes = readFileSync(installerPath);
const sha256 = createHash("sha256").update(installerBytes).digest("hex");
const manifest = {
  formatVersion: 1,
  identifier: "ua.shablonizator.advanced",
  edition: "advanced",
  version: requestedVersion,
  architecture: "x86_64",
  notes,
  installer: installerName,
  signature,
  sha256,
};

const releaseDirectory = join(projectRoot, "release");
mkdirSync(releaseDirectory, { recursive: true });
const updatePath = join(releaseDirectory, `Shablonizator-Advanced-${requestedVersion}.shupd`);
try {
  rmSync(updatePath, { force: true });
  const archiveBytes = await createOfflineUpdateArchive(manifest, installerName, installerBytes);
  writeFileSync(updatePath, archiveBytes);
} finally {
  rmSync(updateConfigPath, { force: true });
}

console.log(`Готово: ${updatePath}`);
