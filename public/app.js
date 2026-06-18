import {
  CHALLENGE_INTERVAL_MS,
  createRequestLimiter,
  scaleDanmakuDuration,
  MAX_DANMAKU_CONCURRENCY
} from "./request-limiter.js";

const camera = document.querySelector("#camera");
const canvas = document.querySelector("#capture");
const danmakuLayer = document.querySelector("#danmakuLayer");
const stage = document.querySelector(".stage");
const startBtn = document.querySelector("#startBtn");
const clearBtn = document.querySelector("#clearBtn");
const typeTabs = [...document.querySelectorAll(".type-tab")];
const typePanels = [...document.querySelectorAll(".type-panel")];
const sceneInput = document.querySelector("#sceneInput");
const sceneConfirmBtn = document.querySelector("#sceneConfirmBtn");
const sceneStatus = document.querySelector("#sceneStatus");
const intervalRange = document.querySelector("#intervalRange");
const intervalValue = document.querySelector("#intervalValue");
const densityRange = document.querySelector("#densityRange");
const densityValue = document.querySelector("#densityValue");
const danmakuToggleBtn = document.querySelector("#danmakuToggleBtn");
const danmakuOnceBtn = document.querySelector("#danmakuOnceBtn");
const danmakuList = document.querySelector("#danmakuList");
const validateBtn = document.querySelector("#validateBtn");
const skipChallengeBtn = document.querySelector("#skipChallengeBtn");
const challengeName = document.querySelector("#challengeName");
const challengeDescription = document.querySelector("#challengeDescription");
const challengeCriteria = document.querySelector("#challengeCriteria");
const challengeDuration = document.querySelector("#challengeDuration");
const challengeScore = document.querySelector("#challengeScore");
const challengeResult = document.querySelector("#challengeResult");
const bestScore = document.querySelector("#bestScore");
const bestFrameImg = document.querySelector("#bestFrameImg");
const directorStatus = document.querySelector("#directorStatus");
const directorOpening = document.querySelector("#directorOpening");
const directorShot = document.querySelector("#directorShot");
const directorSubtitle = document.querySelector("#directorSubtitle");
const directorEnding = document.querySelector("#directorEnding");
const directorMaterial = document.querySelector("#directorMaterial");
const directorPlanBtn = document.querySelector("#directorPlanBtn");
const searchBgmBtn = document.querySelector("#searchBgmBtn");
const exportVideoBtn = document.querySelector("#exportVideoBtn");
const bgmStatus = document.querySelector("#bgmStatus");
const selectedBgmText = document.querySelector("#selectedBgmText");
const bgmList = document.querySelector("#bgmList");
const aiTitle = document.querySelector("#aiTitle");
const aiHook = document.querySelector("#aiHook");
const statusDot = document.querySelector("#statusDot");
const fpsBadge = document.querySelector("#fpsBadge");
const modelBadge = document.querySelector("#modelBadge");
const heatBadge = document.querySelector("#heatBadge");
const heatBar = document.querySelector("#heatBar");

let stream = null;
let activeType = "danmaku";
let danmakuRunning = false;
let danmakuTimer = null;
let validating = false;
let challengeTimer = null;
let busy = false;
const danmakuRequestLimiter = createRequestLimiter(MAX_DANMAKU_CONCURRENCY);
let modeEntryId = 0;
let track = 0;
let latestSnapshot = "";
let latestDirector = null;
let currentChallenge = null;
let confirmedSceneContext = "";
let lastSkippedChallenge = "";
let recentChallengeHistory = [];
let backupChallengeCursor = 0;
let bestChallenge = { score: 0, snapshot: "", result: "" };
let recentDanmaku = [];
let selectedBgm = null;
let bgmCandidates = [];

const commenterNames = ["现场观众", "热评员", "路过网友", "镜头搭子", "弹幕课代表", "氛围组"];
const backupChallenges = [
  {
    name: "举起一物",
    description: "把一个物体举到镜头前。",
    success_criteria: "抽帧画面里能清楚看到物体被举到镜头前。",
    duration: "15秒",
    score: 0,
    result: ""
  },
  {
    name: "竖个拇指",
    description: "对着镜头竖起一个大拇指。",
    success_criteria: "抽帧画面里能清楚看到竖起大拇指的手势。",
    duration: "15秒",
    score: 0,
    result: ""
  },
  {
    name: "指向主角",
    description: "用手指指向画面里的一个物体。",
    success_criteria: "抽帧画面里能清楚看到手指正在指向某个物体。",
    duration: "15秒",
    score: 0,
    result: ""
  },
  {
    name: "张开手掌",
    description: "对着镜头张开一只手掌。",
    success_criteria: "抽帧画面里能清楚看到张开的手掌。",
    duration: "15秒",
    score: 0,
    result: ""
  },
  {
    name: "比个OK",
    description: "对着镜头比一个 OK 手势。",
    success_criteria: "抽帧画面里能清楚看到 OK 手势。",
    duration: "15秒",
    score: 0,
    result: ""
  },
  {
    name: "靠近镜头",
    description: "把脸或一个物体靠近镜头。",
    success_criteria: "抽帧画面里能看到主体明显靠近镜头、占比变大。",
    duration: "15秒",
    score: 0,
    result: ""
  },
  {
    name: "遮住镜头",
    description: "用手掌遮住一部分镜头。",
    success_criteria: "抽帧画面里能看到手掌遮挡了部分画面。",
    duration: "15秒",
    score: 0,
    result: ""
  }
];

