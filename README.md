# skillcost

估算本地 `SKILL.md`、`*.skill.md` 和 MCP 配置占多少上下文 token，按大小排序。零运行时依赖；不联网、不调用模型、不执行配置里的命令。

> GitHub 仓库名是 `openbot-skillcost`，CLI 可执行名是 `skillcost`。

## 安装

需要 Node >= 22，没有第三方依赖。

```bash
npm install -g .
skillcost --help
```

不想全局安装就直接用 `node src/cli.mjs`。

## 一条命令

```bash
node src/cli.mjs scan test/fixtures
```

2026-10-26 在本机跑出的真实输出：

```text
skillcost — context cost of skills and MCP configs
root: test/fixtures
context: 200,000 tokens

FILE                                     KIND   BYTES  EST.TOKENS  % OF CTX
---------------------------------------------------------------------------
workspace/skills/context-audit/SKILL.md  skill    972         265     0.13%
workspace/opencode.json                  mcp      289          84     0.04%
workspace/skills/quick.skill.md          skill    156          39     0.02%
---------------------------------------------------------------------------
TOTAL (3)                                       1,417         388     0.19%

估算，不是 tokenizer 精确值（heuristic estimate, not a tokenizer）。ASCII ≈ 4 字符/token，CJK ≈ 1.2 字符/token，代码/JSON ×1.15。
MCP 只统计 tools / command / args / description 文本；BYTES 是计入文本的字节数，不是配置文件大小。
```

**估算，不是 tokenizer 精确值。** 这张表用来比较“哪个文件更吃上下文”，不能当作账单或模型侧的精确 token 数。

## 它扫什么

递归扫描目录，文件名大小写不敏感：

| 文件 | 计数范围 |
| --- | --- |
| `SKILL.md`、`*.skill.md` | 整个文件 |
| `opencode.json`、`.mcp.json`、`mcp.json` | 解析 JSON 后，只取 `tools` / `tool` 子树，以及 `command`（含 `args`）和 `description` 的文本 |

MCP 配置只读取，不执行。`tools` 子树按序列化后的 JSON 计数（包含工具名和 schema）；`command` / `args` 只拼接字符串。`env`、URL、其他不相关字段不计入。

匹配到但没有任何 `tools` / `command` / `description` 文本的 MCP 配置会以 0 token 出现在结果里。

扫描时跳过符号链接，以及 `node_modules/`、`.git/`，避免扫进依赖包和循环链接。

## JSON 输出

```bash
node src/cli.mjs scan test/fixtures --json --limit 2
```

真实输出：

```json
{
  "ok": true,
  "root": "C:\\path\\to\\skillcost\\test\\fixtures",
  "contextWindow": 200000,
  "estimator": {
    "method": "heuristic-v1",
    "disclaimer": "估算，不是 tokenizer 精确值",
    "asciiCharsPerToken": 4,
    "cjkCharsPerToken": 1.2,
    "otherCharsPerToken": 3,
    "codeWeight": 1.15
  },
  "disclaimer": "估算，不是 tokenizer 精确值",
  "totals": {
    "files": 3,
    "bytes": 1417,
    "fileBytes": 1727,
    "tokens": 388,
    "percent": 0.194
  },
  "totalFiles": 3,
  "shown": 2,
  "files": [
    {
      "path": "workspace/skills/context-audit/SKILL.md",
      "absolutePath": "C:\\path\\to\\skillcost\\test\\fixtures\\workspace\\skills\\context-audit\\SKILL.md",
      "kind": "skill",
      "bytes": 972,
      "fileBytes": 972,
      "tokens": 265,
      "percent": 0.1325
    },
    {
      "path": "workspace/opencode.json",
      "absolutePath": "C:\\path\\to\\skillcost\\test\\fixtures\\workspace\\opencode.json",
      "kind": "mcp",
      "bytes": 289,
      "fileBytes": 599,
      "tokens": 84,
      "percent": 0.042
    }
  ]
}
```

字段说明：

| 字段 | 含义 |
| --- | --- |
| `bytes` | 实际计入的文本字节数；MCP 行会小于文件大小 |
| `fileBytes` | 文件原始字节数 |
| `tokens` | 启发式估算 token |
| `percent` | 占 `contextWindow` 的百分比，范围 0-100 |
| `totals` | 全部匹配文件的合计，不受 `--limit` 影响 |
| `shown` / `totalFiles` | 本次输出的行数 / 扫描到的总文件数 |

