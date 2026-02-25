# 数据提取模式指南

本文档总结了 agent-browser 的五种核心数据提取模式，适用于不同类型的网站架构。

## 模式一：DOM 元素提取

适用于静态渲染页面，直接从 HTML 元素提取数据。

### 基础示例

```bash
agent-browser open "https://example.com/products"
agent-browser eval '
const items = document.querySelectorAll(".product-item");
const products = Array.from(items).map(item => ({
  name: item.querySelector("h3")?.textContent?.trim(),
  price: item.querySelector(".price")?.textContent?.trim(),
  link: item.querySelector("a")?.href
}));
JSON.stringify(products, null, 2);
'
```

### 实际案例：Twitter 推文提取

```javascript
const tweets = [];
const items = document.querySelectorAll(".timeline-item");

for (let i = 0; i < Math.min(10, items.length); i++) {
  const el = items[i];
  const textEl = el.querySelector(".tweet-content, .content");
  const linkEl = el.querySelector("a[href*=\"status\"]");
  
  tweets.push({
    id: linkEl?.href?.match(/status\/(\d+)/)?.[1] || "",
    text: textEl?.textContent?.trim() || "",
    author: el.querySelector(".fullname")?.textContent?.trim(),
    time: el.querySelector("time")?.getAttribute("datetime")
  });
}

JSON.stringify({ tweets_count: tweets.length, tweets }, null, 2);
```

### 最佳实践

- 使用 `?.` 可选链避免空指针错误
- 提供多个备选选择器：`.tweet-content, .content, .tweet-text`
- 限制输出长度：`text.substring(0, 1000)`
- 使用 `JSON.stringify()` 输出结构化数据

---

## 模式二：JavaScript 全局变量提取

适用于 SPA（单页应用），从 `window` 对象提取预加载的状态数据。

### 常见全局变量

| 网站/框架 | 变量名 | 用途 |
|-----------|--------|------|
| 小红书 | `__INITIAL_STATE__` | React 状态 |
| 电商网站 | `dataLayer` | GTM 数据层 |
| 商品详情 | `productConfig`, `variations` | 商品配置 |
| 通用 | `__NEXT_DATA__`, `__NUXT__` | SSR 数据 |

### 实际案例：小红书搜索结果

```bash
agent-browser eval '
const feeds = window.__INITIAL_STATE__?.search?.feeds?._value || {};
const posts = Object.values(feeds).filter(f => f.noteCard).map(f => ({
  id: f.id,
  user: {
    name: f.noteCard.user.nickname,
    avatar: f.noteCard.user.avatar
  },
  stats: {
    likes: parseInt(f.noteCard.interactInfo.likedCount) || 0,
    comments: parseInt(f.noteCard.interactInfo.commentCount) || 0
  },
  cover: f.noteCard.cover?.urlDefault,
  link: "https://www.xiaohongshu.com/explore/" + f.id
}));
JSON.stringify({ count: posts.length, posts });
'
```

### 实际案例：电商商品详情（dataLayer）

```bash
agent-browser eval '
const dl = window.dataLayer || [];
const viewItem = dl.find(e => e.event === "view_item");
const item = viewItem?.ecommerce?.items?.[0] || {};

const product = {
  name: document.querySelector("h1")?.textContent?.trim() || item.item_name,
  productId: item.item_id,
  price: item.price,
  currency: viewItem?.ecommerce?.currency || "HKD",
  color: item.color,
  category: item.item_category,
  stockStatus: item.stock_status
};

JSON.stringify(product, null, 2);
'
```

### 最佳实践

- 使用可选链：`window.__INITIAL_STATE__?.search?.feeds?._value`
- 提供默认值：`|| {}` 或 `|| []`
- 结合 DOM 提取作为补充数据源

---

## 模式三：API 拦截捕获

适用于反爬严格的网站，被动捕获 XHR/Fetch 响应。

### 工作原理

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 打开空白页  │ --> │ 启动监听器  │ --> │ 导航目标页  │
│ about:blank │     │ wait --req  │     │ 触发 API    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               v
                                        ┌─────────────┐
                                        │ 捕获响应    │
                                        │ 保存 JSON   │
                                        └─────────────┘
```

### 实际案例：抖音用户视频

```bash
TARGET_URL="https://www.douyin.com/user/MS4wLjABAAA..."
OUTPUT_FILE="/tmp/douyin-videos.json"

agent-browser open "about:blank"

(agent-browser wait --request "aweme/post" --timeout 30000 > /tmp/response.json) &
WAIT_PID=$!
sleep 1

agent-browser open "$TARGET_URL"
wait $WAIT_PID

jq '{
  user: .aweme_list[0].author.nickname,
  videos: .aweme_list[:10] | map({
    id: .aweme_id,
    desc: .desc,
    stats: {
      likes: .statistics.digg_count,
      comments: .statistics.comment_count
    }
  })
}' /tmp/response.json > "$OUTPUT_FILE"
```

### 常见 API 模式

| 平台 | 请求特征 | 数据路径 |
|------|---------|---------|
| 抖音 | `aweme/post` | `.aweme_list` |
| 小红书 | `api/snsweb` | `.data` |
| 电商 | `api/product` | `.product` |
| 通用 | `demandware`, `graphql` | 根据响应结构 |

### 最佳实践

- 先打开空白页再启动监听
- 使用后台进程 `&` 和 `wait`
- 设置合理的超时时间
- 使用 `jq` 处理 JSON 输出

---

## 模式四：滚动加载采集

适用于无限滚动列表，循环滚动 + 去重合并。

### 工作流程

```
┌──────────────────────────────────────────────────────┐
│                    滚动采集循环                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │ 提取数据 │ -> │ 合并去重 │ -> │ 滚动加载 │        │
│  └──────────┘   └──────────┘   └──────────┘        │
│       │              │              │               │
│       v              v              v               │
│   当前数据       累计数据       触发加载              │
│                                      │               │
│       <──────── 检测终止条件 ────────┘               │
└──────────────────────────────────────────────────────┘
```

### 实际案例：抖音关注列表

```bash
ALL_USERS="[]"
PREV_COUNT=0