const fallbackLines = [
  "镜头一开就有节目效果",
  "这画面先赢一半",
  "生活感突然拉满",
  "路过也得看两眼"
];

function setStatus(text, live = false) {
  fpsBadge.textContent = text;
  statusDot.classList.toggle("live", live);
}

function setHeat(value = 0) {
  const heat = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  heatBadge.textContent = `热度 ${heat}`;
  heatBar.style.width = `${heat}%`;
}

function updateControls() {
  intervalValue.textContent = `${intervalRange.value}ms`;
  densityValue.textContent = `${densityRange.value}档`;
}

function confirmSceneContext() {
  confirmedSceneContext = sceneInput.value.trim();
  sceneStatus.textContent = confirmedSceneContext ? "场景已生效" : "未设置场景";
  sceneStatus.classList.toggle("active", Boolean(confirmedSceneContext));
  sceneStatus.classList.remove("dirty");
  setStatus(confirmedSceneContext ? "场景已确认" : "场景已清空", Boolean(confirmedSceneContext));
}

function markSceneDraftChanged() {
  const draft = sceneInput.value.trim();
  if (draft === confirmedSceneContext) {
    sceneStatus.textContent = confirmedSceneContext ? "场景已生效" : "未设置场景";
    sceneStatus.classList.toggle("active", Boolean(confirmedSceneContext));
    sceneStatus.classList.remove("dirty");
    return;
  }
  sceneStatus.textContent = "有未确认修改";
  sceneStatus.classList.remove("active");
  sceneStatus.classList.add("dirty");
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForIdle(timeout = 30000) {
  const startedAt = Date.now();
  while (busy || danmakuRequestLimiter.active > 0) {
    if (Date.now() - startedAt > timeout) return false;
    await sleep(120);
  }
  return true;
}

function stopDanmakuLoop(statusText = "") {
  if (!danmakuRunning && !danmakuTimer) return;
  danmakuRunning = false;
  clearInterval(danmakuTimer);
  danmakuTimer = null;
  danmakuToggleBtn.textContent = "开始弹幕";
  if (statusText) setStatus(statusText, false);
}

function setActiveType(type) {
  const entryId = ++modeEntryId;
  activeType = type;
  typeTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.type === type));
  typePanels.forEach((panel) => {
    const visible = panel.id === `panel-${type}`;
    panel.hidden = !visible;
    panel.classList.toggle("active", visible);
  });
  void handleTypeEntry(type, entryId);
}

window.setActiveType = setActiveType;

async function ensureCameraReady() {
  if (stream && camera.readyState >= 2) {
    return true;
  }

  try {
    setStatus("等待摄像头授权", false);
    await startCamera();
    return true;
  } catch (error) {
    setStatus("摄像头未开启", false);
    aiTitle.textContent = "请先允许摄像头权限";
    aiHook.textContent = error.message || "挑战和导演模式需要摄像头画面。";
    return false;
  }
}

async function handleTypeEntry(type, entryId = modeEntryId) {
  if (type === "challenge") {
    stopDanmakuLoop("已切换到挑战");
    challengeResult.textContent = currentChallenge ? "可以开始 AI 验收。" : "正在准备挑战任务...";
    const ready = await ensureCameraReady();
    if (!ready || entryId !== modeEntryId || activeType !== "challenge") return;

    const idle = await waitForIdle();
    if (entryId !== modeEntryId || activeType !== "challenge") return;
    if (!idle) {
      challengeResult.textContent = "上一轮 AI 分析还没结束，请再点一次挑战或稍等几秒。";
      return;
    }

    if (!currentChallenge) {
      await nextChallenge({ waitForBusy: true });
    }
    return;
  }

  if (type === "director") {
    stopDanmakuLoop("已切换到导演");
    stopValidation("验收已暂停");
    directorStatus.textContent = latestDirector ? "已生成" : "可生成";
    if (!stream) {
      directorOpening.textContent = "请先开启摄像头，导演模式会结合当前画面、弹幕和挑战导出短视频。";
    }
  }
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    modelBadge.textContent = data.hasApiKey ? data.model : "请配置 API Key";
  } catch {
    modelBadge.textContent = "后端未连接";
  }
}

async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "environment"
    },
    audio: false
  });
  camera.srcObject = stream;
  startBtn.textContent = "摄像头已开启";
  startBtn.disabled = true;
  danmakuToggleBtn.disabled = false;
  danmakuOnceBtn.disabled = false;
  validateBtn.disabled = false;
  skipChallengeBtn.disabled = false;
  directorPlanBtn.disabled = false;
  searchBgmBtn.disabled = false;
  exportVideoBtn.disabled = false;
  setStatus("预览中", true);
}

