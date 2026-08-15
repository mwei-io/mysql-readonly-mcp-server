// 行数限制：为 SELECT 自动附加默认 LIMIT，并将超限值钳制到硬上限，防止超大结果集
import pkg from 'node-sql-parser';
import type { AST } from 'node-sql-parser';

const { Parser } = pkg;

/** MySQL 方言解析器（单例复用，仅用于钳制时重新生成 SQL） */
const parser = new Parser();

export interface LimitOptions {
  defaultLimit: number;
  maxLimit: number;
  requested?: number;
}

export interface LimitResult {
  sql: string;
  notice?: string;
  /** SELECT 语句最终生效的行数上限（非 SELECT 无此字段） */
  effectiveLimit?: number;
}

/** 将数值钳制到 [1, max] 区间 */
function clamp(n: number, max: number): number {
  return Math.max(1, Math.min(n, max));
}

/** 从 AST 的 limit 节点提取行数上限值（LIMIT 数组最后一个元素）；无 LIMIT 返回 null */
function readAstLimit(ast: unknown): number | null {
  const values = (ast as { limit?: { value?: Array<{ value?: unknown }> } })?.limit?.value;
  if (!Array.isArray(values) || values.length === 0) return null;
  const last = values[values.length - 1];
  return typeof last?.value === 'number' ? last.value : null;
}

/** 改写 SQL 的 LIMIT：无 LIMIT 时附加生效值，超过 maxLimit 时钳制并返回提示 */
export function applyLimit(sql: string, ast: unknown, opts: LimitOptions): LimitResult {
  if ((ast as { type?: string })?.type !== 'select') return { sql };
  const current = readAstLimit(ast);
  if (current === null) {
    const n = clamp(opts.requested ?? opts.defaultLimit, opts.maxLimit);
    return { sql: `${sql} LIMIT ${n}`, effectiveLimit: n };
  }
  if (current <= opts.maxLimit) return { sql, effectiveLimit: current };
  // 钳制：修改 AST 的 LIMIT 数值后重新生成 SQL（保留 offset 只改 count），
  // 避免对原始文本正则替换时被字符串字面量/反引号别名/注释中的 LIMIT 字样误导
  const astObj = ast as { limit: { value: Array<{ value: number }> } };
  astObj.limit.value[astObj.limit.value.length - 1].value = opts.maxLimit;
  const rewritten = parser.sqlify(astObj as unknown as AST, { database: 'MySQL' });
  return { sql: rewritten, notice: `LIMIT 超过硬上限 ${opts.maxLimit}，已自动钳制为 ${opts.maxLimit}`, effectiveLimit: opts.maxLimit };
}
