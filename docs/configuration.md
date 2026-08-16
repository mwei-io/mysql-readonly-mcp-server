# 配置方式

> 📖 本文档系统介绍 mysql-readonly-mcp-server 的三种配置方式及其优先级。安装步骤见 [安装](./install.md)，项目介绍见 [README](../README.md)。

## 目录

- [配置优先级总览](#配置优先级总览)
- [方式一：环境变量方式（推荐）](#方式一环境变量方式推荐)
- [方式二：命令行参数方式](#方式二命令行参数方式)
- [方式三：配置文件方式](#方式三配置文件方式)
- [密码环境变量说明](#密码环境变量说明)

---

## 配置优先级总览

三种配置方式可同时存在时，按以下优先级从高到低生效：

| 优先级 | 配置源 | 适用场景 |
|--------|--------|----------|
| 1（最高） | **命令行参数**（`args` 中的 `--host` / `--database` / `--conn` 等） | 显式指定、临时覆盖 |
| 2 | **环境变量**（`env` 中的 `MYSQL_*`） | MCP 客户端主流做法，推荐 |
| 3（最低） | **配置文件**（`--config` 或 `MYSQL_MCP_CONFIG` 指定的 JSON） | 连接数多、集中管理 |

补充规则：

- 命令行全局参数（`--max-limit` / `--log-*`）可叠加覆盖环境变量或配置文件中的同名项（非法值警告并忽略）；
- `defaultLimit`（无 LIMIT 语句的默认行数）**固定为 10**，不接受任何来源的覆盖；
- 连接名规则：统一为 `host_database` 格式（如 `127.0.0.1_db`），不支持自定义连接名；
- 每个 mcpServers 条目都是独立进程，配置需逐条写一遍，MCP 规范不存在跨条目共享的配置；
- 三者均无有效配置时，Server 输出用法提示并退出。

---

## 方式一：环境变量方式（推荐）

连接信息全部写在 mcpServers JSON 的 `env` 字段，`args` 只保留包名，无需绝对路径、无任何数据库参数，是 MCP 社区主流做法。

### 全量环境变量列表

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `MYSQL_HOST` | ✅ | 无（必填） | MySQL 服务器地址 |
| `MYSQL_PORT` | 否 | 3306 | MySQL 端口 |
| `MYSQL_USER` | ✅ | 无（必填） | 数据库用户名（建议使用只读账号） |
| `MYSQL_PASSWORD` | 否 | 空 | 密码 |
| `MYSQL_DATABASE` | ✅ | 无（必填） | 数据库名；**逗号分隔可配多库**，每个库自动注册为独立连接，连接名为 `host_database` 格式 |
| `MYSQL_MAX_LIMIT` | 否 | 1000 | 行数硬上限 |
| `MYSQL_LOG_ENABLED` | 否 | false | 日志开关（true/1/yes/on 开启；默认关闭，仅 error 写 stderr） |
| `MYSQL_LOG_LEVEL` | 否 | info | 日志级别：debug/info/warn/error |
| `MYSQL_LOG_DIR` | 否 | ./logs | 日志目录 |
| `MYSQL_LOG_KEEP_DAYS` | 否 | 7 | 日志保留天数（0 表示不清理） |
| `MYSQL_MCP_CONFIG` | 否 | - | 配置文件路径（仅当无连接参数与环境变量时作为配置文件方式生效） |

### 案例 1：单服务配置（同服务器/账号，支持多库）

**单库**：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp-server"],
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

**多库**：`MYSQL_DATABASE` 逗号分隔即可，每个库自动注册为命名连接（如 `127.0.0.1_db1`、`127.0.0.1_db2`）：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp-server"],
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "db1,db2,db3"
      }
    }
  }
}
```

### 案例 2：多服务配置（不同服务器/账号）

不同服务器或账号无法共享同一份 `env`，注册多个 mcpServers 条目即可，每个条目是独立进程、`env` 天然隔离：

```json
{
  "mcpServers": {
    "mysql-db1": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp-server"],
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_USER": "readonly_db1",
        "MYSQL_PASSWORD": "db1_password",
        "MYSQL_DATABASE": "db1"
      }
    },
    "mysql-db2": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp-server"],
      "env": {
        "MYSQL_HOST": "127.0.0.2",
        "MYSQL_PORT": "3307",
        "MYSQL_USER": "readonly_db2",
        "MYSQL_PASSWORD": "db2_password",
        "MYSQL_DATABASE": "db2,db02"
      }
    }
  }
}
```

---

## 方式二：命令行参数方式

连接信息写在 `args` 数组中，优先级最高，适合显式指定或临时覆盖。密码字段支持 `${ENV_VAR}` 占位符（见 [密码环境变量说明](#密码环境变量说明)）。

### 参数说明

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `--host` | 使用 `--database` 时必填 | - | MySQL 服务器地址（各库共享） |
| `--port` | 否 | 3306 | MySQL 端口（各库共享） |
| `--user` | 使用 `--database` 时必填 | - | 数据库用户名（各库共享，建议使用只读账号） |
| `--password` | 否 | - | 密码（各库共享），支持 `${ENV_VAR}` 引用环境变量 |
| `--database` | 二选一 | - | 数据库名，可重复出现以配置多个库 |
| `--conn` | 二选一 | - | 完整连接 JSON（含 host/port/user/password/database），可重复出现 |
| `--config` | 否 | - | 配置文件路径（见 [方式三](#方式三配置文件方式)） |
| `--max-limit` | 否 | 1000 | 行数硬上限 |
| `--log-enabled` | 否 | false | 日志开关（默认关闭，需显式传 `--log-enabled true` 开启） |
| `--log-level` | 否 | info | 日志级别：debug/info/warn/error |
| `--log-dir` | 否 | ./logs | 日志目录 |
| `--log-keep-days` | 否 | 7 | 日志保留天数（0 表示不清理） |

### 案例 1：单服务配置（同服务器/账号，支持多库）

共享 `--host` / `--user` / `--password`，重复 `--database` 配置多库，连接名统一为 `host_database`（如 `127.0.0.1_db1`）：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "node",
      "args": [
        "C:/path/to/mysql-readonly-mcp/dist/index.js",
        "--host", "127.0.0.1",
        "--port", "3306",
        "--user", "readonly_user",
        "--password", "${MYSQL_READONLY_PASSWORD}",
        "--database", "db1",
        "--database", "db2",
        "--database", "db3"
      ]
    }
  }
}
```