function captureFrame(quality = 0.62, width = 768) {
  const height = Math.round(width * (camera.videoHeight || 720) / (camera.videoWidth || 1280));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(camera, 0, 0, width, height);
  ctx.restore();
  return canvas.toDataURL("image/jpeg", quality);
}

function addDanmaku(text, hot = false) {
  const item = document.createElement("div");
  item.className = `danmaku${hot ? " hot" : ""}`;
  item.textContent = text;
  const lanes = Math.max(5, Math.floor(danmakuLayer.clientHeight / 42));
  track = (track + 1) % lanes;
  item.style.top = `${track * 42 + Math.random() * 8}px`;
  item.style.animationDuration = `${scaleDanmakuDuration(6 + Math.random() * 3)}s`;
  danmakuLayer.appendChild(item);
  item.addEventListener("animationend", () => item.remove());
}

function throwLines(lines, fast = false) {
  lines.forEach((line, index) => {
    window.setTimeout(() => addDanmaku(line, index === 0), fast ? index * 120 : index * 260);
  });
}

function showChallengeSuccess(score) {
  document.querySelector(".challenge-celebration")?.remove();
  stage?.classList.remove("challenge-success-pulse");
  challengeScore?.classList.remove("score-success-pop");
  void stage?.offsetWidth;
  stage?.classList.add("challenge-success-pulse");
  challengeScore?.classList.add("score-success-pop");

  const effect = document.createElement("div");
  effect.className = "challenge-celebration";

  const card = document.createElement("div");
  card.className = "celebration-card";
  card.innerHTML = `<strong>挑战达标</strong><span>${score} 分，进入下一题</span>`;
  effect.appendChild(card);

  for (let index = 0; index < 24; index += 1) {
    const particle = document.createElement("i");
    const angle = (Math.PI * 2 * index) / 24;
    const distance = 120 + Math.random() * 90;
    particle.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
    particle.style.setProperty("--delay", `${Math.random() * 120}ms`);
    effect.appendChild(particle);
  }

  document.body.appendChild(effect);
  window.setTimeout(() => {
    effect.remove();
    stage?.classList.remove("challenge-success-pulse");
    challengeScore?.classList.remove("score-success-pop");
  }, 2600);
}

function addDanmakuList(lines) {
  for (const line of lines) {
    recentDanmaku.unshift(line);
    const item = document.createElement("li");
    item.className = "chat-item";

    const avatar = document.createElement("span");
    avatar.className = "chat-avatar";
    const name = commenterNames[(recentDanmaku.length + line.length) % commenterNames.length];
    avatar.textContent = name.slice(0, 1);

    const body = document.createElement("span");
    body.className = "chat-body";

    const meta = document.createElement("span");
    meta.className = "chat-meta";
    meta.textContent = `${name} · 刚刚`;

    const text = document.createElement("span");
    text.className = "chat-text";
    text.textContent = line;

    body.append(meta, text);
    item.append(avatar, body);
    danmakuList.prepend(item);
  }
  recentDanmaku = recentDanmaku.slice(0, 20);
  while (danmakuList.children.length > 20) {
    danmakuList.lastElementChild.remove();
  }
}

function challengeText() {
  if (!currentChallenge) return "";
  return `${currentChallenge.name}: ${currentChallenge.description}; 验收标准：${currentChallenge.success_criteria}`;
}

function challengeSignature(challenge) {
  if (!challenge) return "";
  return `${challenge.name || ""} ${challenge.description || ""}`.replace(/\s+/g, "");
}

function normalizeChallengeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、:：；;,.!?]/g, "");
}

function challengeFamily(value) {
  const text = normalizeChallengeText(value);
  const families = [
    ["头顶", "头上", "头部", "摸头", "手放头", "举到头", "放到头"],
    ["ok", "OK", "比个ok", "ok手势"],
    ["拇指", "点赞", "竖大拇指"],
    ["指向", "手指", "指一指"],
    ["手掌", "张开手", "五指", "挥手"],
    ["靠近", "贴近", "凑近"],
    ["遮住", "遮挡", "盖住镜头"],
    ["拿起", "举起", "拿到镜头", "举到镜头"]
  ];
  return families.findIndex((words) => words.some((word) => text.includes(normalizeChallengeText(word))));
}

function isSimilarChallenge(challenge) {
  const nextText = normalizeChallengeText(challengeSignature(challenge));
  if (!nextText) return true;

  const nextFamily = challengeFamily(nextText);
  const history = [...recentChallengeHistory, lastSkippedChallenge].filter(Boolean);
  return history.some((item) => {
    const oldText = normalizeChallengeText(item);
    if (!oldText) return false;
    if (nextText === oldText || oldText.includes(nextText) || nextText.includes(oldText)) return true;
    const oldFamily = challengeFamily(oldText);
    return nextFamily >= 0 && nextFamily === oldFamily;
  });
}

