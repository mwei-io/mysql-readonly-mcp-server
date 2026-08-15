# mysql-readonly-mcp

> 🚀 **只读 MySQL MCP Server** - 让 AI 客户端在需求澄清与开发过程中安全地查询表结构与测试数据。

## ✨ 特性

- 🔒 **双重只读保障**：应用层 SQL 白名单（AST 校验）+ 数据库只读账号权限建议
- 🌐 **多库支持**：同时连接同一 IP 服务器下的多个数据库
- 📊 **四个核心工具**：`list_connections` / `query` / `describe_table` / `list_tables`
- 📝 **Markdown 输出**：友好的表格格式返回，自动行数和结果截断保护
- 📋 **可配置日志**：级别/目录/保留天数可配，密码绝不记录
- ✅ **MCP 2026-07-28 规范**：标准 stdio 传输协议

## 🛡️ 安全说明

### 第一道防线：应用层 SQL 白名单
本 Server 使用 `node-sql-parser` 进行 AST 分析，严格拦截一切非只读语句：

✅ **允许**：`SELECT` / `SHOW` / `DESCRIBE` / `EXPLAIN`
❌ **拒绝**：`INSERT` / `UPDATE` / `DELETE` / `DROP` / `ALTER` / `CREATE` 等所有写操作

**高级防护**：
- 多语句注入检测（含注释中的分号）
- 字符串字面量关键词不误杀
- `SELECT INTO OUTFILE/DUMPFILE` 拦截
- 语法错误 SQL 拒绝并给出中文提示

### 第二道防线：数据库只读账号（强烈建议）

```sql
CREATE USER 'readonly_user'@'%' IDENTIFIED BY '<强密码>';
GRANT SELECT, SHOW VIEW ON orders.* TO 'readonly_user'@'%';
GRANT SELECT, SHOW VIEW ON users.* TO 'readonly_user'@'%';
FLUSH PRIVILEGES;
```

---

## 🚀 快速开始

```powershell
# 1. 克隆并进入项目目录
cd mysql-readonly-mcp-server

# 2. 安装依赖
npm install

# 3. 构建项目（生成 dist/ 目录）
npm run build
```

## 📋 配置

### 1. 复制配置文件

```powershell
copy config.example.json config.json
```

### 2. 编辑 `config.json`

完整字段说明：

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `defaultLimit` | 否 | 10 | SELECT 无 LIMIT 时自动附加的行数限制 |
| `maxLimit` | 否 | 1000 | 行数硬上限，超过时自动钳制并提示 |
| `connections.*` | **是** | - | 命名连接配置，至少需要一个 |
| `connections.name.host` | **是** | - | MySQL 服务器地址 |
| `connections.name.port` | 否 | 3306 | MySQL 端口 |
| `connections.name.user` | **是** | - | 数据库用户名（建议使用只读账号） |
| `connections.name.password` | **是** | - | 密码，支持 `${ENV_VAR}` 引用环境变量 |
| `connections.name.database` | **是** | - | 默认数据库名 |
| `log.enabled` | 否 | true | 日志总开关 |
| `log.level` | 否 | info | 日志级别：debug/info/warn/error |
| `log.dir` | 否 | ./logs | 日志目录路径 |
| `log.keepDays` | 否 | 7 | 日志保留天数，0 表示不清理 |

**示例配置**：

```json
{
  "defaultLimit": 10,
  "maxLimit": 1000,
  "connections": {
    "order-db": {
      "host": "192.168.1.100",
      "port": 3306,
      "user": "readonly_user",
      "password": "your_password",
      "database": "orders"
    }
  },
  "log": {
    "enabled": true,
    "level": "info",
    "dir": "./logs",
    "keepDays": 7
  }
}
```

**环境变量引用示例**：

```json
{
  "connections": {
    "my-db": {
      "host": "localhost",
      "user": "readonly_user",
      "password": "${MYSQL_PASSWORD}",  // 使用环境变量
      "database": "test_db"
    }
  }
}
```

---

## 🎯 核心工具说明

### 1. `list_connections` - 列出数据库连接

**用途**：查看所有配置的命名连接及连通状态。

**调用**：空参数

**输出示例**：
```
| 连接名   | 地址              | 数据库   | 状态 |
|----------|-------------------|----------|------|
| order-db | 192.168.1.100:3306 | orders   | 可用 |
```

---

### 2. `query` - 执行只读 SQL 查询

**用途**：执行 SELECT/SHOW/DESCRIBE/EXPLAIN 语句。

**参数**：
- `sql` (必填)：只读 SQL 语句
- `connection` (可选)：连接名，多库时必须指定
- `limit` (可选)：期望最大行数

