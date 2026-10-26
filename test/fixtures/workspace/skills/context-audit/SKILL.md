---
name: context-audit
description: 检查 agent 的 skill 文件与 MCP 配置占用了多少上下文。
---

# Context Audit

当用户问「为什么 agent 变慢、变贵、开始忘事」时使用本 skill。先量上下文，再决定加载什么。

## 步骤

1. 递归找出 `SKILL.md`、`*.skill.md` 和 MCP 配置文件。
2. 用启发式估算 token，不调用 tokenizer，也不执行配置里的命令。
3. 按估算 token 从大到小排序，报告前几个文件和它们的上下文占比。

## 输出

给一张表，列出路径、计入的字节数、估算 token、占上下文窗口的百分比。
同时明确写出：估算值不是 tokenizer 精确值。

## 示例

```bash
skillcost scan . --context 200000 --limit 5
skillcost scan ~/.config/opencode --json
```

不要为了「了解一下」把整个 skill 目录读进上下文。先看大小，再挑要加载的文件；
超过上下文预算 2% 的单个 skill 通常值得拆分。
