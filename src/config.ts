// 配置文件加载与校验：zod schema、默认值补齐与 ${ENV_VAR} 密码引用替换
import fs from 'node:fs';
import { z } from 'zod';

/** 单个数据库连接的配置结构 */
const ConnectionSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(3306),
  user: z.string().min(1),
  password: z.string(),
  database: z.string().min(1),
});

/** 日志配置结构（全部字段有默认值；enabled 默认 false，即默认不落盘日志） */
const LogSchema = z.object({
  enabled: z.boolean().default(false),
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  dir: z.string().default('./logs'),
  keepDays: z.number().int().min(0).default(7),
});

/** 顶层配置结构 */
const ConfigSchema = z.object({
  defaultLimit: z.number().int().min(1).default(10),
  maxLimit: z.number().int().min(1).default(1000),
  connections: z
    .record(z.string(), ConnectionSchema)
    .refine((c) => Object.keys(c).length > 0, { message: '至少需要一个数据库连接' }),
  log: LogSchema.default({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
export type ConnectionConfig = z.infer<typeof ConnectionSchema>;

/** 解析配置文件路径：优先 --config 参数，其次 MYSQL_MCP_CONFIG 环境变量 */
export function resolveConfigPath(
  argv: string[],
  env: Record<string, string | undefined>,
): string | null {
  const idx = argv.indexOf('--config');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return env.MYSQL_MCP_CONFIG ?? null;
}

/** 
 * 解析 MCP 服务器启动参数：支持直接从命令行传递连接信息
 * 单库：--host h --port 3306 --user u --password p --database db
 * 多库（同服务器）：--host h --user u --password p --database db1 --database db2
 * 多库（异构）：--conn '{"host":"...","port":3306,"user":"...","password":"...","database":"orders"}' --conn '{...}'
 * 全局选项：--max-limit 1000 --log-enabled true --log-level info --log-dir ./logs --log-keep-days 7
 */
export interface McpServerArgs {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  databases: string[];
  conns: Record<string, unknown>[];
  configFile?: string;
  maxLimit?: number;
  logEnabled?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  logDir?: string;
  logKeepDays?: number;
}

/** 将字符串解析为布尔值（true/1/yes 视为 true） */
function toBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

export function parseMcpArgs(argv: string[]): McpServerArgs {
  const args: McpServerArgs = { databases: [], conns: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];

    switch (key) {
      case 'host': args.host = value; i++; break;
      case 'port': args.port = parseInt(value, 10); i++; break;
      case 'user': args.user = value; i++; break;
      case 'password': args.password = value; i++; break;
      case 'config': args.configFile = value; i++; break;
      case 'max-limit': args.maxLimit = parseInt(value, 10); i++; break;
      case 'log-enabled': args.logEnabled = toBool(value); i++; break;
      case 'log-level': args.logLevel = value as McpServerArgs['logLevel']; i++; break;
      case 'log-dir': args.logDir = value; i++; break;
      case 'log-keep-days': args.logKeepDays = parseInt(value, 10); i++; break;
      case 'database': args.databases.push(value); i++; break;
      case 'conn': {
        // --conn 后跟 JSON 字符串，描述一个完整连接
        try {
          const conn = JSON.parse(value) as Record<string, unknown>;
          args.conns.push(conn);
        } catch {
          throw new Error(`--conn 参数不是合法 JSON：${value.slice(0, 60)}...`);
        }
        i++;
        break;
      }
    }
  }

  return args;
}

/** 将字符串中 ${ENV_VAR} 形式引用替换为对应环境变量值；未定义的变量保留原文并记录到 missing 数组 */
export function expandEnvVars(
  value: string,
  env: Record<string, string | undefined>,
): { expanded: string; missing: string[] } {
  const missing: string[] = [];
  const expanded = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name) => {
    if (env[name] !== undefined) return env[name]!;
    if (!missing.includes(name)) missing.push(name);
    return m;
  });
  return { expanded, missing };
}

/** 
 * 根据 MCP 参数生成配置对象（无需 config.json）
 * 支持：单库（--host/--user/--password/--database）、
 * 同服务器多库（重复 --database）、异构多库（重复 --conn JSON）
 */
export function generateConfigFromMcpArgs(args: McpServerArgs, env: Record<string, string | undefined>): AppConfig {
  const connections: Record<string, { host: string; port: number; user: string; password: string; database: string }> = {};

  // 模式 A：--conn JSON 完整连接描述（可多个），连接名统一为 host_database
  args.conns.forEach((conn) => {
    const host = String(conn.host ?? '');
    const database = String(conn.database ?? '');
    const name = `${host}_${database}`;
    if (connections[name]) {
      throw new Error(`连接名重复：${name}`);
    }
    const { expanded, missing } = expandEnvVars(String(conn.password ?? ''), env);
    if (missing.length > 0) {
      process.stderr.write(`[mysql-readonly-mcp] 警告：连接 "${name}" 的密码中引用了未定义的环境变量：${missing.map((v) => '${' + v + '}').join(', ')}，占位符将保留原文\n`);
    }
    connections[name] = {
      host,
      port: Number(conn.port ?? 3306),
      user: String(conn.user ?? ''),
      password: expanded,
      database,
    };
  });

  // 模式 B：共享 host/user/password + 重复 --database（同服务器多库）
  if (args.databases.length > 0) {
    if (!args.host || !args.user) {
      throw new Error('使用 --database 参数时必须同时提供 --host 和 --user');
    }
    const { expanded: password, missing } = args.password
      ? expandEnvVars(args.password, env)
      : { expanded: '', missing: [] as string[] };
    if (missing.length > 0) {
      process.stderr.write(`[mysql-readonly-mcp] 警告：密码中引用了未定义的环境变量：${missing.map((v) => '${' + v + '}').join(', ')}，占位符将保留原文\n`);
    }
    args.databases.forEach((database) => {
      // 连接名统一为 host_database
      const name = `${args.host}_${database}`;
      if (connections[name]) {
        throw new Error(`连接名重复：${name}`);
      }
      connections[name] = {
        host: args.host!,
        port: args.port || 3306,
        user: args.user!,
        password,
        database,
      };
    });
  }

  const config = {
    defaultLimit: 10, // 固定为 10，不接受任何来源的覆盖
    maxLimit: args.maxLimit ?? 1000,
    connections,
    log: {
      enabled: args.logEnabled ?? false,
      level: args.logLevel ?? 'info',
      dir: args.logDir ?? './logs',
      keepDays: args.logKeepDays ?? 7,
    },
  };

  return ConfigSchema.parse(config);
}

/** 判断命令行参数中是否包含连接信息（--database 或 --conn） */
export function hasConnectionArgs(args: McpServerArgs): boolean {
  return args.databases.length > 0 || args.conns.length > 0;
}

/** 合法日志级别集合（用于 --log-level 覆盖前校验） */
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

/**
 * 将命令行全局参数（--max-limit / --log-*）覆盖到环境变量或配置文件加载的配置上。
 * 优先级：命令行参数 > 环境变量 > 配置文件；非法值警告并忽略。
 * 注：defaultLimit 固定为 10，不接受任何来源的覆盖。
 */
export function applyGlobalArgOverrides(config: AppConfig, args: McpServerArgs): AppConfig {
  if (Number.isFinite(args.maxLimit) && (args.maxLimit as number) > 0) {
    config.maxLimit = args.maxLimit as number;
  }
  if (args.logEnabled !== undefined) config.log.enabled = args.logEnabled;
  if (args.logLevel !== undefined) {
    if ((LOG_LEVELS as readonly string[]).includes(args.logLevel)) {
      config.log.level = args.logLevel;
    } else {
      process.stderr.write(`[mysql-readonly-mcp] 警告：--log-level 值非法：${args.logLevel}，保持 ${config.log.level}\n`);
    }
  }
  if (args.logDir !== undefined && args.logDir.trim() !== '') config.log.dir = args.logDir;
  if (Number.isFinite(args.logKeepDays) && (args.logKeepDays as number) >= 0) {
    config.log.keepDays = args.logKeepDays as number;
  }
  return config;
}

/** 判断环境变量中是否包含连接配置（MYSQL_HOST + MYSQL_DATABASE 齐备） */
export function hasEnvConfig(env: Record<string, string | undefined>): boolean {
  return Boolean(env.MYSQL_HOST && env.MYSQL_DATABASE);
}

/** 将环境变量字符串解析为正整数；非法值返回 undefined（交由 zod 默认值处理） */
function parseEnvInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** 将环境变量字符串解析为非负整数（用于 keepDays，0 表示不清理）；非法值返回 undefined */
function parseEnvNonNegInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * 从环境变量生成配置对象（社区标准命名，无需任何命令行参数与配置文件）：
 * MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
 * 其中 MYSQL_DATABASE 支持逗号分隔配置同服务器多库（如 "db1,db2,db3"），
 * 连接名统一为 host_database 格式（如 127.0.0.1_orders）；
 * 可选全局项：MYSQL_MAX_LIMIT / MYSQL_LOG_ENABLED / MYSQL_LOG_LEVEL / MYSQL_LOG_DIR / MYSQL_LOG_KEEP_DAYS
 */
export function loadConfigFromEnv(env: Record<string, string | undefined>): AppConfig {
  const host = env.MYSQL_HOST?.trim();
  const user = env.MYSQL_USER?.trim();
  const databases = (env.MYSQL_DATABASE ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!host || !user) {
    throw new Error('环境变量方式必须提供 MYSQL_HOST 和 MYSQL_USER');
  }
  if (databases.length === 0) {
    throw new Error('环境变量 MYSQL_DATABASE 不能为空');
  }

  const connections: Record<string, { host: string; port: number; user: string; password: string; database: string }> = {};
  for (const database of databases) {
    const name = `${host}_${database}`;
    if (connections[name]) {
      throw new Error(`连接名重复：${name}（MYSQL_DATABASE 中存在重复库名）`);
    }
    connections[name] = {
      host,
      port: parseEnvInt(env.MYSQL_PORT) ?? 3306,
      user,
      password: env.MYSQL_PASSWORD ?? '',
      database,
    };
  }

  const config = {
    defaultLimit: 10, // 固定为 10，不接受环境变量覆盖
    maxLimit: parseEnvInt(env.MYSQL_MAX_LIMIT) ?? 1000,
    connections,
    log: {
      enabled: toBool(env.MYSQL_LOG_ENABLED) ?? false,
      level: (env.MYSQL_LOG_LEVEL as AppConfig['log']['level']) ?? 'info',
      dir: env.MYSQL_LOG_DIR ?? './logs',
      keepDays: parseEnvNonNegInt(env.MYSQL_LOG_KEEP_DAYS) ?? 7,
    },
  };

  return ConfigSchema.parse(config);
}

/** 读取并校验配置文件；失败时抛出含字段路径的中文错误（不含密码值） */
export function loadConfig(
  configPath: string,
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const json = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;

  // defaultLimit 固定为 10，不允许通过配置文件更改；指定了非 10 的值时警告并忽略
  if (json.defaultLimit !== undefined && json.defaultLimit !== 10) {
    process.stderr.write(`[mysql-readonly-mcp] 警告：defaultLimit 固定为 10，已忽略配置文件中的值：${JSON.stringify(json.defaultLimit)}\n`);
  }
  json.defaultLimit = 10;

  const rawConnections = (json.connections ?? {}) as Record<string, Record<string, unknown>>;
  const connections: Record<string, Record<string, unknown>> = {};

  // 展开 database 逗号分隔多库：每个库注册为独立连接，连接名统一为 host_database 格式
  for (const [name, conn] of Object.entries(rawConnections)) {
    const databases = (typeof conn.database === 'string' ? conn.database : '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (databases.length === 0) {
      throw new Error(`配置文件校验失败 → connections.${name}.database: 数据库名不能为空`);
    }
    for (const database of databases) {
      const connName = `${String(conn.host ?? '')}_${database}`;
      if (connections[connName]) {
        throw new Error(`配置文件校验失败 → 连接名重复：${connName}`);
      }
      connections[connName] = { ...conn, database };
    }
  }
  json.connections = connections;

  for (const [connName, conn] of Object.entries(connections)) {
    if (typeof conn.password === 'string') {
      const { expanded, missing } = expandEnvVars(conn.password, env);
      if (missing.length > 0) {
        process.stderr.write(`[mysql-readonly-mcp] 警告：连接 "${connName}" 的密码中引用了未定义的环境变量：${missing.map((v) => '${' + v + '}').join(', ')}，占位符将保留原文\n`);
      }
      conn.password = expanded;
    }
  }
  const parsed = ConfigSchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`配置文件校验失败 → ${detail}`);
  }
  return parsed.data;
}
