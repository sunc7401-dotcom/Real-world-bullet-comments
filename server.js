import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileHumorStructurePrompt,
  sanitizeDanmakuList,
  selectSystemPrompt,
  validateHumorStructures
} from "./lib/humor-structures.js";
import { challengeModePrompt } from "./lib/challenge-playbook.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const humorStructures = JSON.parse(
  readFileSync(path.join(__dirname, "data", "humor-structures.json"), "utf8")
);
validateHumorStructures(humorStructures);
const humorStructurePrompt = compileHumorStructurePrompt(humorStructures);

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const apiKey = process.env.OPENAI_API_KEY || "";
const apiBaseUrl = stripTrailingSlash(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
const chatCompletionsUrl = process.env.OPENAI_CHAT_COMPLETIONS_URL
  ? stripTrailingSlash(process.env.OPENAI_CHAT_COMPLETIONS_URL)
  : `${apiBaseUrl}/chat/completions`;

app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

const SYSTEM_PROMPT = `你是“现实世界弹幕 AI”的短视频导演和互动挑战裁判。
你需要根据摄像头画面生成三类内容：弹幕、挑战、导演成片方案。
挑战规则：每个挑战只能要求一个单一动作，必须能通过一张抽帧画面判断，不要设计多步骤、连续过程、组合动作或需要计时理解的任务。
安全规则：
1. 只描述画面中能看见的内容，不编造身份、职业、关系、年龄等敏感信息。
2. 可以有网感、轻松、机智，但不要辱骂、歧视、攻击真实人物。
3. 如果画面中有人，避免评价颜值、身材、种族、疾病、隐私等。
4. 必须只输出一个严格 JSON 对象，不要 Markdown，不要解释，不要代码块。`;
const DANMAKU_SYSTEM_PROMPT = `${SYSTEM_PROMPT}\n${humorStructurePrompt}`;

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function buildUserPrompt({ mode, density, sceneContext, validationChallenge }) {
  const count = clampNumber(density, 1, 3, 2) * 3;
  const sceneLine = sceneContext ? `\n用户补充场景：${sceneContext}` : "";
  const validationLine = validationChallenge
    ? `\n正在验收挑战：${validationChallenge}\n请只判断这一个动作是否完成，challenge.score 必须给 0-100 分，challenge.result 写出一句具体点评。`
    : "";

  const modeLine = {
    danmaku: `弹幕类型：重点生成 ${count} 条短弹幕，并给出当前画面的短标题。`,
    challenge: challengeModePrompt({ validating: Boolean(validationChallenge) }),
    director: "导演类型：结合最近弹幕和挑战，生成一个可以导出短视频的拍摄方案、封面标题和结尾互动话术。"
  }[mode] || "综合类型：兼顾弹幕、挑战和导演方案。";

  return `请分析这张摄像头画面。
${modeLine}${sceneLine}${validationLine}

返回 JSON schema：
{
  "mode": "danmaku | challenge | director",
  "title": "不超过18个中文字符的短标题",
  "hook": "一句不超过24个中文字符的开场钩子",
  "danmaku": ["8到18个中文字符"],
  "scene_tags": ["最多4个短标签"],
  "heat": 0到100之间的整数,
  "challenge": {
    "name": "挑战名，不超过14字",
    "description": "要求用户完成一个明确的单一动作，不要包含然后/再/同时/先后步骤",
    "success_criteria": "AI验收标准，只检查这一个动作是否在抽帧画面里清楚出现",
    "duration": "建议时长，例如15秒",
    "score": 0到100之间的整数,
    "result": "验收挑战时给一句完成度点评；否则为空字符串"
  },
  "director": {
    "cover_title": "封面标题",
    "opening": "短视频开头文案",
    "shot": "镜头建议",
    "subtitle": "字幕文案",
    "ending": "结尾互动话术"
  },
  "confidence": 0.0到1.0
}`;
}

function buildBgmPrompt({ sceneContext, title, hook, directorText, challengeText }) {
  const contextLines = [
    sceneContext ? `用户确认场景：${sceneContext}` : "",
    title ? `当前标题：${title}` : "",
    hook ? `当前 Hook：${hook}` : "",
    directorText ? `导演方案：${directorText}` : "",
    challengeText ? `当前挑战：${challengeText}` : ""
  ].filter(Boolean).join("\n");

  return `请根据这张摄像头画面，为短视频匹配适合搜索的抖音热歌/BGM。
${contextLines}

要求：
1. 判断画面氛围，例如搞笑、日常、治愈、热血、卡点、赛博、打工人、生活感。
2. 给出 4 到 6 个适合去音乐平台搜索的中文关键词或歌名关键词。
3. 优先考虑短视频常用、容易卡点、容易做弹幕吐槽的 BGM。
4. 只输出严格 JSON，不要 Markdown。

返回 JSON schema：
{
  "scene": "一句话概括画面",
  "mood": "BGM 氛围",
  "reason": "为什么适合这种音乐",
  "search_terms": ["搜索词1", "搜索词2", "搜索词3", "搜索词4"],
  "style_tags": ["最多4个标签"]
}`;
}

function extractJson(text) {
  if (!text) {
    throw new Error("Empty model response");
  }

  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No JSON object found in model response");
    }
    return JSON.parse(match[0]);
  }
}

