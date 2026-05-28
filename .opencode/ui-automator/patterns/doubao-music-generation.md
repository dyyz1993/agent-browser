# 豆包音乐生成自动化模式

> 最后更新：2026-05-15 | 来源：v0.30.0 实测验证

## 摘要
豆包 AI 音乐生成的完整自动化流程，从选择曲风到获取音频文件。

## 前提条件
- CDP 9221 已连接（需登录态）
- 已在 `/chat` 页面

## 完整流程

```
Step 1: 切换到音乐模式     clickByText("音乐生成")
Step 2: 选择曲风            clickByText("流行")
Step 3: 选择心情            clickByText("快乐")
Step 4: 选择声音            clickByText("男声") 或 clickByText("女声")
Step 5: 打开歌词选项        clickByText("AI 帮我写歌词")
Step 6: 选择自定义歌词      clickByText("自定义歌词")
Step 7: 填写歌词            agent-browser fill（不能用 eval！）
Step 8: 确认歌词            clickByText("确认")
Step 9: 输入生成指令        fill "生成歌曲" + Enter
Step 10: 等待生成           ~30s，新对话自动创建
Step 11: 提取音频           见 audio-stream-extraction.md
```

## 关键注意事项

### 1. 歌词输入必须用 fill，不能用 eval
```javascript
// ❌ 错误：不触发 React onChange，确认按钮保持禁用
await page.evaluate(() => {
  document.querySelector('textarea').value = '歌词内容';
});

// ✅ 正确：Playwright 原生输入
await page.fill('textarea', '歌词内容');
// 或
// agent-browser fill --selector textarea --text "歌词内容"
```

### 2. 生成歌曲需要先填文字再按 Enter
```javascript
// ❌ 错误：空 textarea + Enter 无效果
await page.press('textarea', 'Enter');

// ✅ 正确：先 fill 文字，再 Enter
await page.fill('textarea', '生成歌曲');
await page.press('textarea', 'Enter');
```

### 3. 生成会创建新对话
填入 "生成歌曲" + Enter 后，豆包会自动创建新对话（URL 变为 `/chat/{new_id}`）。
需要等待约 30 秒让歌曲生成完成。

### 4. 等待歌曲生成的检测方式
```javascript
// 等待音频播放器出现
await page.waitForSelector('audio', { timeout: 60000 });
// 或检测歌曲标题文本
await page.waitForSelector('text=/\\d{2}:\\d{2}/'); // 等待时长格式出现
```

## agent-browser CLI 完整示例

```bash
# 1. 连接
agent-browser connect 9221

# 2. 确保在豆包页面
agent-browser goto "https://www.doubao.com/chat" --cdp http://localhost:9221

# 3. 点击音乐生成
agent-browser click --text "音乐生成" --cdp http://localhost:9221

# 4. 选择选项（流行 + 快乐 + 男声）
agent-browser click --text "流行" --cdp http://localhost:9221
agent-browser click --text "快乐" --cdp http://localhost:9221
agent-browser click --text "男声" --cdp http://localhost:9221

# 5. 自定义歌词
agent-browser click --text "AI 帮我写歌词" --cdp http://localhost:9221
agent-browser click --text "自定义歌词" --cdp http://localhost:9221

# 6. 填写歌词（必须用 fill）
agent-browser fill --selector "textarea" --text "晨光穿透云层..." --cdp http://localhost:9221

# 7. 确认
agent-browser click --text "确认" --cdp http://localhost:9221

# 8. 生成
agent-browser fill --selector "textarea" --text "生成歌曲" --cdp http://localhost:9221
agent-browser press Enter --cdp http://localhost:9221

# 9. 等待（约 30s）
agent-browser wait 35000 --cdp http://localhost:9221

# 10. 截图确认
agent-browser screenshot --cdp http://localhost:9221
```

## 已验证的生成结果示例

| 歌曲 | 时长 | 日期 |
|------|------|------|
| 追光终成光芒 | 01:44 | 2026-05-15 |
| 深夜编译者 | ~01:30 | 2026-05-15 |
| 堵车快乐心情 | ~01:20 | 2026-05-15 |
| 香浓书韵之境 | ~01:30 | 2026-05-15 |
| 拥抱明日之光 | ~01:40 | 2026-05-13 |

音频文件存储在 `/private/tmp/doubao-music/`。

## 变更记录
- 2026-05-15：初始创建（v0.30.0 实测验证，完整流程通过）
