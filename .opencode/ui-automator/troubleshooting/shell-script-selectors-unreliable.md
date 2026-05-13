# Shell 脚本选择器不可靠

> 最后更新：2026-05-12 | 来源：doubao-plugin v0.1.0 测试失败

## 摘要
从 shell 脚本分析得出的选择器（data-testid、hash class、特定 ID）未经实测验证就直接用于插件，会导致全部失败。**必须实测验证**。

## 问题
doubao-plugin v0.1.0 的所有选择器来自对 20+ 个 `doubao-*.sh` 脚本的静态分析，但这些脚本本身：
1. 可能是旧版本的 UI（网站已更新）
2. 选择器可能是 LLM 幻觉生成的
3. data-testid 在 doubao.com 全站不存在

## 教训
- Shell 脚本中的选择器**不能直接信任**
- 从脚本迁移到插件时，**必须先实测验证**每个选择器
- 优先使用语义选择器（textarea、[role]）而非 brittle 选择器（hash class、data-testid）
- `clickByText()` 是缺少稳定选择器时的有效兜底方案

## 变更记录
- 2026-05-12：初始创建
