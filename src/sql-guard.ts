// SQL 只读白名单校验：基于 AST 拦截一切非只读语句，是应用层第一道安全防线
import pkg from 'node-sql-parser';
const { Parser } = pkg;

/** MySQL 方言解析器（单例复用） */
const parser = new Parser();

/** AST 解析路径允许的语句类型（SHOW/DESCRIBE 走快捷路径） */
const ALLOWED_AST_TYPES = new Set(['select', 'explain']);

/** DESCRIBE 快捷路径：desc/describe 后接单个标识符 */
const DESCRIBE_PATTERN = /^(desc|describe)\s+[^\s;]+$/i;

/**
 * 扫描 SQL 中的裸分号并检测注释，感知字符串/反引号边界：
 * - 字符串与反引号内的分号属字面量，不影响单语句判定
 * - 注释一律拒绝：MySQL 会执行版本注释（叹号开头的块注释）而解析器会丢弃全部注释，
 *   两者语义偏差可被利用（如把 INTO OUTFILE 藏进版本注释），fail-closed 直接拦截
 */
function scanSemicolonAndComment(sql: string): { hasBareSemicolon: boolean; hasComment: boolean } {
  let hasBareSemicolon = false;
  let hasComment = false;
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    // 进入字符串/反引号字面量，成对引号或反斜杠转义内跳至闭合
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < n) {
        if (sql[i] === '\\') i += 2;
        else if (sql[i] === quote) i += 1;
        else i += 1;
      }
      continue;
    }
    // 块注释（含版本注释 /*!...*/）
    if (ch === '/' && sql[i + 1] === '*') {
      hasComment = true;
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    // 行注释：--（MySQL 要求后随空白或行尾）与 #
    if ((ch === '-' && sql[i + 1] === '-' && (sql[i + 2] === undefined || /[\s]/.test(sql[i + 2]))) || ch === '#') {
      hasComment = true;
      while (i < n && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === ';') hasBareSemicolon = true;
    i += 1;
  }
  return { hasBareSemicolon, hasComment };
}

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
  // 裸分号与注释前置拦截（感知字符串边界）：注释会制造校验器与 MySQL 的语义偏差，宁可误杀不可漏放
  const { hasBareSemicolon, hasComment } = scanSemicolonAndComment(normalized);
  if (hasBareSemicolon) {
    return { allowed: false, reason: '仅允许执行单条 SQL 语句，检测到多条语句' };
  }
  if (hasComment) {
    return { allowed: false, reason: '禁止 SQL 中包含注释（含 /*!...*/ 版本注释），防止绕过只读校验' };
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
  // 执行 SQL 以 AST 重建结果为准：确保实际执行的正是校验过的只读语义，杜绝任何文本层面的歧义
  let rebuilt: string;
  try {
    rebuilt = parser.sqlify(stmt as never, { database: 'MySQL' });
  } catch (e) {
    return { allowed: false, reason: `SQL 重建失败，已拒绝执行：${(e as Error).message}` };
  }
  return { allowed: true, ast: stmt, normalized: rebuilt };
}