function pickBackupChallenge() {
  for (let offset = 0; offset < backupChallenges.length; offset += 1) {
    const index = (backupChallengeCursor + offset) % backupChallenges.length;
    const candidate = backupChallenges[index];
    if (!isSimilarChallenge(candidate)) {
      backupChallengeCursor = (index + 1) % backupChallenges.length;
      return { ...candidate };
    }
  }
  const fallback = backupChallenges[backupChallengeCursor % backupChallenges.length];
  backupChallengeCursor = (backupChallengeCursor + 1) % backupChallenges.length;
  return { ...fallback };
}

function rememberChallenge(challenge) {
  const text = challengeSignature(challenge);
  if (!text) return;
  recentChallengeHistory = [text, ...recentChallengeHistory.filter((item) => item !== text)].slice(0, 6);
}

function ensureDifferentChallenge(data) {
  if (!data?.challenge) return data;
  if (!isSimilarChallenge(data.challenge)) {
    return data;
  }

  data.challenge = pickBackupChallenge();
  data.title = data.title || "换个玩法";
  data.hook = "这题换个动作来玩";
  return data;
}

async function analyzeFrame({ mode, validationChallenge = "" }) {
  if (!stream || camera.readyState < 2) {
    throw new Error("请先开启摄像头");
  }

  const image = captureFrame();
  latestSnapshot = captureFrame(0.45, 360);
  const sceneContext = [
    confirmedSceneContext,
    currentChallenge ? `当前挑战：${challengeText()}` : "",
    mode === "challenge" && !validationChallenge && recentChallengeHistory.length
      ? `最近已经用过的挑战动作：${recentChallengeHistory.slice(0, 5).join(" / ")}。请尽量避开这些动作和相似动作，不要连续重复头顶、举手到头、摸头这类动作。`
      : "",
    mode === "challenge" && !validationChallenge && lastSkippedChallenge
      ? `刚刚跳过的挑战：${lastSkippedChallenge}。请生成一个动作明显不同的新挑战，但仍然只能包含一个单一动作。`
      : "",
    recentDanmaku.length ? `最近弹幕：${recentDanmaku.slice(0, 6).join(" / ")}` : ""
  ].filter(Boolean).join("\n");

  const res = await fetch("/api/analyze-frame", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image,
      mode,
      density: Number(densityRange.value),
      sceneContext,
      validationChallenge
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "AI 分析失败");
  }
  return data;
}

function renderStage(data) {
  aiTitle.textContent = data.title || "实时弹幕生成中";
  aiHook.textContent = data.hook || "AI 正在抓现场重点";
  setHeat(data.heat || Math.round((data.confidence || 0.7) * 88));
}

async function generateDanmakuOnce() {
  if (busy) return;
  const request = danmakuRequestLimiter.tryRun(() => analyzeFrame({ mode: "danmaku" }));
  if (!request) return;
  setStatus("生成弹幕中", true);
  try {
    const data = await request;
    renderStage(data);
    const lines = Array.isArray(data.danmaku) && data.danmaku.length ? data.danmaku : fallbackLines;
    addDanmakuList(lines);
    throwLines(lines);
    setStatus("弹幕已更新", true);
  } catch (error) {
    setStatus("等待重试", false);
    addDanmaku(error.message, true);
  }
}

function toggleDanmaku() {
  danmakuRunning = !danmakuRunning;
  danmakuToggleBtn.textContent = danmakuRunning ? "停止弹幕" : "开始弹幕";
  if (!danmakuRunning) {
    clearInterval(danmakuTimer);
    danmakuTimer = null;
    setStatus("弹幕已暂停", false);
    return;
  }

  generateDanmakuOnce();
  danmakuTimer = setInterval(generateDanmakuOnce, Number(intervalRange.value));
}

function renderChallenge(data, resetBest = true) {
  currentChallenge = data.challenge;
  rememberChallenge(currentChallenge);
  challengeName.textContent = currentChallenge.name;
  challengeDescription.textContent = currentChallenge.description;
  challengeCriteria.textContent = `验收标准：${currentChallenge.success_criteria}`;
  challengeDuration.textContent = currentChallenge.duration || "15秒";
  challengeScore.textContent = "当前分数 0";
  challengeResult.textContent = "开始验收后，AI 只判断这一个动作是否完成。";
  if (resetBest) {
    bestChallenge = { score: 0, snapshot: "", result: "" };
    bestScore.textContent = "0分";
    bestFrameImg.removeAttribute("src");
  }
}

async function nextChallenge({ waitForBusy = false } = {}) {
  if (busy || danmakuRequestLimiter.active > 0) {
    if (!waitForBusy) return false;
    const idle = await waitForIdle();
    if (!idle) return false;
  }
  busy = true;
  setStatus("生成挑战中", true);
  try {
    const data = ensureDifferentChallenge(await analyzeFrame({ mode: "challenge" }));
    renderStage(data);
    renderChallenge(data);
    lastSkippedChallenge = "";
    setStatus("新挑战已生成", true);
    return true;
  } catch (error) {
    setStatus("挑战生成失败", false);
    challengeResult.textContent = error.message;
    return false;
  } finally {
    busy = false;
  }
}

