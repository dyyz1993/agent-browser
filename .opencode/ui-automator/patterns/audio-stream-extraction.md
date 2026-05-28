# 音频流拦截提取模式

> 最后更新：2026-05-15 | 来源：豆包音乐生成实测

## 摘要
从豆包等 Web 应用中提取音频文件的模式。适用于不提供直接下载按钮、使用 MSE/Audio 元素播放的场景。

## 适用场景
- 网站播放音频但不提供下载按钮
- 音频通过 MediaSource Extension (MSE) 流式传输
- 音频 URL 有签名/过期时间，不能直接抓取

## 方案对比

| 方案 | 复杂度 | 成功率 | 适用场景 |
|------|--------|--------|----------|
| 方案A: `<audio>` src 提取 | 低 | 高 | 音频通过 `<audio>` 标签播放 |
| 方案B: 网络请求拦截 | 中 | 高 | 可从 Network 面板看到音频 URL |
| 方案C: MSE 数据块拦截 | 高 | 中 | 音频通过 MediaSource API 播放 |
| 方案D: Web Audio API 录制 | 中 | 中 | 所有场景（需播放一遍） |

## 方案A: `<audio>` src 提取

```javascript
// CDP 方式获取 audio 元素 src
const audioUrl = await page.evaluate(() => {
  const audio = document.querySelector('audio');
  if (audio) {
    return audio.src || audio.querySelector('source')?.src;
  }
  // 检查所有 source 元素
  const sources = document.querySelectorAll('source');
  for (const s of sources) {
    if (s.type?.includes('audio') || s.src?.includes('audio')) {
      return s.src;
    }
  }
  return null;
});
```

## 方案B: 网络请求拦截

```javascript
// 使用 CDP Network.requestWillBeSent 拦截
const client = await page.context().newCDPSession(page);
let audioUrl = null;

client.on('Network.requestWillBeSent', (params) => {
  const url = params.request.url;
  if (url.includes('audio') || url.includes('music') || url.includes('media')) {
    if (params.request.url.match(/\.(mp3|m4a|wav|ogg)/)) {
      audioUrl = url;
    }
  }
});

// 或拦截响应
client.on('Network.responseReceived', (params) => {
  const headers = params.response.headers;
  const contentType = headers['content-type'] || '';
  if (contentType.includes('audio/')) {
    audioUrl = params.response.url;
  }
});
```

## 方案C: MSE 数据块拦截（豆包实际使用）

豆包音乐通过 MSE (MediaSource Extension) 播放，不能直接获取 URL。
需要拦截 `SourceBuffer.appendBuffer()` 调用，收集数据块后合并。

```javascript
// 在页面加载前注入拦截代码
await page.evaluateOnNewDocument(() => {
  window.__mseChunks = [];
  const origAppend = SourceBuffer.prototype.appendBuffer;
  SourceBuffer.prototype.appendBuffer = function(data) {
    window.__mseChunks.push(new Uint8Array(data));
    return origAppend.call(this, data);
  };
});

// 播放完毕后提取数据
const pcmData = await page.evaluate(() => {
  // 合并所有 chunk
  const total = window.__mseChunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of window.__mseChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  // 转为 base64 传回 Node.js
  let binary = '';
  for (let i = 0; i < merged.length; i++) {
    binary += String.fromCharCode(merged[i]);
  }
  return btoa(binary);
});
```

### 豆包实测数据

```
raw.pcm: 1,199,264 bytes (从 MSE 拦截的原始数据)
rms.txt: 270,342 bytes (RMS 音量分析数据)
audio.b64: 2,432,773 bytes (Base64 编码)
最终输出: 深夜编译者.m4a (1,824,578 bytes)
```

### PCM → M4A 转换

```bash
# PCM 原始数据需要通过 FFmpeg 转换
# 采样率需要校准（豆包使用 44100Hz 或 48000Hz）
ffmpeg -f s16le -ar 44100 -ac 2 -i raw.pcm -c:a aac -b:a 128k output.m4a
```

## 方案D: Web Audio API 录制

```javascript
// 注入录制脚本
await page.evaluateOnNewDocument(() => {
  window.__audioRecorder = null;
  const origCreateMediaElementSource = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function(audioElement) {
    const source = origCreateMediaElementSource.call(this, audioElement);
    const dest = this.createMediaStreamDestination();
    source.connect(dest);
    window.__audioRecorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
    window.__audioChunks = [];
    window.__audioRecorder.ondataavailable = (e) => {
      window.__audioChunks.push(e.data);
    };
    window.__audioRecorder.start();
    return source;
  };
});
```

## 豆包音乐提取的实际方案

经过多轮尝试（v1→v3），最终使用的方案是**方案C (MSE 拦截) + RMS 校准**：

1. 在页面加载前注入 MSE 拦截器
2. 触发音乐播放
3. 等待播放完成，收集所有 chunk
4. 通过 base64 传回 Node.js 环境
5. 使用 `extract-audio-v3.mjs` 将 PCM 转为 M4A

相关脚本存储在 `/private/tmp/doubao-music/`：
- `extract-audio.mjs` → v1 基础拦截
- `extract-audio-v2.mjs` → v2 改进校准
- `extract-audio-v3.mjs` → v3 最终版本
- `calibrate.html` + `fix-calibrate.js` → 采样率校准工具

## 可沉淀为插件的点

1. **通用 MSE 音频拦截器**: 注入 → 播放 → 提取 → 转换，可封装为 `agent-browser extract-audio` 命令
2. **音频 RMS 分析器**: 分析 PCM 数据的音量曲线，用于检测静音段、计算精确时长
3. **PCM→M4A 转换器**: 自动检测采样率并调用 FFmpeg 转换

## 变更记录
- 2026-05-15：初始创建（豆包音乐生成实测，3 个提取脚本迭代）
