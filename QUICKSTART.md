# 京东商品数据爬取 - 快速开始

## 5分钟快速上手

### 第一步：准备环境

```bash
# 1. 确保已安装 agent-browser
npm install -g agent-browser

# 2. 确保 CDP 浏览器服务正在运行
# 如果没有运行，需要启动一个浏览器服务
# 例如使用 Chrome 的远程调试模式：
# /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# 3. 确保 jq 已安装
brew install jq
```

### 第二步：运行基础爬取

```bash
# 直接运行爬取脚本
./scrape_jd_products.sh
```

**输出结果：**
- 60个商品数据
- 包含：标题、店铺、价格、销量
- JSON 和 CSV 格式文件
- 详细日志记录

### 第三步：获取评论数据（可选）

```bash
# 获取前5个商品的评论
./scrape_jd_comments.sh /tmp/jd_products/products_TIMESTAMP.json 5
```

### 第四步：验证数据一致性

```bash
# 运行验证脚本
./verify_data_consistency.sh
```

## 输出文件位置

所有文件保存在 `/tmp/jd_products/` 目录：

```
/tmp/jd_products/
├── products_20260224_150038.json    # 商品数据 (JSON)
├── products_20260224_150055.csv     # 商品数据 (CSV)
├── scrape_20260224_150038.log       # 抓取日志
└── comments_20260224_150XXX.json    # 评论数据 (可选)
```

## 数据字段说明

### 必需字段（每次抓取都包含）
- `sku`: 商品唯一标识
- `title`: 商品标题
- `price`: 商品价格
- `shop`: 店铺名称
- `sales`: 销量信息
- `url`: 商品详情页链接

### 可选字段（需单独抓取）
- `total`: 总评论数
- `good`: 好评率/数
- `mid`: 中评率/数
- `bad`: 差评率/数

## 常见使用场景

### 场景1：获取特定关键词商品

编辑 `scrape_jd_products.sh`：

```bash
KEYWORD="你想要的商品关键词"
```

### 场景2：增加抓取数量

编辑 `scrape_jd_products.sh`：

```bash
MAX_SCROLLS=20  # 增加滚动次数
```

### 场景3：修改输出路径

编辑 `scrape_jd_products.sh`：

```bash
OUTPUT_DIR="/your/custom/path"
```

## 性能优化建议

### 小规模抓取（推荐新手）
- 使用默认配置
- 间隔 1-2 秒
- 稳定可靠

### 中等规模抓取
```bash
# 修改脚本增加滚动次数
MAX_SCROLLS=20

# 获取更多商品评论
./scrape_jd_comments.sh <json_file> 50
```

### 大规模抓取（高级用户）
- 考虑使用代理IP
- 实现并行抓取
- 遵守网站使用条款

## 故障排除

### 问题1：CDP连接失败
**症状：** 提示 "Browser not launched"
**解决：**
```bash
# 检查 CDP 服务是否运行
curl -s --connect-timeout 3 http://localhost:8080/json/version

# 如果未运行，启动浏览器服务
# Chrome: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

### 问题2：商品数量少
**症状：** 只抓取到30个商品
**解决：**
```bash
# 编辑脚本，增加滚动次数
MAX_SCROLLS=20

# 重新运行
./scrape_jd_products.sh
```

### 问题3：评论API失败
**症状：** 提示 "系统繁忙"
**解决：**
- 这是正常的反爬限制
- 使用详情页DOM提取方案
- 运行 `./scrape_jd_comments.sh` 获取评论

### 问题4：数据不完整
**症状：** 某些字段为空
**解决：**
```bash
# 查看日志文件
cat /tmp/jd_products/scrape_TIMESTAMP.log

# 运行验证脚本
./verify_data_consistency.sh
```

## 数据验证和清洗

### 检查数据质量

```bash
# 统计商品数量
jq 'length' /tmp/jd_products/products_TIMESTAMP.json

# 检查缺失字段
jq '[.[] | select(.title == "")] | length' /tmp/jd_products/products_TIMESTAMP.json
```

### 数据筛选

```bash
# 筛选特定店铺
jq '[.[] | select(.shop == "京东自营")]' /tmp/jd_products/products_TIMESTAMP.json

# 筛选价格范围
jq '[.[] | select(.price | test("¥50-¥100"))]' /tmp/jd_products/products_TIMESTAMP.json

# 筛选销量前10
jq 'sort_by(.sales) | reverse | .[:10]' /tmp/jd_products/products_TIMESTAMP.json
```

### 导出到其他格式

```bash
# 转换为 TSV
jq -r '.[] | [.title, .shop, .price, .sales] | @tsv' /tmp/jd_products/products_TIMESTAMP.json > output.tsv

# 转换为 Excel 友好格式（CSV已生成）
# 直接用 Excel 打开 CSV 文件
```

## 最佳实践

1. **定期抓取**: 设置定时任务，定期获取最新数据
2. **数据备份**: 保留历史数据，便于对比分析
3. **日志监控**: 定期检查日志文件，及时发现异常
4. **遵守规则**: 控制抓取频率，避免给服务器造成压力

## 下一步

- 查看 [README_JD_SCRAPER.md](README_JD_SCRAPER.md) 了解详细文档
- 运行 [verify_data_consistency.sh](verify_data_consistency.sh) 验证数据
- 根据需求定制脚本

## 技术支持

如遇问题，请：
1. 查看日志文件
2. 运行验证脚本
3. 检查网络连接
4. 确认 CDP 服务状态

---

**重要提醒**: 本工具仅供学习交流使用，请遵守相关法律法规和网站使用条款。
