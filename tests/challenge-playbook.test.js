import test from "node:test";
import assert from "node:assert/strict";
import { challengeModePrompt, POPULAR_CHALLENGE_MECHANICS } from "../lib/challenge-playbook.js";

test("generates playful abstract challenges grounded in the supplied scene", () => {
  const prompt = challengeModePrompt();
  assert.ok(POPULAR_CHALLENGE_MECHANICS.length >= 8);
  assert.ok(POPULAR_CHALLENGE_MECHANICS.every((mechanic) => prompt.includes(mechanic)));
  assert.match(prompt, /至少使用场景文本中的一个物体、角色或地点/);
  assert.match(prompt, /抽象、荒诞、反差和轻社死/);
  assert.match(prompt, /只能要求一个单一动作/);
  assert.match(prompt, /一张抽帧中明确验收/);
  assert.match(prompt, /危险动作、破坏物品、骚扰他人/);
});

test("uses a scoring-only prompt while validating a challenge", () => {
  const prompt = challengeModePrompt({ validating: true });
  assert.match(prompt, /不要生成新挑战/);
  assert.match(prompt, /严格按照 success_criteria 打分/);
  assert.ok(!prompt.includes("热门挑战机制"));
});
