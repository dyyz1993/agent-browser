# 录制器工具扩展方案

## 背景

当前的录制器工具（Tools/Annotations）提供以下功能：
- 🔐 **Login** - 登录态标识
- 📊 **Data** - 数据项标记
- 📄 **Page** - 分页按钮
- 📝 **Note** - 自定义备注

用户可以通过 **+Tool** 按钮为步骤添加工具标注。

## 用户需求

用户提出需要扩展工具功能，以便在代码生成时自动添加相应的处理逻辑：

1. **等待元素** - 标记某个元素后，在代码生成时自动添加等待逻辑
2. **数据容器** - 标记数据容器后，自动生成数据采集代码
3. **数据项** - 标记数据项后，自动生成数据提取代码
4. **分页按钮** - 标记分页按钮后，自动生成分页处理代码
5. **登录态检查** - 标记登录检查元素后，自动生成登录检查代码
6. **检查点** - 标记检查点后，自动生成验证检查代码
7. **自定义** - 支持更多自定义标记类型

## 设计方案

### 1. 新增工具类型

| 类型 | 图标 | 用途 | 描述 |
|-----|-----|------|------|
| **wait_element** | ⏳️ | 等待元素出现 | 标记某个元素，在代码生成时添加 `waitForSelector` 逻辑 |
| **wait_timeout** | ⏱️ | 固定等待时间 | 标记固定等待时间 |
| **data_container** | 📦 | 数据容器 | 标记数据容器（如商品列表），生成数据采集代码 |
| **data_item** | 📊 | 数据项 | 标记数据项（如商品项），生成数据提取代码 |
| **pagination** | 📄 | 分页按钮 | 标记分页按钮，生成分页处理代码 |
| **login_check** | 🔐 | 登录检查 | 标记登录检查元素，生成登录检查代码 |
| **checkpoint** | ✅ | 检查点 | 标记检查点，生成验证检查代码 |
| **custom** | 📝 | 自定义 | 用户可输入自定义标记名称 |

### 2. Annotation 数据结构

```typescript
interface AnnotationConfig {
  type: 'wait_element' | 'wait_timeout' | 'data_container' | 'data_item' | 'pagination' | 'login_check' | 'checkpoint' | 'custom';
  label: string;
  selector?: string;
  waitTimeout?: number;
  itemSelector?: string;
  fields?: string[];
  customNote?: string;
}
```

### 3. 代码生成示例

#### 等待元素 (wait_element)
```javascript
// 生成的代码
await page.waitForSelector('#search-results', { state: 'visible', timeout: 10000 });
```

#### 固定等待 (wait_timeout)
```javascript
// 生成的代码
await page.waitForTimeout(1000);
```

#### 数据容器 (data_container)
```javascript
// 生成的代码
const container = await page.$('.product-list');
const items = await container.$$('.product-item');
const data = [];
for (const item of items) {
  data.push({
    title: await item.$('.title').textContent(),
    price: await item.$('.price').textContent()
  });
}
```

#### 数据项 (data_item)
```javascript
// 生成的代码
const item = await page.$('.product-item');
const data = {
  title: await item.$('.title').textContent(),
  price: await item.$('.price').textContent()
};
```

#### 分页按钮 (pagination)
```javascript
// 生成的代码
await page.click('.next-page');
await page.waitForLoadState('networkidle');
```

#### 登录检查 (login_check)
```javascript
// 生成的代码
const isLoggedIn = await page.$('.user-avatar');
if (!isLoggedIn) {
  throw new Error('Login required');
}
```

#### 检查点 (checkpoint)
```javascript
// 生成的代码
const result = await page.$('.success-message');
if (!result) {
  throw new Error('Checkpoint failed');
}
```

### 4. 修改文件

| 文件 | 修改内容 |
|------|------|
| `src/recorder/inject.js` | 1. 新增工具按钮<br>2. 新增工具类型定义<br>3. 修改 `addToolAnnotation` 函数<br>4. 修改 `annotateElement` 函数<br>5. 新增标记元素处理逻辑<br>6. 新增样式 |
| `src/types.ts` | 7. 新增 AnnotationConfig 接口定义 |
| `src/browser.ts` | 8. 新增代码生成逻辑（可选） |

### 5. 实现步骤

1. 修改 `inject.js` 中的工具按钮定义
2. 修改 `addToolAnnotation` 函数支持新的工具类型
3. 修改 `annotateElement` 函数支持新的标记类型
4. 新增样式支持新的标记类型
5. 更新 `types.ts` 中的接口定义
6. （可选）更新 `browser.ts` 中的代码生成逻辑

### 6. 使用场景示例

#### 场景1：搜索并等待结果
```yaml
步骤1: 输入搜索词 "test"
步骤2: 点击搜索按钮
  annotation: wait_element
  config:
    selector: ".search-results"
    waitTimeout: 10000
```

生成的代码：
```javascript
await page.fill('#search-input', 'test');
await page.click('#search-button');
await page.waitForSelector('.search-results', { timeout: 10000 });
```

#### 场景2：分页采集数据
```yaml
步骤1: 打开列表页
步骤2: 标记数据容器
  annotation: data_container
  config:
    itemSelector: ".product-item"
步骤3: 点击下一页
  annotation: pagination
  config:
    maxPages: 5
```

生成的代码：
```javascript
const allData = [];
for (let page = 1; page <= 5; page++) {
  const items = await page.$$('.product-item');
  for (const item of items) {
    allData.push({
      text: await item.textContent()
    });
  }
  if (page < 5) {
    await page.click('.next-page');
    await page.waitForSelector('.product-list');
  }
}
```
