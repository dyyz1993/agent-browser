# Checklist

- [x] CLI `agent-browser record start` 命令可以启动录制
- [x] CLI `agent-browser record start https://example.com` 可以打开 URL 并录制
- [x] CLI `agent-browser record stop` 可以停止录制并输出 YAML 到 stdout
- [x] CLI `agent-browser record stop --output file.yaml` 可以保存到文件
- [x] CLI `agent-browser record status` 可以查看录制状态
- [x] Actions `record-start` action 可以启动录制
- [x] Actions `record-stop` action 可以停止录制
- [x] Actions `record-status` action 可以获取状态
- [x] Actions `record-export` action 可以导出 YAML 数据
- [x] Viewer 页面显示录制按钮
- [x] Viewer 页面录制按钮可以切换录制状态
- [x] Viewer 页面显示录制状态指示器
- [x] YAML 导出格式清晰易读
- [x] inject.js 同步完成（已内嵌到 browser.ts）
- [x] E2E 测试通过
