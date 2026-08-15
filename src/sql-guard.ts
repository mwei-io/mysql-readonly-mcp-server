// SQL 只读白名单校验：基于 AST 拦截一切非只读语句，是应用层第一道安全防线
import pkg from 'node-sql-parser';
const { Parser } = pkg;

/** MySQL 方言解析器（单例复用） */
const parser = new Parser();

/** AST 解析路径允许的语句类型（SHOW/DESCRIBE 走快捷路径） */
const ALLOWED_AST_TYPES = new Set(['select', 'explain']);

/** DESCRIBE 快捷路径：desc/describe 后接单个标识符 */
const DESCRIBE_PATTERN = /^(desc|describe)\s+[^\s;]+$/i;

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  ast?: unknown;
  normalized?: string;
}

/** 校验 SQL 是否为单条只读语句；返回放行结果、中文拒绝原因、AST 与规范化 SQL */
export function checkReadOnly(sql: string): GuardResult {
  const normalized = sql.trim().replace(/;+\s*$/, '');
  if (!normalized) {
    return { allowed: false, reason: 'SQL 不能为空' };
  }
  // 分号前置拦截：字符串/注释内的分号同样拒绝，属保守的 fail-closed 策略（宁可误杀不可漏放）
  if (normalized.includes(';')) {
    return { allowed: false, reason: '仅允许执行单条 SQL 语句，检测到多条语句' };
  }
  // DESCRIBE 快捷路径：node-sql-parser 对 DESC 语法支持有限，该模式无注入面
  if (DESCRIBE_PATTERN.test(normalized)) return { allowed: true, normalized };
  // SHOW 快捷路径：SHOW 语句族纯元数据读取，无写入风险
  // 依赖前提：分号已前置拦截（无法拼接后续危险语句），且 SHOW 语法本身无写入面
  if (/^show\b/i.test(normalized)) return { allowed: true, normalized };
  let ast: unknown;
  try {
    ast = parser.astify(normalized, { database: 'MySQL' });
  } catch (e) {
    return { allowed: false, reason: `SQL 解析失败，已拒绝执行：${(e as Error).message}` };
  }
  const stmts = Array.isArray(ast) ? ast : [ast];
  if (stmts.length !== 1) {
    return { allowed: false, reason: '仅允许执行单条 SQL 语句' };
  }
  const stmt = stmts[0] as { type: string; into?: unknown };
  if (!ALLOWED_AST_TYPES.has(stmt.type)) {
    return {
      allowed: false,
      reason: `仅允许只读语句（SELECT/SHOW/DESCRIBE/EXPLAIN），检测到 ${stmt.type} 语句`,
    };
  }
  // 部分版本对普通 SELECT 也会生成 into: { position: null } 占位，需排除后仅拦截真实 INTO 子句
  const into = stmt.into as { position?: unknown } | undefined;
  const hasInto = into != null && (typeof into !== 'object' || into.position != null);
  if (stmt.type === 'select' && hasInto) {
    return { allowed: false, reason: '禁止 SELECT ... INTO 语法（OUTFILE/DUMPFILE/变量赋值）' };
  }
  return { allowed: true, ast: stmt, normalized };
}