### 案例 2：多服务配置（不同服务器/账号）

重复 `--conn`，每个后跟一个完整连接 JSON 字符串（连接名仍统一为 `host_database`）：

```json
{
  "mcpServers": {
    "mysql-readonly": {
      "command": "node",
      "args": [
        "C:/path/to/mysql-readonly-mcp/dist/index.js",
        "--conn", "{\"host\":\"127.0.0.1\",\"port\":3306,\"user\":\"readonly_user\",\"password\":\"${MYSQL_READONLY_PASSWORD}\",\"database\":\"db1\"}",
        "--conn", "{\"host\":\"127.0.0.2\",\"port\":3307,\"user\":\"log_reader\",\"password\":\"${MYSQL_LOG_PASSWORD}\",\"database\":\"db2\"}"
      ]
    }
  }
}
```

### 混合模式：env 连接 + args 全局参数

连接信息放 `env`，行数上限与日志等全局参数放 `args`，命令行参数会叠加覆盖 env 中的同名项（非法值警告并忽略）：

```json
{
  "mcpServers": {
    "mysql-db": {
      "command": "npx",
      "args": ["-y", "mysql-readonly-mcp-server", "--max-limit", "50", "--log-enabled", "true", "--log-level", "info", "--log-dir", "./logs", "--log-keep-days", "7"],
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "db"
      }
    }
  }
}
```

