# mysql-readonly-mcp

> 🚀 **Readonly MySQL MCP Server** — 基于 MCP 协议的只读 MySQL 数据库访问服务，让 AI Agent 安全地查询表结构与数据。

## 📚 文档导航

| 文档 | 内容 |
|------|------|
| [安装](./docs/install.md) | 全局安装（推荐） / 临时运行 / 源码构建三种方式 |
| [配置方式](./docs/configuration.md) | 环境变量（推荐） / 命令行参数 / 配置文件三种配置方式及优先级 |

## ✨ 功能特性

- 🔒 **双重只读保障**：应用层 SQL 白名单（AST 校验）+ 数据库只读账号权限建议
- 🌐 **多库支持**：同时连接同一服务器下的多个数据库，也支持多服务器/多账号（多服务条目）
- 📊 **四个核心工具**：`list_connections` / `query` / `describe_table` / `list_tables`
- ⚙️ **灵活配置**：支持全 `env` 环境变量配置、args 命令行参数与 config.json，三者可叠加、优先级明确
- 📝 **Markdown 输出**：友好的表格格式返回，自动行数和结果截断保护
- 📋 **可配置日志**：级别/目录/保留天数可配，密码绝不记录
- ✅ **MCP 规范**：标准 stdio 传输协议

### 🧰 核心工具说明

| 工具 | 功能 | 主要参数 |
|------|------|----------|
| `list_connections` | 查看所有配置的命名连接及连通状态 | 无 |
| `query` | 执行只读 SQL（SELECT/SHOW/DESCRIBE/EXPLAIN） | `sql`（必填）、`connection`（多库时必须指定）、`limit` |
| `describe_table` | 查看表的字段结构和表注释 | `table`（必填）、`connection` |
| `list_tables` | 列出数据库中所有表，支持模糊过滤 | `connection`、`pattern`（LIKE 风格：% 任意字符，_ 单字符） |

> 💡 无 LIMIT 的 SELECT 会自动附加 `defaultLimit`（固定 10）行限制，超限自动钳制到 `maxLimit`（默认 1000）。

## 🛡️ 安全说明

本 Server 使用 `node-sql-parser` 进行 AST 分析，严格拦截一切非只读语句：

- ✅ **允许**：`SELECT` / `SHOW` / `DESCRIBE` / `EXPLAIN`
- ❌ **拒绝**：`INSERT` / `UPDATE` / `DELETE` / `DROP` / `ALTER` / `CREATE` 等所有写操作

**高级防护**：多语句注入检测（含注释中的分号）、字符串字面量关键词不误杀、`SELECT INTO OUTFILE/DUMPFILE` 拦截、语法错误 SQL 拒绝并给出中文提示。

**强烈建议**使用数据库只读账号作为第二道防线：

```sql
CREATE USER 'readonly_user'@'%' IDENTIFIED BY '<强密码>';
GRANT SELECT, SHOW VIEW ON users.* TO 'readonly_user'@'%';
FLUSH PRIVILEGES;
```

---

## 🚀 快速开始

> 环境要求：Node.js >= 18。更多安装方式（含源码构建）见 [安装](./docs/install.md)，完整配置说明见 [配置方式](./docs/configuration.md)。

在 MCP 客户端（如 Qoder、Claude Desktop、ChatGPT Dev Mode）的 `mcpServers` 配置中添加以下**完整案例**，即可通过 npx 一键拉起并使用：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "npx",
      "args": [
        "-y",
        "mysql-readonly-mcp-server"
      ],
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "db"
      }
    }
  }
}
```

配置完成后重启 MCP 客户端，即可调用 `list_connections` / `query` / `describe_table` / `list_tables` 四个工具。多库、多服务器及命令行参数/配置文件等其他配置方式，请阅读 [配置方式](./docs/configuration.md)。

---

## 📄 License

[MIT License](LICENSE) · Copyright (c) 2026 Mwei
