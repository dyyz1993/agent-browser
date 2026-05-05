# agent-browser 从零开始教程

本教程将带你从安装到完成一个完整的录制 -> 回放 -> 导出流程。

## 前置条件

- Node.js >= 20
- macOS / Linux / Windows
- Chromium 浏览器

## 第一步：安装

```bash
npm install -g @dyyz1993/agent-browser
# 或者
pnpm add -g @dyyz1993/agent-browser
```

验证安装：

```bash
agent-browser --version
```

## 第二步：打开网页并截图

```bash
# 打开网页
agent-browser open https://example.com

# 截图保存
agent-browser screenshot --output example.png
```

## 第三步：交互式快照 + 元素选择器

```bash
# 获取页面快照（带元素引用）
agent-browser snapshot -i

# 输出示例：
# Page: https://example.com
# Title: Example Domain
# ---
# [snap_1]
# [1] heading "Example Domain"     <- h1
# [2] link "More information..."   <- a href="https://www.iana.org/domains/example"
# [3] text "This domain is for..." <- p
# ---
# Tip: Use --selector-for snap_1:@2 to get stable selector

# 获取元素的稳定选择器
agent-browser snapshot --selector-for snap_1:@2
# -> a[href="https://www.iana.org/domains/example"]

# 查看快照中所有选择器
agent-browser snapshot --selectors-of snap_1

# 验证选择器仍然有效
agent-browser snapshot --validate snap_1
```

## 第四步：录制一个完整流程

以百度搜索为例：

```bash
# 开始录制
agent-browser recorder start https://www.baidu.com

# 在搜索框输入
agent-browser fill "#kw" --value "agent-browser"

# 点击搜索按钮
agent-browser click "#su"

# 等待结果加载
agent-browser wait --duration 2000

# 截取结果页
agent-browser screenshot --output baidu-result.png

# 停止录制并保存
agent-browser recorder stop --output baidu-search.yaml
```

## 第五步：回放录制的流程

```bash
# 回放
agent-browser recorder replay baidu-search.yaml

# 转换为 Flow 后回放（带自愈功能）
agent-browser flow from-recorder baidu-search.yaml --name baidu --flow-id search --output sites/baidu.yaml
agent-browser flow run baidu.search
```

## 第六步：导出为自动化测试脚本

```bash
# 导出为 Playwright TypeScript
agent-browser flow export baidu-search.yaml --format playwright --output tests/baidu.spec.ts

# 导出为 Python Playwright
agent-browser flow export baidu-search.yaml --format python --output tests/test_baidu.py
```

导出的脚本可以直接运行：

```bash
# 运行 Playwright 脚本
npx playwright test tests/baidu.spec.ts

# 运行 Python 脚本
python tests/test_baidu.py
```

## 第七步：配置自愈参数

在 YAML 流程文件中添加配置：

```yaml
name: baidu-search-with-healing
steps:
  - action: navigate
    url: "https://www.baidu.com"
  - action: fill
    selector: "#kw"
    fallbackSelectors:
      - "input[name='wd']"
      - "[data-testid='search-input']"
    elementIdentity:
      tagName: "input"
      textContent: ""
      attributes:
        name: "wd"
    value: "agent-browser"
  - action: click
    selector: "#su"
    fallbackSelectors:
      - "input[type='submit']"
      - "button.search-btn"
    elementIdentity:
      tagName: "input"
      textContent: ""
      attributes:
        type: "submit"
        value: "百度一下"

# 自愈配置
healing:
  enabled: true
  strategies:
    - fallback
    - identity_text
    - identity_attr
  maxAttempts: 5
  attemptDelayMs: 500

# 重试配置
retry:
  maxAttempts: 3
  delayMs: 1000
  strategy: exponential
  backoffMultiplier: 2
```

## 更多示例

- 表单填写：见 `examples/form-fill.yaml`
- 分页爬取：见 `examples/pagination.yaml`
- 电商结账：见 `examples/ecommerce-checkout.yaml`

## 下一步

- 阅读 [RECORDING-REPLAY-GUIDE.md](./RECORDING-REPLAY-GUIDE.md) 了解完整功能
- 阅读 [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) 了解 API 细节