**调用示例**：
```json
{ "sql": "SELECT * FROM users LIMIT 10" }
```

**特性**：
- 自动为无 LIMIT 的 SELECT 附加 `defaultLimit`
- 超限自动钳制到 `maxLimit` 并提示
- 返回 Markdown 表格 + JSON 原始数据

---

### 3. `describe_table` - 查看表结构

**用途**：查看表的字段结构和表注释。

**参数**：
- `table` (必填)：表名
- `connection` (可选)：连接名

**调用示例**：
```json
{ "table": "users", "connection": "order-db" }
```

**输出示例**：
```
## 表结构：users

表注释：用户信息表

| 字段       | 类型        | Null | Key | 默认值 | Extra | 注释     |
|------------|-------------|------|-----|--------|-------|----------||
| id         | int         | NO   | PRI | NULL   |       | 主键     ||
| username   | varchar(50) | YES  |     | NULL   |       | 用户名   ||
| email      | varchar(100)| YES  | UNI | NULL   |       | 邮箱     ||
```

---

### 4. `list_tables` - 列出表清单

**用途**：列出数据库中的所有表，支持模糊过滤。

**参数**：
- `connection` (可选)：连接名
- `pattern` (可选)：表名过滤模式（LIKE 风格：% 任意字符，_ 单字符；或普通子串）

**调用示例**：
```json
{ "connection": "order-db", "pattern": "user%" }  // 模糊匹配
```

**输出示例**：
```
| 表名          | 注释        | 估算行数 |
|---------------|-------------|-----------|
| users         | 用户表      | 1000    |
| user_roles    | 用户角色关联 | 500     |
```

---

## 🔧 接入 AI 客户端

## 配置说明

复制 [config.example.json](./config.example.json) 为 `config.json` 并修改。完整字段表：

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `defaultLimit` | 否 | 10 | SELECT 无 LIMIT 时自动附加的行数 |
| `maxLimit` | 否 | 1000 | 行数硬上限，SQL 的 LIMIT 超过时钳制并提示 |
| `connections.*` | 是 | - | 命名连接映射（host/port/user/password/database），密码支持 `${ENV_VAR}` 引用环境变量 |
| `log.enabled` | 否 | true | 总开关 |
| `log.level` | 否 | info | debug/info/warn/error |
| `log.dir` | 否 | ./logs | 日志目录，不存在时自动创建 |
| `log.keepDays` | 否 | 7 | 保留天数，启动时清理过期文件；0 不清理 |

## 🔧 接入 AI 客户端

### ChatGPT (Dev Mode)

1. 打开 ChatGPT 应用，进入 **Settings → Connectors → Developer Mode**
2. 点击 **"Add local MCP Server / 添加本地连接器"**
3. 填入配置：
   - **Name**: `mysql-readonly`
   - **Command**: `node`
   - **Arguments**: `C:/path/to/mysql-readonly-mcp/dist/index.js --config C:/path/to/config.json`
4. 保存并在对话中启用该连接器

**JSON 格式示例**（如界面支持）：
```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "node",
      "args": ["C:/MySQL-Server/dist/index.js", "--config", "C:/MySQL-Server/config.json"]
    }
  }
}
```

---

### Qoder

1. 打开 **Qoder → Settings → MCP**
2. 点击 **"Add MCP Server"**
3. 选择 **"stdio"** 类型，填入配置：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "node",
      "args": ["C:/path/to/mysql-readonly-mcp/dist/index.js", "--config", "C:/path/to/config.json"]
    }
  }
}
```

4. 保存后在新会话中即可使用 MySQL 工具

---

### MCP Inspector（调试用）

开发调试时使用 MCP Inspector 验证工具功能：

```powershell
# 安装（如果未全局安装）
npm i -g @modelcontextprotocol/inspector

