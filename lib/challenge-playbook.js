const POPULAR_CHALLENGE_MECHANICS = [
  "定格姿势",
  "视觉错位",
  "物体拟人",
  "身份反差",
  "无实物表演",
  "手势接梗",
  "表情反应",
  "构图模仿"
];

export function challengeModePrompt({ validating = false } = {}) {
  if (validating) {
    return "挑战验收类型：不要生成新挑战，只判断指定的单一动作是否在当前抽帧中清楚完成；严格按照 success_criteria 打分，抽象创意不等于放宽验收标准。";
  }

  return `挑战生成类型：结合当前图片和用户补充场景，优先利用可见物体、空间、人物姿势，并至少使用场景文本中的一个物体、角色或地点。参考抖音常见热门挑战机制：${POPULAR_CHALLENGE_MECHANICS.join("、")}。允许抽象、荒诞、反差和轻社死，但任务必须安全、低门槛、15秒内可完成。最终只能要求一个单一动作，必须能在一张抽帧中明确验收；创意可以抽象，success_criteria 必须具体可见。不得要求危险动作、破坏物品、骚扰他人、离开镜头、多步骤或连续过程。避开用户补充场景中列出的最近已用和刚跳过动作。`;
}

export { POPULAR_CHALLENGE_MECHANICS };
