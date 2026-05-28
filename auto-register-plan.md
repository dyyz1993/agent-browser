# 自动注册 50 个网站计划

> 创建时间：2026-05-16
> 目标：批量注册搜索类/API类/云服务类网站，优先白嫖服务器和免费 API

---

## 一、注册信息（统一使用）

| 项目 | 值 |
|------|-----|
| 邮箱 | dyyz1993@163.com |
| 用户名 | dyyz1993 / yingzhouxu / yxudev |
| 密码策略 | 每站独立，格式: `Xy@{site_prefix}2026!` |
| 密码存档 | `~/.agent-browser/accounts/registrations.jsonl` |
| 浏览器 | CDP 9221（带 163 登录态），连不上用 `open` |

## 二、网站清单（按优先级分组）

### A. 搜索 API 类（15个）— 核心目标

| # | 网站 | 注册URL | 免费额度 | 预估难度 |
|---|------|---------|---------|---------|
| 1 | Serper | serper.dev/signup | 2500次/月 | 已注册 |
| 2 | Brave Search API | brave.com/search/api | 2000次/月 | 简单 |
| 3 | SerpAPI | serpapi.com/manage-api-key | 100次/月 | 中等 |
| 4 | ScrapingBee | scrapingbee.com/signup | 1000 credits | 简单 |
| 5 | Firecrawl | firecrawl.dev | 500 credits | 简单 |
| 6 | Tavily | tavily.com | 1000次/月 | 简单 |
| 7 | Exa | exa.ai | 1000次/月 | 简单 |
| 8 | SearXNG | 无需注册（开源） | - | 跳过 |
| 9 | Google Programmable Search | developers.google.com/custom-search | 100次/天 | 中等 |
| 10 | Bing Web Search API | azure.microsoft.com | 1000次/月 | 难(Azure) |
| 11 | ValueSERP | valueserp.com | 100次/月 | 简单 |
| 12 | Zenserp | zenserp.com | 50次/月 | 简单 |
| 13 | ScaleSerp | scaleserp.com | 100次/月 | 简单 |
| 14 | GeoRanker | georanker.com | 有限免费 | 中等 |
| 15 | D7 Lead Finder | d7leadfinder.com | 有限免费 | 中等 |

### B. 云服务器/托管类（12个）— 白嫖服务器

| # | 网站 | 注册URL | 免费额度 | 预估难度 |
|---|------|---------|---------|---------|
| 16 | Oracle Cloud | cloud.oracle.com/free | 永久免费VM(1GB RAM) | 难(需信用卡) |
| 17 | Google Cloud | cloud.google.com/free | $300赠金+永久免费层 | 难(需信用卡) |
| 18 | AWS | aws.amazon.com/free | 12个月免费层 | 难(需信用卡) |
| 19 | Azure | azure.microsoft.com/free | $200赠金 | 难(需信用卡) |
| 20 | Vercel | vercel.com/signup | 免费Hobby | 简单(GitHub) |
| 21 | Netlify | netlify.com/signup | 免费层 | 简单(GitHub) |
| 22 | Railway | railway.app | $5赠金/月 | 简单 |
| 23 | Render | render.com | 免费Web服务 | 简单 |
| 24 | Fly.io | fly.io | 免费层(3VM) | 中等 |
| 25 | Koyeb | koyeb.com | 免费层(1服务) | 简单 |
| 26 | ClawCloud Run | run.claw.cloud | 免费$5/月 | 简单(GitHub) |
| 27 | Hugging Face Spaces | huggingface.co | 免费CPU实例 | 简单 |

### C. Web Scraping / 数据类（10个）

| # | 网站 | 注册URL | 免费额度 | 预估难度 |
|---|------|---------|---------|---------|
| 28 | Apify | apify.com | 30天试用 | 简单 |
| 29 | Bright Data | brightdata.com | 7天试用 | 中等 |
| 30 | ScraperAPI | scraperapi.com | 1000次/月 | 简单 |
| 31 | ScrapeStack | scrapestack.com | 100次/月 | 简单 |
| 32 | ProxyCrawl | proxycrawl.com | 1000次 | 简单 |
| 33 | ZenRows | zenrows.com | 1000 credits | 简单 |
| 34 | Crawlbase | crawlbase.com | 1000 req | 简单 |
| 35 | Scrape.do | scrape.do | 1000 credits | 简单 |
| 36 | AbstractAPI | abstractapi.com | 100次/月 | 简单 |
| 37 | IPinfo | ipinfo.io | 50k/月 | 简单 |

