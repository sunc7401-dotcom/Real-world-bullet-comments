# Real World Danmaku AI

摄像头看到什么，AI 就实时生成抖音式标题和弹幕。

## 功能

- 浏览器摄像头实时预览
- 定时截取当前画面
- 后端代理调用视觉模型 API
- 兼容 OpenAI-style `/chat/completions` 中转平台
- 右侧分为三种互斥工作台：弹幕、挑战、导演
- 弹幕工作台：场景输入、弹幕间隔、弹幕密度、弹幕列表
- 挑战工作台：AI 生成动作挑战，按弹幕抽帧频率验收，记录最高分画面，80 分以上自动进入下一个挑战
- 导演工作台：结合最近弹幕和挑战生成短视频方案，联网搜索适合当前画面的 BGM 候选，并导出 10 秒 WebM 竖屏短视频
- BGM 匹配：先让视觉模型判断画面氛围并生成搜索词，再通过音乐平台搜索候选歌名；选中后会写入导出视频标签

## 安装

```bash
npm install
copy .env.example .env
```

把 `.env` 里的配置改成你的中转平台信息：

```env
OPENAI_API_KEY=你的 NeoLink Key
OPENAI_BASE_URL=https://neolink.vnet.com/api/v1
OPENAI_MODEL=支持视觉输入的模型名
PORT=3000
```

注意：`OPENAI_BASE_URL` 填到 `/v1` 这一层，不要包含 `/chat/completions`。后端会自动拼成：

```text
${OPENAI_BASE_URL}/chat/completions
```

如果 NeoLink 文档给出的完整接口是：

```text
https://neolink.vnet.com/xxx/v1/chat/completions
```

那 `.env` 就应该写：

```env
OPENAI_BASE_URL=https://neolink.vnet.com/xxx/v1
```

如果文档直接给了完整接口，也可以跳过自动拼接，直接使用：

```env
OPENAI_CHAT_COMPLETIONS_URL=https://neolink.vnet.com/xxx/v1/chat/completions
```

## 运行

```bash
npm start
```

打开：

```text
http://localhost:3000
```

## 提示

- Chrome / Edge 在 `localhost` 下可以直接使用摄像头。
- 必须选择支持图片输入的视觉模型，否则接口会报错。
- NeoLink 上已测试 `gpt-5.4` 可以返回图片分析 JSON；`ge-3-pr-im-p` 会返回空文本，不适合这个项目。
- 分析间隔最低可调到 `300ms`，但前端不会并发堆请求；如果模型响应需要 2 秒，实际弹幕刷新也会接近 2 秒。
- 如果 API 慢，调大分析间隔或降低 JPEG 质量。
- 后端会自动把非 JSON 输出兜底成普通弹幕，避免 Demo 中断。
- BGM 功能只自动搜索和推荐歌名/链接，不自动下载平台音频；导出视频中的音轨使用项目内生成的节拍，避免版权和外部音频接口不稳定。