`--limit` 只截断 `files` 数组，`totals` 仍然按全部文件计算。

表格里的 `root` 是相对当前目录的路径；JSON 里的 `root` 和 `absolutePath` 是绝对路径。

## 选项

```text
skillcost scan <dir> [options]

--json           输出 JSON 到 stdout
--context <n>    上下文窗口大小，默认 200000
--limit <n>      只显示前 n 个文件；0 表示不显示明细
-h, --help       帮助
```

`--context` 必须是正整数，`--limit` 必须是非负整数，否则退出码为 2。

## 常见用法

审计当前项目，默认按 200k 窗口算占比：

```bash
node src/cli.mjs scan .
```

换成 128k 窗口，只看最大的 10 个：

```bash
node src/cli.mjs scan . --context 128000 --limit 10
```

导出 JSON，交给脚本或 CI 做上下文预算检查：

```bash
node src/cli.mjs scan . --json > skillcost.json
```

## 退出码与错误

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 扫描错误：目录不存在、没有匹配文件、JSON 解析失败、读取失败 |
| `2` | 用法错误：未知命令、缺少目录、参数值不合法 |

目录不存在：

```text
$ node src/cli.mjs scan nope
skillcost: 目录不存在：nope
```

没有匹配文件：

```text
$ node src/cli.mjs scan test/fixtures/empty
skillcost: 没有找到 SKILL.md、*.skill.md 或 MCP 配置（opencode.json / .mcp.json / mcp.json）：test/fixtures/empty
```

JSON 解析失败会指出具体文件并立即退出，不会输出一半结果：

```text
skillcost: JSON 解析失败：mcp.json（Unexpected end of JSON input）
```

加 `--json` 时，错误以 JSON 写到 stderr，退出码仍然非 0：

```json
{
  "ok": false,
  "error": {
    "code": "E_NO_MATCH",
    "message": "没有找到 SKILL.md、*.skill.md 或 MCP 配置（opencode.json / .mcp.json / mcp.json）：test/fixtures/empty",
    "path": "C:\\path\\to\\skillcost\\test\\fixtures\\empty"
  }
}
```

## 估算方法

没有 tokenizer 依赖，用固定规则算：

| 内容 | 估算 |
| --- | --- |
| ASCII 字符 | 4 字符 / token |
| CJK（汉字、假名、谚文、全角标点） | 1.2 字符 / token |
| 其他 Unicode 字符 | 3 字符 / token |
| Markdown 代码块、JSON 的 ASCII 部分 | 在 4 字符 / token 基础上 × 1.15 |

最后向上取整。同样的输入永远得到同样的数字，所以适合做相对排序和回归对比。

它不是 tokenizer：不同模型的分词器、BPE 合并规则、JSON 格式都会让实际值上下浮动。需要精确计费时请用目标模型的 tokenizer；这个工具只解决“先看哪个文件大”的问题。

## 开发与测试

```bash
npm test          # 等价于 node --test
```

当前 24 个测试，覆盖：

- fixture 扫描与按 token 降序排序
- JSON 字段、百分比计算、`--context` / `--limit` 语义
- 空目录、目录不存在、非法 JSON 的退出码和错误信息
- ASCII / CJK / JSON / 代码块的估算
- Windows 路径在表格里归一化为 `/`（JSON 的 `absolutePath` 保留本机路径）

测试不依赖网络，也不依赖第三方包。

## 限制

- **估算不是精确值。** 不要用它判断 API 账单，只用来找上下文热点。
- **MCP 配置通常不含完整工具 schema。** `.mcp.json` 多数只写 `command` / `args` / `env`，这时结果只是 command 文本的下界，不是真实 tool 定义的开销。要估完整 schema，需要先把工具定义导出成 `tools` 字段。
- 只认上述文件名。其他命名的 skill 或配置文件不会扫到。
- 假设文件是 UTF-8；非法字节会被替换成 `U+FFFD`，计数会有偏差。
- 跳过符号链接、`node_modules/`、`.git/`。藏在依赖包里的 skill 不计入。
- 没有 watch、增量缓存、历史趋势、按模型切换 tokenizer。
- 不联网、不调用 LLM、不写文件、不执行任何配置命令。
- 只支持 Node 22+。

## License

MIT。见 [LICENSE](./LICENSE)。