### D. AI / LLM API 类（13个）

| # | 网站 | 注册URL | 免费额度 | 预估难度 |
|---|------|---------|---------|---------|
| 38 | OpenAI | platform.openai.com | 有限免费 | 中等 |
| 39 | Google AI (Gemini) | ai.google.dev | 免费层 | 简单 |
| 40 | Anthropic | console.anthropic.com | $5赠金 | 中等 |
| 41 | Groq | console.groq.com | 免费层(快) | 简单 |
| 42 | Together AI | together.ai | $5赠金 | 简单 |
| 43 | DeepSeek | platform.deepseek.com | 500万token免费 | 简单 |
| 44 | Mistral | console.mistral.ai | 免费层 | 简单 |
| 45 | Cohere | dashboard.cohere.com | 免费层 | 简单 |
| 46 | Fireworks AI | fireworks.ai | 免费层 | 简单 |
| 47 | Silicon Flow | siliconflow.cn | 免费层 | 简单 |
| 48 | Replicate | replicate.com | 有限免费 | 简单 |
| 49 | Hugging Face Inference | huggingface.co | 免费层 | 简单 |
| 50 | Cloudflare Workers AI | dash.cloudflare.com | 免费10万次/天 | 简单 |

## 三、执行策略

### 流程（每站）

```
1. agent-browser open {signup_url}
2. snapshot 获取页面结构
3. 填写邮箱 + 用户名 + 密码
4. 提交注册
5. ab-mail163 search-code --sender "{site_name}"
   或 ab-mail163 wait-for --sender "{site_name}" --timeout 30000
6. 提取验证码/链接，完成验证
7. 记录到 accounts.jsonl
8. 截图保存（可选）
```

### 跳过规则

- 页面打不开（超时 15s）→ 跳过，标记 `timeout`
- 需要验证码（reCAPTCHA/hCaptcha）→ 跳过，标记 `captcha`
- 需要信用卡 → 跳过，标记 `need_cc`
- 需要手机号 → 跳过，标记 `need_phone`
- 需要邮箱白名单（企业邮箱）→ 跳过，标记 `need_work_email`
- 注册后需人工审核 → 标记 `pending_review`

### 密码生成规则

```
function genPassword(siteName: string): string {
  const prefix = siteName.substring(0, 4).toLowerCase();
  return `Xy@${prefix}2026!`;
}
// 例如: Serper → Xy@serp2026!, Brave → Xy@brav2026!
```

## 四、账号存档格式

文件：`~/.agent-browser/accounts/registrations.jsonl`

```jsonc
// 每行一条记录
{"site":"serper.dev","name":"Serper","username":"dyyz1993","email":"dyyz1993@163.com","password":"Xy@serp2026!","apiKey":"df3e60bf...","freeQuota":"2500次/月","registeredAt":"2026-05-16T02:56:00Z","status":"verified","notes":"Google Search API"}
```

## 五、执行批次

| 批次 | 数量 | 策略 |
|------|------|------|
| B1 | A组(搜索API) 15个 | 最核心，优先执行 |
| B2 | D组(AI/LLM) 13个 | 价值高，流程简单 |
| B3 | C组(Scraping) 10个 | 注册流程类似 |
| B4 | B组(云服务器) 12个 | 部分需信用卡，会跳过部分 |

每批用子任务并行执行，每个子任务处理 5-10 个网站。

## 六、风险控制

1. **频率控制**：每站注册间隔 10-30 秒，避免触发反作弊
2. **失败处理**：单站失败不影响后续，记录失败原因
3. **邮件轮询**：注册后立即用 `wait-for` 等待验证邮件，超时 30s
4. **密码安全**：存档文件权限 600，不提交到 git