async function validateChallengeFrame() {
  if (busy || danmakuRequestLimiter.active > 0 || !currentChallenge) return;
  busy = true;
  setStatus("AI 验收中", true);
  try {
    const data = await analyzeFrame({ mode: "challenge", validationChallenge: challengeText() });
    renderStage(data);
    const score = Math.round(Number(data.challenge?.score || data.heat || 0));
    challengeScore.textContent = `当前分数 ${score}`;
    challengeResult.textContent = data.challenge?.result || "AI 正在判断动作完成度。";

    if (score > bestChallenge.score) {
      bestChallenge = { score, snapshot: latestSnapshot, result: challengeResult.textContent };
      bestScore.textContent = `${score}分`;
      bestFrameImg.src = latestSnapshot;
    }

    if (score >= 80) {
      stopValidation("挑战达标，自动进入下一个");
      addDanmaku(`挑战达标：${score}分`, true);
      showChallengeSuccess(score);
      currentChallenge = null;
      challengeName.textContent = "挑战达标，正在生成下一题...";
      challengeDescription.textContent = "AI 已判定通过，下一题仍然只会要求一个动作。";
      challengeCriteria.textContent = "验收标准：等待 AI 生成。";
      challengeDuration.textContent = "生成中";
      challengeResult.textContent = `恭喜通过，得分 ${score}。正在进入下一个挑战。`;
      window.setTimeout(() => nextChallenge({ waitForBusy: true }), 900);
    }
  } catch (error) {
    challengeResult.textContent = error.message;
    setStatus("验收失败", false);
  } finally {
    busy = false;
  }
}

async function startValidation() {
  if (!currentChallenge) {
    await nextChallenge({ waitForBusy: true });
  }
  if (!currentChallenge) return;

  validating = !validating;
  validateBtn.textContent = validating ? "停止验收" : "AI 验收挑战";
  if (!validating) {
    stopValidation("验收已暂停");
    return;
  }

  validateChallengeFrame();
  challengeTimer = setInterval(validateChallengeFrame, CHALLENGE_INTERVAL_MS);
}

function stopValidation(statusText = "验收已停止") {
  validating = false;
  validateBtn.textContent = "AI 验收挑战";
  clearInterval(challengeTimer);
  challengeTimer = null;
  setStatus(statusText, statusText.includes("达标"));
}

function renderDirector(data) {
  latestDirector = data.director;
  directorStatus.textContent = "已生成";
  directorOpening.textContent = `开头：${latestDirector.opening}`;
  directorShot.textContent = `镜头：${latestDirector.shot}`;
  directorSubtitle.textContent = `字幕：${latestDirector.subtitle}`;
  directorEnding.textContent = `结尾：${latestDirector.ending}`;
  directorMaterial.textContent = `素材：${recentDanmaku.slice(0, 4).join(" / ") || "暂无弹幕"}；挑战：${currentChallenge?.name || "暂无挑战"}`;
}

function buildBgmContextText() {
  return [
    confirmedSceneContext ? `用户确认场景：${confirmedSceneContext}` : "",
    recentDanmaku.length ? `最近弹幕：${recentDanmaku.slice(0, 8).join(" / ")}` : "",
    currentChallenge ? `当前挑战：${challengeText()}` : "",
    latestDirector
      ? `导演方案：${latestDirector.cover_title} / ${latestDirector.opening} / ${latestDirector.shot} / ${latestDirector.subtitle}`
      : ""
  ].filter(Boolean).join("\n");
}

function selectBgm(candidate) {
  selectedBgm = candidate;
  selectedBgmText.textContent = `已选：${candidate.title}${candidate.artist ? ` - ${candidate.artist}` : ""}`;
  [...bgmList.querySelectorAll(".bgm-option")].forEach((item) => {
    item.classList.toggle("active", item.dataset.bgmKey === String(candidate.id || `${candidate.title}-${candidate.artist}`));
  });
}

function renderBgmCandidates(data) {
  bgmCandidates = Array.isArray(data.candidates) ? data.candidates : [];
  bgmList.replaceChildren();
  bgmStatus.textContent = bgmCandidates.length ? `${bgmCandidates.length} 首候选` : "无结果";

  if (data.mood || data.reason) {
    selectedBgmText.textContent = `${data.mood || "短视频BGM"}：${data.reason || "已根据当前画面生成搜索词"}`;
  }

  if (!bgmCandidates.length) {
    const empty = document.createElement("p");
    empty.className = "bgm-empty";
    empty.textContent = "暂时没有搜到候选，可以换个画面或先生成导演方案再搜。";
    bgmList.appendChild(empty);
    return;
  }

  bgmCandidates.forEach((candidate, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "bgm-option";
    item.dataset.bgmKey = String(candidate.id || `${candidate.title}-${candidate.artist}`);

    const rank = document.createElement("span");
    rank.className = "bgm-rank";
    rank.textContent = String(index + 1).padStart(2, "0");

    const body = document.createElement("span");
    body.className = "bgm-body";

    const title = document.createElement("strong");
    title.textContent = candidate.title || candidate.query || "BGM 候选";

    const meta = document.createElement("span");
    meta.textContent = [
      candidate.artist,
      candidate.duration,
      candidate.query ? `来自：${candidate.query}` : ""
    ].filter(Boolean).join(" · ");

    const link = document.createElement("a");
    link.className = "bgm-link";
    link.href = candidate.sourceUrl || candidate.searchUrl || "#";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "打开";
    link.addEventListener("click", (event) => event.stopPropagation());

    body.append(title, meta);
    item.append(rank, body, link);
    item.addEventListener("click", () => selectBgm(candidate));
    bgmList.appendChild(item);
  });

  selectBgm(bgmCandidates[0]);
}