function text(value, fallback = "", max = 120) {
  const source = typeof value === "string" && value.trim() ? value : fallback;
  return String(source || "").slice(0, max);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values, max = 8) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const next = String(value || "").trim();
    const key = next.toLowerCase();
    if (!next || seen.has(key)) continue;
    seen.add(key);
    result.push(next.slice(0, 40));
    if (result.length >= max) break;
  }
  return result;
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function neteaseSearchUrl(term) {
  return `https://music.163.com/#/search/m/?s=${encodeURIComponent(term)}&type=1`;
}

function neteaseSongUrl(id) {
  return `https://music.163.com/#/song?id=${id}`;
}

function normalizeBgmIntent(raw = {}) {
  const mood = text(raw.mood, "短视频热歌", 24);
  const searchTerms = uniqueStrings([
    ...asArray(raw.search_terms),
    ...asArray(raw.keywords),
    `${mood} 抖音热歌`,
    `${mood} 短视频BGM`,
    "抖音热歌 BGM"
  ], 8);

  return {
    scene: text(raw.scene, "当前摄像头画面", 60),
    mood,
    reason: text(raw.reason, "适合当前画面的短视频氛围", 100),
    search_terms: searchTerms,
    style_tags: uniqueStrings(asArray(raw.style_tags), 4)
  };
}

async function searchNeteaseSongs(term, limit = 4) {
  const url = new URL("https://music.163.com/api/search/get/web");
  url.searchParams.set("s", term);
  url.searchParams.set("type", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", "0");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://music.163.com/"
    }
  });

  if (!response.ok) {
    throw new Error(`Music search failed: ${response.status}`);
  }

  const body = await response.json().catch(() => ({}));
  return asArray(body?.result?.songs).map((song) => ({
    id: song.id,
    title: text(song.name, term, 60),
    artist: asArray(song.artists).map((artist) => artist.name).filter(Boolean).join(" / ") || "未知歌手",
    album: text(song.album?.name, "未知专辑", 60),
    duration: formatDuration(song.duration),
    source: "网易云音乐搜索",
    sourceUrl: song.id ? neteaseSongUrl(song.id) : neteaseSearchUrl(term),
    searchUrl: neteaseSearchUrl(term),
    query: term
  }));
}

function normalizeResult(raw, fallbackMode) {
  const confidence = clampNumber(raw.confidence, 0, 1, 0.7);
  const heat = Math.round(clampNumber(raw.heat, 0, 100, Math.round(confidence * 88)));
  const challengeScore = Math.round(clampNumber(raw.challenge?.score, 0, 100, 0));
  const danmaku = fallbackMode === "danmaku"
    ? sanitizeDanmakuList(raw.danmaku)
    : Array.isArray(raw.danmaku) ? raw.danmaku : [];

  return {
    mode: text(raw.mode, fallbackMode, 16),
    title: text(raw.title, "现场画面有点意思", 30),
    hook: text(raw.hook || raw.director?.opening, "让现实自动长出弹幕", 40),
    danmaku: danmaku.map((item) => String(item).slice(0, 40)).filter(Boolean).slice(0, 10),
    scene_tags: Array.isArray(raw.scene_tags) ? raw.scene_tags.map(String).slice(0, 4) : [],
    heat,
    challenge: {
      name: text(raw.challenge?.name, "15秒名场面", 18),
      description: text(raw.challenge?.description || raw.challenge?.play, "做一个能让画面明显变化的单一动作", 100),
      success_criteria: text(raw.challenge?.success_criteria, "画面出现一个明确可见的动作", 90),
      duration: text(raw.challenge?.duration, "15秒", 12),
      score: challengeScore,
      result: text(raw.challenge?.result, "", 100)
    },
    director: {
      cover_title: text(raw.director?.cover_title || raw.title, "现实弹幕现场", 30),
      opening: text(raw.director?.opening || raw.hook, "如果现实会发弹幕，会是什么样？", 70),
      shot: text(raw.director?.shot, "先给主体特写，再慢慢推近，最后留一个反转停顿", 100),
      subtitle: text(raw.director?.subtitle, "现实自动长出弹幕", 80),
      ending: text(raw.director?.ending, "评论区说说你会怎么拍", 60)
    },
    confidence
  };
}

function getChatOutputText(body) {
  if (typeof body?.output_text === "string") {
    return body.output_text;
  }

  const message = body?.choices?.[0]?.message?.content;
  if (Array.isArray(message)) {
    return message
      .map((item) => item.text || item.content || "")
      .filter(Boolean)
      .join("\n");
  }
  return message || body?.choices?.[0]?.text || "";
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model,
    baseUrl: apiBaseUrl,
    hasApiKey: Boolean(apiKey)
  });
});

