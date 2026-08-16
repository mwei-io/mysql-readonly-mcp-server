// 日志记录器：零依赖实现，级别/目录/保留天数可配置，绝不写 stdout（stdio 协议专用）
import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  dir: string;
  keepDays: number;
}

/** 级别权重：用于阈值过滤 */
const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** 日志文件命名前缀 */
const LOG_FILE_PREFIX = 'mysql-mcp-';

/** 当前生效的日志配置（默认值兜底：enabled 默认 false） */
let config: LogConfig = { enabled: false, level: 'info', dir: './logs', keepDays: 7 };

/** 初始化日志器：保存配置、创建日志目录并清理过期文件 */
export function initLogger(c: LogConfig): void {
  config = c;
  if (config.enabled) {
    fs.mkdirSync(config.dir, { recursive: true });
    cleanupExpiredLogs();
  }
}

/** 清理超过 keepDays 的日志文件；keepDays<=0 时不清理（仅内部使用） */
function cleanupExpiredLogs(): void {
  if (config.keepDays <= 0) return;
  const cutoff = Date.now() - config.keepDays * 86400000;
  for (const name of fs.readdirSync(config.dir)) {
    const m = name.match(/^mysql-mcp-(\d{4})-(\d{2})-(\d{2})\.log$/);
    if (!m) continue;
    const fileTime = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    if (fileTime < cutoff) fs.rmSync(path.join(config.dir, name), { force: true });
  }
}

/** 记录一条日志：级别过滤后写文件；enabled=false 时仅 error 走 stderr；debug 级别回显 stderr */
export function log(level: LogLevel, message: string): void {
  // 净化换行符：防止日志消息（如被拒绝的 SQL）内嵌换行伪造日志行
  const line = `${timestamp()} [${level.toUpperCase()}] ${message.replace(/[\r\n]+/g, ' ')}`;
  if (!config.enabled) {
    if (level === 'error') process.stderr.write(line + '\n');
    return;
  }
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[config.level]) return;
  try {
    fs.appendFileSync(currentFile(), line + '\n');
  } catch (e) {
    process.stderr.write(`日志写入失败：${(e as Error).message}\n`);
  }
  if (config.level === 'debug') process.stderr.write(line + '\n');
}

/** SQL 脱敏截断：超过 max 字符（默认 1000）时截断并加省略号 */
export function truncateSql(sql: string, max = 1000): string {
  return sql.length > max ? sql.slice(0, max) + '…' : sql;
}

/** 当前日期对应的日志文件路径 */
function currentFile(): string {
  return path.join(config.dir, `${LOG_FILE_PREFIX}${localDate(new Date())}.log`);
}

/** 生成本地日期 YYYY-MM-DD 字符串 */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 生成带毫秒的完整时间戳 */
function timestamp(): string {
  const d = new Date();
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** 两位数字补零 */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