async function searchBgmForScene() {
  if (busy || danmakuRequestLimiter.active > 0) {
    const idle = await waitForIdle();
    if (!idle) return;
  }
  if (busy) return;
  busy = true;
  const ready = await ensureCameraReady();
  if (!ready) {
    busy = false;
    return;
  }

  searchBgmBtn.disabled = true;
  bgmStatus.textContent = "搜索中";
  selectedBgmText.textContent = "正在根据当前画面分析氛围，并联网搜索候选热歌...";
  setStatus("联网匹配 BGM", true);

  try {
    const res = await fetch("/api/search-bgm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: captureFrame(0.62, 768),
        sceneContext: buildBgmContextText(),
        title: aiTitle.textContent,
        hook: aiHook.textContent,
        directorText: latestDirector
          ? `${latestDirector.opening} ${latestDirector.shot} ${latestDirector.subtitle} ${latestDirector.ending}`
          : "",
        challengeText: currentChallenge ? challengeText() : ""
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "BGM 搜索失败");
    renderBgmCandidates(data);
    setStatus("BGM 候选已更新", true);
  } catch (error) {
    bgmStatus.textContent = "搜索失败";
    selectedBgmText.textContent = error.message || "BGM 搜索失败，请稍后重试。";
    setStatus("BGM 搜索失败", false);
  } finally {
    busy = false;
    searchBgmBtn.disabled = false;
  }
}

