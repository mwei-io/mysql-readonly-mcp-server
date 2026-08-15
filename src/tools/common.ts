// 工具公共辅助：统一的 MCP 工具成功/失败结果构造

/** 构造文本成功结果，可选附带结构化内容（供支持 structured output 的客户端使用） */
export function textResult(text: string, structured?: Record<string, unknown>) {
  return structured
    ? { content: [{ type: 'text' as const, text }], structuredContent: structured }
    : { content: [{ type: 'text' as const, text }] };
}

/** 构造错误结果（MCP 标准 isError 语义） */
export function errorResult(message: string) {
  return { isError: true as const, content: [{ type: 'text' as const, text: message }] };
}
