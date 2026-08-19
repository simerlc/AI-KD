// ─── 命名工具 ─────────────────────────────────────────────
// 与 Builder 生成约定保持一致（见 builder.ts）：
//   - 页面文件名 = `src/pages/{page.id}.tsx`（例如 page_home → src/pages/page_home.tsx）
//   - 页面组件导出名 = `Page{PageId 的 PascalCase}`（例如 page_home → PageHome）

/** 把任意 id（如 'page_home'）转成 PascalCase（'PageHome'） —— 用于组件导出名 */
export function pascalCase(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
}

/** 计算页面组件导出名（与 Builder.pageComponentName 一致：page_home → PageHome） */
export function pageComponentName(pageId: string): string {
  return (
    'Page' +
    pageId
      .split('_')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')
  )
}

/** 计算页面文件相对路径（与 Builder 一致：page_home → src/pages/page_home.tsx） */
export function pageFilePath(pageId: string): string {
  return `src/pages/${pageId}.tsx`
}