# 启动调试器
npx @modelcontextprotocol/inspector node dist/index.js --config config.json
```

在浏览器界面中依次调用 `list_connections`、`list_tables`、`describe_table`、`query` 验证工具功能。

---

## 📝 日志管理
## 📝 日志管理

日志默认保存在 `./logs` 目录（可在配置中自定义），文件名格式：`mysql-mcp-YYYY-MM-DD.log`

### 日志级别

| 级别 | 说明 |
|------|------|
| **debug** | 详细信息，包括 SQL 查询详情、参数等（实时输出到 stderr） |
| **info** | 常规信息，如启动消息、工具调用摘要 |
| **warn** | 警告信息，如白名单拦截记录 |
| **error** | 错误信息，如数据库连接失败 |

### 日志内容示例

```
2026-08-15 22:44:29.123 [INFO] mysql-readonly-mcp 启动，配置文件：config.json，连接数：2
2026-08-15 22:44:30.456 [INFO] tool=query connection=order-db sql="SELECT * FROM users LIMIT 10" rows=10 cost=23ms
2026-08-15 22:45:01.789 [WARN] tool=query rejected=仅允许执行单条 SQL 语句 sql="DROP TABLE users"
2026-08-15 22:45:10.012 [ERROR] tool=describe_table connection=user-db error="认证失败：请检查用户名/密码..."
```

### 安全特性

- 🔒 **绝不记录密码**：所有敏感信息自动脱敏
- 🚫 **SQL 截断**：超过 1000 字符的 SQL 自动截断并显示省略号
- ⏱️ **耗时记录**：每次工具调用记录执行时间
- 🔄 **自动清理**：根据 `log.keepDays` 配置定期清理过期日志

---

## 🧹 开发与维护
2. 选择「Add local MCP Server / 添加本地连接器」，填入名称与启动命令：
   - Command：`node`
   - Arguments：`C:/path/to/mysql-readonly-mcp/dist/index.js --config C:/path/to/config.json`
3. 保存后在对话中启用该连接器，即可让模型调用 list_connections / query 等工具

等价 JSON 配置示例：
```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "node",
      "args": ["C:/path/to/mysql-readonly-mcp/dist/index.js", "--config", "C:/path/to/config.json"]
    }
  }
}
```

## 接入 Qoder

1. 打开 Qoder → Settings → MCP
2. 添加 MCP Server，选择 stdio 类型，填入：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "node",
      "args": ["C:/path/to/mysql-readonly-mcp/dist/index.js", "--config", "C:/path/to/config.json"]
    }
  }
}
```

## 🧹 开发与维护

### 手动运行

```powershell
# 构建项目
npm run build

# 直接运行（配置一个连接时 connection 参数可省略）
node dist/index.js --config config.json
```

### 常见问题

**Q: 提示"未指定配置文件"怎么办？**  
A: 使用 `--config` 参数指定配置文件路径：
```powershell
node dist/index.js --config ./path/to/config.json
```

**Q: 支持多数据库吗？**  
A: 支持！在 `connections` 中配置多个命名连接即可。多库时必须明确指定 `connection` 参数。

**Q: SELECT 不带 LIMIT 会查出所有数据吗？**  
A: 不会。会自动附加 `defaultLimit`(默认 10) 行限制，防止大表查询导致性能问题。

**Q: 如何调试？**  
A: 设置 `log.level = "debug"` 查看详细日志；或使用 MCP Inspector 工具。

---

## 📚 文件结构

```
mysql-readonly-mcp/
├── src/
│   ├── index.ts            # 入口：stdio 传输 + 注册四个工具
│   ├── config.ts           # 配置加载与 zod 校验
│   ├── logger.ts           # 日志系统（零依赖实现）
│   ├── sql-guard.ts        # SQL 白名单校验（AST 分析）
│   ├── pool-manager.ts     # 多库连接池管理
│   ├── format.ts           # Markdown 表格渲染
│   ├── limit.ts            # 行数限制控制
│   └── tools/
│       ├── query.ts              # query 工具实现
│       ├── describe-table.ts     # describe_table 工具实现
│       ├── list-tables.ts        # list_tables 工具实现
│       └── list-connections.ts   # list_connections 工具实现
├── config.example.json     # 配置示例模板
├── config.json             # 实际配置文件（请勿提交到版本控制）
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## ⚡ 核心优势

| 维度 | 说明 |
|------|------|
| 🔒 **安全性** | AST 级 SQL 白名单 + 只读账号双重防护 |
| 🌐 **灵活性** | 支持同一服务器下多个数据库并发查询 |
| 📊 **易用性** | 4 个工具全覆盖常用数据库操作 |
| 📝 **可读性** | Markdown 表格输出，LLM 友好格式 |
| 📏 **可控性** | 自动行限制 + 结果截断，防止资源滥用 |
| 📋 **可观测性** | 详细日志记录，密码脱敏安全 |
| ✅ **标准化** | 符合 MCP 2026-07-28 规范，跨平台兼容 |

---

## 🎯 适用场景

✅ **推荐场景**：
- AI 辅助开发时的需求澄清
- 查看表结构和测试数据
- 临时只读数据查询
- 本地开发环境探查

❌ **不推荐场景**：
- 生产环境写入操作
- HTTP 远程访问需求（可使用 mcp-proxy 转换）
- 需要 ORM 抽象的复杂业务逻辑

---

## 📄 License

MIT License

---

> 💡 **提示**: 本项目专为 AI 客户端设计，如需其他用途请参考文档自行扩展。
