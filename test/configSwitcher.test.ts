import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  CONFIG_KIND,
  type ConfigPaths,
  detectCurrentConfigKind,
  detectConfigFiles,
  getConfigTargetPath,
  getToggleTargetKind,
  switchConfig,
} from "../src/configSwitcher";

let workspaceDir: string;

describe("config switcher", () => {
  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "eg-config-switcher-"));
    await fs.mkdir(path.join(workspaceDir, "public"));
  });

  afterEach(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("detects available dev and local config files", async () => {
    await fs.writeFile(path.join(workspaceDir, "public", "config.dev.json"), '{"env":"dev"}');
    await fs.writeFile(path.join(workspaceDir, "public", "config.local.json"), '{"env":"local"}');

    const state = await detectConfigFiles(workspaceDir);

    assert.deepEqual(state, { dev: true, local: true });
  });

  it("copies dev config to config.json", async () => {
    await fs.writeFile(path.join(workspaceDir, "public", "config.dev.json"), '{"env":"dev"}');
    await fs.writeFile(path.join(workspaceDir, "public", "config.json"), '{"env":"old"}');

    await switchConfig(workspaceDir, CONFIG_KIND.DEV);

    assert.equal(await fs.readFile(getConfigTargetPath(workspaceDir), "utf8"), '{"env":"dev"}');
  });

  it("copies local config to config.json", async () => {
    await fs.writeFile(path.join(workspaceDir, "public", "config.local.json"), '{"env":"local"}');

    await switchConfig(workspaceDir, CONFIG_KIND.LOCAL);

    assert.equal(await fs.readFile(getConfigTargetPath(workspaceDir), "utf8"), '{"env":"local"}');
  });

  it("uses custom source and target config paths", async () => {
    const configPaths: ConfigPaths = {
      devConfigPath: "env/dev.json",
      localConfigPath: "env/local.json",
      targetConfigPath: "runtime/app-config.json",
    };
    await fs.mkdir(path.join(workspaceDir, "env"));
    await fs.writeFile(path.join(workspaceDir, "env", "dev.json"), '{"env":"dev"}');
    await fs.writeFile(path.join(workspaceDir, "env", "local.json"), '{"env":"local"}');

    const state = await detectConfigFiles(workspaceDir, configPaths);
    await switchConfig(workspaceDir, CONFIG_KIND.LOCAL, configPaths);

    assert.deepEqual(state, { dev: true, local: true });
    assert.equal(await fs.readFile(getConfigTargetPath(workspaceDir, configPaths), "utf8"), '{"env":"local"}');
  });

  it("detects local when config.json api.baseUri contains localhost", async () => {
    await fs.writeFile(
      path.join(workspaceDir, "public", "config.json"),
      JSON.stringify({ api: { baseUri: "http://localhost:3000/api" } }),
    );

    const kind = await detectCurrentConfigKind(workspaceDir);

    assert.equal(kind, CONFIG_KIND.LOCAL);
  });

  it("detects dev when config.json api.baseUri does not contain localhost", async () => {
    await fs.writeFile(
      path.join(workspaceDir, "public", "config.json"),
      JSON.stringify({ api: { baseUri: "https://dev.example.com/api" } }),
    );

    const kind = await detectCurrentConfigKind(workspaceDir);

    assert.equal(kind, CONFIG_KIND.DEV);
  });

  it("defaults to dev when config.json is invalid JSON", async () => {
    await fs.writeFile(path.join(workspaceDir, "public", "config.json"), "{");

    const kind = await detectCurrentConfigKind(workspaceDir);

    assert.equal(kind, CONFIG_KIND.DEV);
  });

  it("chooses the opposite config kind as the toggle target", () => {
    assert.equal(getToggleTargetKind(CONFIG_KIND.LOCAL), CONFIG_KIND.DEV);
    assert.equal(getToggleTargetKind(CONFIG_KIND.DEV), CONFIG_KIND.LOCAL);
  });

  it("fails when the requested source config is missing", async () => {
    await assert.rejects(
      async () => switchConfig(workspaceDir, CONFIG_KIND.DEV),
      /Missing source config: public\/config\.dev\.json/,
    );
  });

  it("rejects absolute configured paths", async () => {
    const configPaths: ConfigPaths = {
      devConfigPath: path.join(workspaceDir, "config.dev.json"),
      localConfigPath: "public/config.local.json",
      targetConfigPath: "public/config.json",
    };

    await assert.rejects(
      async () => switchConfig(workspaceDir, CONFIG_KIND.DEV, configPaths),
      /Config paths must be relative to the workspace/,
    );
  });

  it("rejects configured paths outside the workspace", async () => {
    const configPaths: ConfigPaths = {
      devConfigPath: "../config.dev.json",
      localConfigPath: "public/config.local.json",
      targetConfigPath: "public/config.json",
    };

    await assert.rejects(
      async () => switchConfig(workspaceDir, CONFIG_KIND.DEV, configPaths),
      /Config paths must stay inside the workspace/,
    );
  });

  it("refuses to copy from a symlinked source config", async () => {
    const outsideFile = path.join(workspaceDir, "outside.json");
    await fs.writeFile(outsideFile, '{"env":"outside"}');
    await fs.symlink(outsideFile, path.join(workspaceDir, "public", "config.dev.json"));

    await assert.rejects(
      async () => switchConfig(workspaceDir, CONFIG_KIND.DEV),
      /Missing source config: public\/config\.dev\.json/,
    );
  });

  it("refuses to overwrite a symlinked target config", async () => {
    const outsideFile = path.join(workspaceDir, "outside.json");
    await fs.writeFile(path.join(workspaceDir, "public", "config.dev.json"), '{"env":"dev"}');
    await fs.writeFile(outsideFile, '{"env":"outside"}');
    await fs.symlink(outsideFile, path.join(workspaceDir, "public", "config.json"));

    await assert.rejects(
      async () => switchConfig(workspaceDir, CONFIG_KIND.DEV),
      /Refusing to overwrite symbolic link: public\/config\.json/,
    );

    assert.equal(await fs.readFile(outsideFile, "utf8"), '{"env":"outside"}');
  });
});
