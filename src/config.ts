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

/** 日志配置结构（全部字段有默认值） */
const LogSchema = z.object({
  enabled: z.boolean().default(true),
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

/** 将字符串中 ${ENV_VAR} 形式引用替换为对应环境变量值（未定义时保留原文） */
export function expandEnvVars(value: string, env: Record<string, string | undefined>): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name) => env[name] ?? m);
}

/** 读取并校验配置文件；失败时抛出含字段路径的中文错误（不含密码值） */
export function loadConfig(
  configPath: string,
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const json = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const connections = (json.connections ?? {}) as Record<string, { password?: unknown }>;
  for (const conn of Object.values(connections)) {
    if (typeof conn.password === 'string') conn.password = expandEnvVars(conn.password, env);
  }
  const parsed = ConfigSchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`配置文件校验失败 → ${detail}`);
  }
  return parsed.data;
}