for i in {1..30}; do
  CURRENT=$(agent-browser eval 'JSON.stringify(
    Array.from(document.querySelectorAll("a"))
      .filter(a => a.href.includes("/user/"))
      .map(a => ({ name: a.textContent.trim(), url: a.href }))
      .filter(u => u.name.length > 0)
  )')
  
  ALL_USERS=$(echo "$ALL_USERS" "$CURRENT" | python3 -c "
import sys, json
data = []
for line in sys.stdin:
    try:
        d = json.loads(line.strip())
        if isinstance(d, list): data.extend(d)
    except: pass
seen = set()
unique = [u for u in data if u['url'] not in seen and not seen.add(u['url'])]
print(json.dumps(unique, ensure_ascii=False))
  ")
  
  COUNT=$(echo "$ALL_USERS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
  echo "已采集: $COUNT 个用户"
  
  [ "$COUNT" -eq "$PREV_COUNT" ] && [ "$COUNT" -gt 0 ] && break
  PREV_COUNT=$COUNT
  
  agent-browser scroll down 300
  sleep 1
done
```

### 终止条件检测

```bash
# 方式一：数量不变
[ "$COUNT" -eq "$PREV_COUNT" ] && break

# 方式二：检测 API 标志
HAS_MORE=$(agent-browser eval 'window.__INITIAL_STATE__?.hasMore')
[ "$HAS_MORE" = "false" ] && break

# 方式三：检测 DOM 元素
BOTTOM=$(agent-browser eval 'document.querySelector(".no-more") !== null')
[ "$BOTTOM" = "true" ] && break
```

### 最佳实践

- 使用 URL 或 ID 作为去重键
- 设置最大循环次数防止无限循环
- 滚动后适当等待加载
- 输出进度便于监控

---

## 模式五：iframe 嵌套操作

适用于嵌入式登录、第三方组件等场景。

### Frame 路径语法

```
#outer-iframe           # 单层 iframe（按 ID/Name）
#0                      # 第一个 iframe（按索引）
#outer/login            # 嵌套 iframe（父/子）
#0/1/2                  # 多层嵌套（按索引）
```

### 实际案例：嵌套 iframe 登录

```bash
agent-browser open "https://example.com/embedded-login"

# 查看主页面 iframe 结构
agent-browser snapshot

# 切换到嵌套 iframe
agent-browser snapshot --in-frame "#outer-iframe/login-frame"

# 在 iframe 内操作
agent-browser fill '#username' 'admin' --in-frame "#outer-iframe/login-frame"
agent-browser fill '#password' 'password' --in-frame "#outer-iframe/login-frame"
agent-browser click 'button' --in-frame "#outer-iframe/login-frame"

# 验证结果
agent-browser snapshot --in-frame "#outer-iframe/login-frame"
```

### 最佳实践

- 先 snapshot 主页面了解 iframe 结构
- 使用 CSS 选择器或索引定位 iframe
- 每次操作后重新 snapshot 验证状态

---

## 代理配置

所有脚本都支持代理，用于访问受限网站：

```bash
# 方式一：环境变量
export https_proxy=http://127.0.0.1:7890
agent-browser open "https://target-site.com"

# 方式二：命令行参数
agent-browser --proxy "http://127.0.0.1:7890" open "https://target-site.com"

# 方式三：SOCKS5 代理
export https_proxy=socks5://127.0.0.1:1080
```

---

## 完整脚本模板

### 数据提取脚本结构

```bash
#!/bin/bash
# 用法: ./extract-data.sh [参数] [输出文件]

TARGET_URL="${1:-https://default.example.com}"
OUTPUT_FILE="${2:-/tmp/output.json}"

echo "=== 1. 关闭旧会话 ==="
agent-browser close 2>/dev/null
sleep 1

echo ""
echo "=== 2. 配置代理并打开页面 ==="
export https_proxy=http://127.0.0.1:7890
agent-browser open "$TARGET_URL"
sleep 2

echo ""
echo "=== 3. 提取数据 ==="
agent-browser eval '
// 数据提取逻辑
const data = { /* ... */ };
JSON.stringify(data, null, 2);
' > "$OUTPUT_FILE"

echo ""
echo "=== 4. 显示结果 ==="
cat "$OUTPUT_FILE"

echo ""
echo "=== 5. 关闭浏览器 ==="
agent-browser close

echo ""
echo "=== 采集完成 ==="
```

---

## 选择指南

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| 静态页面 | DOM 提取 | 简单直接 |
| SPA 应用 | JS 变量提取 | 数据已预加载 |
| 反爬严格 | API 拦截 | 绕过前端限制 |
| 无限列表 | 滚动加载 | 完整采集 |
| 嵌套组件 | iframe 操作 | 跨域访问 |