app.post("/api/search-bgm", async (req, res) => {
  try {
    const {
      image,
      sceneContext = "",
      title = "",
      hook = "",
      directorText = "",
      challengeText = ""
    } = req.body || {};

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY. Copy .env.example to .env and set your transit-platform key."
      });
    }

    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return res.status(400).json({ error: "Request body must include a base64 data URL image." });
    }

    const response = await fetch(chatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是短视频 BGM 选曲助手。必须只输出严格 JSON。" },
          {
            role: "user",
            content: [
              { type: "text", text: buildBgmPrompt({ sceneContext, title, hook, directorText, challengeText }) },
              { type: "image_url", image_url: { url: image, detail: "low" } }
            ]
          }
        ],
        max_tokens: 420,
        temperature: 0.75
      })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: body.error?.message || body.message || "Transit API request failed",
        details: body.error || body,
        endpoint: chatCompletionsUrl
      });
    }

    let intent;
    try {
      intent = normalizeBgmIntent(extractJson(getChatOutputText(body)));
    } catch {
      intent = normalizeBgmIntent({
        scene: sceneContext || title || "当前摄像头画面",
        mood: "抖音热歌",
        reason: "模型没有返回可解析的选曲 JSON，先使用通用短视频热歌搜索词。",
        search_terms: ["抖音热歌 BGM", "短视频卡点热歌", "日常搞笑BGM", "热门中文BGM"]
      });
    }

    const candidates = [];
    const seen = new Set();
    for (const term of intent.search_terms.slice(0, 5)) {
      try {
        const songs = await searchNeteaseSongs(term, 4);
        for (const song of songs) {
          const key = song.id ? `id:${song.id}` : `${song.title}-${song.artist}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({
            ...song,
            reason: intent.reason
          });
          if (candidates.length >= 8) break;
        }
      } catch {
        // Ignore a failed music source query and keep trying the next keyword.
      }
      if (candidates.length >= 8) break;
    }

    if (!candidates.length) {
      for (const term of intent.search_terms.slice(0, 4)) {
        candidates.push({
          id: "",
          title: term,
          artist: "搜索候选",
          album: "打开链接自行选择版本",
          duration: "",
          source: "网易云音乐搜索",
          sourceUrl: neteaseSearchUrl(term),
          searchUrl: neteaseSearchUrl(term),
          query: term,
          reason: intent.reason
        });
      }
    }

    res.json({
      ...intent,
      candidates
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Unexpected BGM search error",
      endpoint: chatCompletionsUrl
    });
  }
});

app.post("/api/analyze-frame", async (req, res) => {
  try {
    const {
      image,
      mode = "danmaku",
      density = 2,
      sceneContext = "",
      validationChallenge = ""
    } = req.body || {};

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY. Copy .env.example to .env and set your transit-platform key."
      });
    }

    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return res.status(400).json({ error: "Request body must include a base64 data URL image." });
    }

    const response = await fetch(chatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: selectSystemPrompt(SYSTEM_PROMPT, DANMAKU_SYSTEM_PROMPT, mode) },
          {
            role: "user",
            content: [
              { type: "text", text: buildUserPrompt({ mode, density, sceneContext, validationChallenge }) },
              { type: "image_url", image_url: { url: image, detail: "low" } }
            ]
          }
        ],
        max_tokens: mode === "director" ? 520 : 420,
        temperature: mode === "danmaku" ? 0.85 : 0.7
      })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: body.error?.message || body.message || "Transit API request failed",
        details: body.error || body,
        endpoint: chatCompletionsUrl
      });
    }

    const outputText = getChatOutputText(body);
    if (!outputText.trim()) {
      return res.status(502).json({
        error: `模型 ${model} 没有返回可展示的文本。请换成支持“图片输入 -> 文本输出”的视觉模型，例如 NeoLink 上测试可用的 gpt-5.4。`,
        details: {
          finish_reason: body?.choices?.[0]?.finish_reason,
          usage: body?.usage
        },
        endpoint: chatCompletionsUrl
      });
    }

    let result;
    try {
      result = normalizeResult(extractJson(outputText), mode);
    } catch {
      result = normalizeResult({
        mode,
        title: "这一幕值得一看",
        hook: "AI 正在抓现场重点",
        danmaku: [outputText, "这画面有点东西", "现场感拉满了"],
        scene_tags: ["实时画面"],
        heat: 55,
        confidence: 0.55
      }, mode);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Unexpected server error",
      endpoint: chatCompletionsUrl
    });
  }
});

app.listen(port, () => {
  console.log(`Real World Danmaku AI running at http://localhost:${port}`);
  console.log(`Using model ${model}`);
  console.log(`Using chat endpoint ${chatCompletionsUrl}`);
});
