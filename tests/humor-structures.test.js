import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compileHumorStructurePrompt,
  REQUIRED_HUMOR_STRUCTURE_IDS,
  sanitizeDanmakuList,
  selectSystemPrompt,
  validateHumorStructures
} from "../lib/humor-structures.js";

const structures = JSON.parse(
  readFileSync(new URL("../data/humor-structures.json", import.meta.url), "utf8")
);

test("ships all required unique humor structures", () => {
  assert.doesNotThrow(() => validateHumorStructures(structures));
  assert.equal(structures.length, 12);
  assert.deepEqual(new Set(structures.map((item) => item.id)), new Set(REQUIRED_HUMOR_STRUCTURE_IDS));
});

test("compiles a compact prompt without maintenance examples", () => {
  const prompt = compileHumorStructurePrompt(structures);
  assert.ok(prompt.length <= 180);
  assert.ok(prompt.includes("每批至少4种"));
  assert.ok(prompt.includes("至少半数尖锐"));
  assert.ok(structures.every((item) => prompt.includes(item.name)));
  assert.ok(structures.every((item) => !prompt.includes(item.example)));
});

test("uses the enhanced prompt only for danmaku mode", () => {
  assert.equal(selectSystemPrompt("base", "enhanced", "danmaku"), "enhanced");
  assert.equal(selectSystemPrompt("base", "enhanced", "challenge"), "base");
  assert.equal(selectSystemPrompt("base", "enhanced", "director"), "base");
});

test("replaces blocked attacks and empty praise without changing list length", () => {
  const result = sanitizeDanmakuList([
    "正常的尖锐吐槽",
    "这人长得丑死了",
    "这个操作真傻逼",
    "这画面有点东西"
  ]);
  assert.equal(result.length, 4);
  assert.equal(result[0], "正常的尖锐吐槽");
  assert.ok(!result.join(" ").includes("丑死"));
  assert.ok(!result.join(" ").includes("傻逼"));
  assert.ok(!result.join(" ").includes("有点东西"));
});