---

## 方式三：配置文件方式

适用于连接数多、需要集中管理的场景。复制仓库根目录的 [config.example.json](../config.example.json) 为 `config.json` 并修改。

### 指定配置文件

两种方式任选其一（`--config` 参数优先）：

- 命令行参数：`node dist/index.js --config C:/path/to/config.json`
- 环境变量：`MYSQL_MCP_CONFIG=C:/path/to/config.json`

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

### config.example.json 结构说明

```json
{
  "maxLimit": 1000,
  "connections": {
    "user-db": {
      "host": "127.0.0.1",
      "port": 3306,
      "user": "readonly_user",
      "password": "${MYSQL_READONLY_PASSWORD}",
      "database": "users,logs"
    },
    "log-db": {
      "host": "127.0.0.2",
      "port": 3307,
      "user": "readonly_user",
      "password": "${MYSQL_LOG_PASSWORD}",
      "database": "logs"
    }
  },
  "log": {
    "enabled": false,
    "level": "info",
    "dir": "./logs",
    "keepDays": 7
  }
}
```

### connections 配置格式

`connections` 为连接的映射（键仅作分组标识，不作为连接名），**至少需要一个连接**，连接名统一自动生成为 `host_database` 格式。每个连接的字段如下：

| 字段 | 必填 | 默认值 | 说明                                                                                         |
|------|------|--------|--------------------------------------------------------------------------------------------|
| `host` | ✅ | - | MySQL 服务器地址                                                                                |
| `port` | 否 | 3306 | MySQL 端口                                                                                   |
| `user` | ✅ | - | 数据库用户名（建议使用只读账号）                                                                           |
| `password` | 否 | 空 | 密码，支持 `${ENV_VAR}` 引用环境变量                                                                  |
| `database` | ✅ | - | 数据库名；**逗号分隔可配同服务器多库**（如 `"db1,db2"`），每个库自动展开为独立连接，连接名统一为 `host_database` 格式 |

### 全局参数配置

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `maxLimit` | 否 | 1000 | 行数硬上限 |
| `defaultLimit` | - | 10（固定） | **固定为 10，不允许在配置文件中更改**；指定其他值会被忽略并输出警告 |
| `log.enabled` | 否 | false | 日志开关，默认关闭，需落盘日志时显式设为 `true` |
| `log.level` | 否 | info | 日志级别：debug/info/warn/error |
| `log.dir` | 否 | ./logs | 日志目录 |
| `log.keepDays` | 否 | 7 | 日志保留天数（0 表示不清理） |

---

## 密码环境变量说明

命令行参数与配置文件中的密码字段支持 `${ENV_VAR}` 占位符，从本 Server 进程的 `process.env` 中读取实际值。定义环境变量有两种途径：

| 方式 | 做法 | 适用场景 |
|------|------|----------|
| **mcpServers `env` 字段** | 在 MCP 客户端 JSON 配置中添加 `"env": { "MYSQL_READONLY_PASSWORD": "xxx" }` | 推荐：变量仅对 MCP 子进程可见，不污染系统环境 |
| **操作系统环境变量** | 在 Windows「系统属性 → 环境变量」或 shell profile 中设置 `MYSQL_READONLY_PASSWORD=xxx` | 适合多项目共享同一密码、或不支持 `env` 字段的 MCP 客户端 |

> ⚠️ **注意区分**：`env` 字段是 MCP 客户端（如 Qoder、Claude Desktop）在启动子进程时注入的，并非本 Server 自身的功能。如果 MCP 客户端不支持 `env` 字段，则必须在操作系统层面预先配置环境变量。
>
> 若引用的环境变量未定义，Server 启动时会在 stderr 输出警告（如 `警告：密码中引用了未定义的环境变量：${MYSQL_READONLY_PASSWORD}`），占位符将保留原文，可能导致数据库连接失败。

---

📚 **上一篇**：[安装](./install.md) · **返回**：[README](../README.md)
