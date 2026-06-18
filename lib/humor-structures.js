export const REQUIRED_HUMOR_STRUCTURE_IDS = [
  "object_personification",
  "identity_mismatch",
  "function_reversal",
  "literal_misreading",
  "causality_reversal",
  "deadpan_exaggeration",
  "workplace_analogy",
  "game_analogy",
  "system_status_analogy",
  "pseudo_philosophy",
  "live_audience_reaction",
  "premise_deconstruction"
];

const BLOCKED_DANMAKU_PATTERNS = [
  /颜值|长得丑|丑死|身材|胖子|肥胖|太胖|太瘦/,
  /种族|肤色|民族|残疾|智障|精神病|有病/,
  /身份证|手机号|家庭住址|住哪|收入多少|隐私/,
  /性取向|宗教|政治立场/,
  /傻逼|妈的|操你|草泥马|废物|垃圾人|狗东西/,
  /这画面有点东西|现场感拉满|画面有点意思/
];

const SAFE_SHARP_REPLACEMENTS = [
  "这操作像补丁只打了一半",
  "现场逻辑已经停止响应",
  "这一步把教程都看沉默了",
  "建议给这个操作申请工伤",
  "观众席正在集体加载问号",
  "这局面连系统都不想背锅"
];

export function validateHumorStructures(structures) {
  if (!Array.isArray(structures) || structures.length !== REQUIRED_HUMOR_STRUCTURE_IDS.length) {
    throw new Error(`Humor structure library must contain exactly ${REQUIRED_HUMOR_STRUCTURE_IDS.length} entries`);
  }

  const ids = new Set();
  const names = new Set();
  for (const item of structures) {
    if (!item || typeof item !== "object") throw new Error("Each humor structure must be an object");
    for (const field of ["id", "name", "rule", "example"]) {
      if (typeof item[field] !== "string" || !item[field].trim()) {
        throw new Error(`Humor structure field ${field} must be a non-empty string`);
      }
    }
    if (ids.has(item.id) || names.has(item.name)) throw new Error("Humor structure ids and names must be unique");
    ids.add(item.id);
    names.add(item.name);
  }

  const missing = REQUIRED_HUMOR_STRUCTURE_IDS.filter((id) => !ids.has(id));
  if (missing.length) throw new Error(`Missing humor structures: ${missing.join(", ")}`);
  return structures;
}

export function compileHumorStructurePrompt(structures) {
  validateHumorStructures(structures);
  const names = structures.map((item) => item.name).join("、");
  const prompt = `弹幕结构库：${names}。每批至少4种，同类最多2条，不标结构；至少半数尖锐有损友感，可挖苦当下动作和操作，不爆粗，不碰颜值、身材、疾病、隐私、身份，不作永久人格判断；禁客服腔、机械描述和空话。`;
  if (prompt.length > 180) throw new Error(`Compiled humor structure prompt is too long: ${prompt.length}`);
  return prompt;
}

export function selectSystemPrompt(basePrompt, danmakuPrompt, mode) {
  return mode === "danmaku" ? danmakuPrompt : basePrompt;
}

export function sanitizeDanmakuList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value, index) => {
    const text = String(value || "").trim().slice(0, 40);
    if (!BLOCKED_DANMAKU_PATTERNS.some((pattern) => pattern.test(text))) return text;
    return SAFE_SHARP_REPLACEMENTS[index % SAFE_SHARP_REPLACEMENTS.length];
  }).filter(Boolean);
}