function createBgmWavUrl(duration = 10) {
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * duration);
  const bytesPerSample = 2;
  const dataSize = samples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const beat = 60 / 126;
  const notes = [261.63, 329.63, 392.0, 493.88, 440.0, 392.0, 329.63, 392.0];

  function writeString(offset, text) {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < samples; index += 1) {
    const t = index / sampleRate;
    const step = Math.floor(t / (beat / 2));
    const stepPos = t % (beat / 2);
    const beatPos = t % beat;
    const note = notes[Math.floor(t / beat) % notes.length];
    const melodyEnv = Math.exp(-stepPos * 5.2);
    const melody = Math.sin(2 * Math.PI * note * t) * 0.16 * melodyEnv;
    const bass = Math.sin(2 * Math.PI * (note / 2) * t) * 0.08 * Math.exp(-(t % beat) * 2.2);
    const kick = step % 4 === 0 && beatPos < 0.18
      ? Math.sin(2 * Math.PI * (88 - beatPos * 230) * t) * 0.42 * Math.exp(-beatPos * 24)
      : 0;
    const hat = stepPos < 0.045
      ? (Math.sin(2 * Math.PI * 7200 * t) + Math.sin(2 * Math.PI * 9300 * t)) * 0.035 * Math.exp(-stepPos * 72)
      : 0;
    const sample = Math.max(-1, Math.min(1, melody + bass + kick + hat));
    view.setInt16(44 + index * bytesPerSample, sample * 0x7fff, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

async function createExportBgm(duration = 10) {
  const audio = new Audio();
  const captureStream = audio.captureStream || audio.mozCaptureStream;
  if (captureStream) {
    const url = createBgmWavUrl(duration);
    audio.src = url;
    audio.preload = "auto";
    audio.volume = 0.82;

    await new Promise((resolve) => {
      const done = () => resolve();
      audio.addEventListener("canplaythrough", done, { once: true });
      audio.addEventListener("loadeddata", done, { once: true });
      window.setTimeout(done, 450);
    });

    const mediaStream = captureStream.call(audio);
    return {
      stream: mediaStream,
      play: async () => {
        audio.currentTime = 0;
        await audio.play();
      },
      close: () => {
        audio.pause();
        mediaStream.getTracks().forEach((track) => track.stop());
        URL.revokeObjectURL(url);
      }
    };
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  const audioContext = new AudioContextClass();
  await audioContext.resume();

  const destination = audioContext.createMediaStreamDestination();
  const master = audioContext.createGain();
  master.gain.setValueAtTime(0.13, audioContext.currentTime);
  master.connect(destination);

  const startAt = audioContext.currentTime + 0.04;
  const beat = 60 / 126;
  const notes = [261.63, 329.63, 392.0, 493.88, 440.0, 392.0, 329.63, 392.0];

  function scheduleTone(time, frequency, length, type = "triangle", volume = 0.14) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(time);
    oscillator.stop(time + length + 0.03);
  }

  function scheduleKick(time) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(94, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.16);
    gain.gain.setValueAtTime(0.36, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(time);
    oscillator.stop(time + 0.2);
  }

  function scheduleHat(time) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(7800, time);
    gain.gain.setValueAtTime(0.045, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(time);
    oscillator.stop(time + 0.05);
  }

  for (let step = 0; step < Math.ceil(duration / (beat / 2)); step += 1) {
    const time = startAt + step * (beat / 2);
    if (time > startAt + duration) break;
    scheduleHat(time);
    if (step % 4 === 0) scheduleKick(time);
    if (step % 2 === 0) {
      const note = notes[(step / 2) % notes.length];
      scheduleTone(time, note, beat * 0.72, "triangle", 0.08);
      scheduleTone(time, note / 2, beat * 0.92, "sine", 0.055);
    }
  }

  master.gain.setValueAtTime(0.13, startAt + duration - 0.45);
  master.gain.linearRampToValueAtTime(0.0001, startAt + duration);

  return {
    stream: destination.stream,
    play: async () => {},
    close: () => {
      try {
        destination.stream.getTracks().forEach((track) => track.stop());
        audioContext.close();
      } catch {
        // AudioContext may already be closed by the browser.
      }
    }
  };
}

async function generateDirectorPlan() {
  if (busy || danmakuRequestLimiter.active > 0) {
    const idle = await waitForIdle();
    if (!idle) return;
  }
  if (busy) return;
  busy = true;
  setStatus("生成导演方案", true);
  try {
    const data = await analyzeFrame({ mode: "director" });
    renderStage(data);
    renderDirector(data);
    setStatus("导演方案已生成", true);
  } catch (error) {
    directorStatus.textContent = "生成失败";
    directorOpening.textContent = error.message;
    setStatus("导演生成失败", false);
  } finally {
    busy = false;
  }
}

async function exportShortVideo() {
  if (!stream || camera.readyState < 2) {
    alert("请先开启摄像头");
    return;
  }
  if (!latestDirector) {
    await generateDirectorPlan();
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 1080;
  exportCanvas.height = 1920;
  const ctx = exportCanvas.getContext("2d");
  const exportStream = exportCanvas.captureStream(30);
  const bgm = await createExportBgm(10);
  bgm?.stream.getAudioTracks().forEach((track) => exportStream.addTrack(track));
  const chunks = [];
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
  const recorder = new MediaRecorder(exportStream, { mimeType });
  const lines = recentDanmaku.length ? recentDanmaku.slice(0, 8) : fallbackLines;
  const director = latestDirector || {
    cover_title: aiTitle.textContent,
    opening: aiHook.textContent,
    subtitle: "现实自动长出弹幕",
    ending: "评论区说说你会怎么拍"
  };
  const challenge = currentChallenge;
  const bgmLabel = selectedBgm
    ? `${selectedBgm.title}${selectedBgm.artist ? ` - ${selectedBgm.artist}` : ""}`
    : "AI 原创卡点节拍";
  const startedAt = performance.now();

  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `real-world-danmaku-${Date.now()}.webm`;
    link.click();
    URL.revokeObjectURL(url);
    bgm?.close();
    setStatus(bgm ? "短视频+BGM已导出" : "短视频已导出", true);
  };

  function draw() {
    const elapsed = performance.now() - startedAt;
    ctx.fillStyle = "#05070b";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const videoRatio = camera.videoWidth / camera.videoHeight || 16 / 9;
    const targetW = exportCanvas.width;
    const targetH = Math.round(targetW / videoRatio);
    const videoY = 260;
    ctx.save();
    ctx.translate(exportCanvas.width, videoY);
    ctx.scale(-1, 1);
    ctx.drawImage(camera, 0, 0, targetW, targetH);
    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(0, 0, exportCanvas.width, 260);
    ctx.fillRect(0, videoY + targetH, exportCanvas.width, exportCanvas.height - videoY - targetH);

    ctx.fillStyle = "#fff";
    ctx.font = "800 66px Microsoft YaHei, sans-serif";
    wrapText(ctx, director.cover_title || aiTitle.textContent, 56, 92, 960, 74, 2);
    ctx.font = "600 34px Microsoft YaHei, sans-serif";
    ctx.fillStyle = "#ffd86b";
    wrapText(ctx, director.opening || aiHook.textContent, 56, 214, 960, 42, 1);

    lines.forEach((line, index) => {
      const y = videoY + 92 + index * 88;
      const x = exportCanvas.width - ((elapsed * (0.18 + index * 0.01) + index * 210) % (exportCanvas.width + 760));
      ctx.font = "800 42px Microsoft YaHei, sans-serif";
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#000";
      ctx.strokeText(line, x, y);
      ctx.fillStyle = index % 3 === 0 ? "#ffe56e" : "#fff";
      ctx.fillText(line, x, y);
    });

    const bottomY = 1420;
    ctx.fillStyle = "rgba(23,27,36,0.92)";
    roundRect(ctx, 56, bottomY, 968, 360, 24);
    ctx.fill();
    ctx.fillStyle = "#13d6a6";
    ctx.font = "800 38px Microsoft YaHei, sans-serif";
    ctx.fillText(challenge ? `挑战：${challenge.name}` : "导演建议", 92, bottomY + 70);
    ctx.fillStyle = "#fff";
    ctx.font = "500 34px Microsoft YaHei, sans-serif";
    wrapText(ctx, challenge?.description || director.shot || "镜头靠近主体，慢慢推近，留一个反转停顿。", 92, bottomY + 130, 900, 46, 3);
    ctx.fillStyle = "#ffd86b";
    ctx.font = "700 28px Microsoft YaHei, sans-serif";
    wrapText(ctx, `BGM：${bgmLabel}`, 92, bottomY + 268, 900, 34, 1);
    ctx.fillStyle = "#ff3d71";
    ctx.font = "800 42px Microsoft YaHei, sans-serif";
    wrapText(ctx, director.ending || "评论区说说你会怎么拍", 92, bottomY + 322, 900, 50, 1);

    if (elapsed < 10000) {
      requestAnimationFrame(draw);
    } else if (recorder.state === "recording") {
      recorder.stop();
    }
  }

  setStatus(bgm ? "正在导出短视频+BGM" : "正在导出短视频", true);
  recorder.start();
  try {
    await bgm?.play?.();
  } catch {
    setStatus("BGM启动失败，继续导出视频", false);
  }
  draw();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const chars = String(text || "").split("");
  let line = "";
  let lines = 0;
  for (const char of chars) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = char;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function clearStage() {
  danmakuLayer.replaceChildren();
  danmakuList.replaceChildren();
  recentDanmaku = [];
  currentChallenge = null;
  lastSkippedChallenge = "";
  recentChallengeHistory = [];
  bestChallenge = { score: 0, snapshot: "", result: "" };
  bestFrameImg.removeAttribute("src");
  bestScore.textContent = "0分";
  challengeScore.textContent = "当前分数 0";
  challengeResult.textContent = "还没有开始验收。";
  aiTitle.textContent = "现实世界弹幕 AI";
  aiHook.textContent = "选择右侧类型，让镜头进入不同玩法。";
  selectedBgm = null;
  bgmCandidates = [];
  bgmList.replaceChildren();
  bgmStatus.textContent = "待搜索";
  selectedBgmText.textContent = "会根据当前画面联网搜索适合的抖音热歌候选，选中后会写入导出视频标签。";
  setHeat(0);
}

intervalRange.addEventListener("input", () => {
  updateControls();
  if (danmakuRunning) {
    clearInterval(danmakuTimer);
    danmakuTimer = setInterval(generateDanmakuOnce, Number(intervalRange.value));
  }
});

densityRange.addEventListener("input", updateControls);
sceneInput.addEventListener("input", markSceneDraftChanged);
sceneConfirmBtn.addEventListener("click", confirmSceneContext);
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : event.target.parentElement;
  const tab = target?.closest(".type-tab");
  if (tab) {
    setActiveType(tab.dataset.type);
  }
});
startBtn.addEventListener("click", () => startCamera().catch((error) => {
  setStatus("摄像头失败", false);
  aiTitle.textContent = error.message;
}));
clearBtn.addEventListener("click", clearStage);
danmakuToggleBtn.addEventListener("click", toggleDanmaku);
danmakuOnceBtn.addEventListener("click", generateDanmakuOnce);
validateBtn.addEventListener("click", startValidation);
skipChallengeBtn.addEventListener("click", () => {
  lastSkippedChallenge = challengeText();
  currentChallenge = null;
  challengeName.textContent = "正在换一个新挑战...";
  challengeDescription.textContent = "这次会避开刚刚跳过的动作，重新生成一个单动作任务。";
  challengeCriteria.textContent = "验收标准：等待 AI 生成。";
  challengeDuration.textContent = "生成中";
  challengeScore.textContent = "当前分数 0";
  challengeResult.textContent = "已跳过上一题，正在准备新挑战。";
  bestChallenge = { score: 0, snapshot: "", result: "" };
  bestScore.textContent = "0分";
  bestFrameImg.removeAttribute("src");
  stopValidation("已跳过挑战");
  stopDanmakuLoop("已切换到挑战");
  nextChallenge({ waitForBusy: true });
});
directorPlanBtn.addEventListener("click", generateDirectorPlan);
searchBgmBtn.addEventListener("click", searchBgmForScene);
exportVideoBtn.addEventListener("click", exportShortVideo);

danmakuToggleBtn.disabled = true;
danmakuOnceBtn.disabled = true;
validateBtn.disabled = true;
skipChallengeBtn.disabled = true;
directorPlanBtn.disabled = true;
searchBgmBtn.disabled = true;
exportVideoBtn.disabled = true;
updateControls();
setHeat(0);
checkHealth();
