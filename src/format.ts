// Markdown 表格渲染与结果截断：将查询行数据转为 LLM 友好的表格文本

/** 单元格最大长度（超过截断） */
export const MAX_CELL_LENGTH = 200;

/** 结果文本总长上限（超过截断） */
export const MAX_TOTAL_LENGTH = 30000;

/** 将值转为单元格文本：null 显示 NULL，竖线转义，换行转 <br> */
export function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? 'NULL' : String(value);
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/** 超长单元格截断至 MAX_CELL_LENGTH 并追加省略号 */
export function truncateCell(value: unknown): string {
  const s = escapeCell(value);
  return s.length > MAX_CELL_LENGTH ? s.slice(0, MAX_CELL_LENGTH) + '…' : s;
}

/** 将查询结果行渲染为 Markdown 表格；空结果返回提示语 */
export function toMarkdownTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '查询成功，返回 0 行';
  const columns = Object.keys(rows[0]);
  const lines = [
    '| ' + columns.join(' | ') + ' |',
    '|' + columns.map(() => ' --- ').join('|') + '|',
    ...rows.map((r) => '| ' + columns.map((c) => truncateCell(r[c])).join(' | ') + ' |'),
  ];
  return lines.join('\n');
}

/** 组装最终结果文本：表格 + 行数统计 + 提示语；总长超限时截断 */
export function renderQueryResult(rows: Record<string, unknown>[], notices: string[] = []): string {
  let text = toMarkdownTable(rows);
  if (rows.length > 0) text += `\n\n共 ${rows.length} 行`;
  for (const n of notices) text += `\n\n⚠️ ${n}`;
  if (text.length > MAX_TOTAL_LENGTH) {
    text = text.slice(0, MAX_TOTAL_LENGTH) + '\n\n⚠️ 结果过大已截断，请缩小查询范围';
  }
  return text;
}
