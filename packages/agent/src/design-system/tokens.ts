// ─── AI Native Design System · Design Tokens ──────────────
//
// AI快搭 统一设计体系的唯一事实来源（Single Source of Truth）。
// 所有 AI 生成应用的 UI 必须引用这里的 token，禁止硬编码颜色/间距/字体/圆角/阴影。
//
// 目标风格：类似 Vercel / Linear / Notion / Stripe 的现代 SaaS 视觉语言。
//
// 这些 token 会被 Builder 以两种形式注入到生成应用中：
//   1. CSS 变量（:root 上定义，生成应用通过 var(--ds-*) 引用）
//   2. 供组件库（design-system/components）在生成时拼接类名/内联样式

/** 颜色令牌：语义色板 */
export interface ColorTokens {
  primary: string
  primaryHover: string
  primaryActive: string
  primarySubtle: string
  secondary: string
  secondaryHover: string
  background: string
  surface: string
  surfaceHover: string
  surfaceRaised: string
  border: string
  borderStrong: string
  text: string
  textSecondary: string
  textTertiary: string
  textOnPrimary: string
  success: string
  successSubtle: string
  warning: string
  warningSubtle: string
  error: string
  errorSubtle: string
  info: string
  infoSubtle: string
  focus: string
  overlay: string
}

/** 排版令牌 */
export interface TypographyTokens {
  fontFamily: string
  fontFamilyMono: string
  size: {
    xs: string
    sm: string
    base: string
    lg: string
    xl: string
    '2xl': string
    '3xl': string
    '4xl': string
  }
  weight: {
    regular: number
    medium: number
    semibold: number
    bold: number
  }
  lineHeight: {
    tight: string
    normal: string
    relaxed: string
  }
}

/** 间距令牌（4px 基准栅格） */
export interface SpacingTokens {
  /** 1 = 4px */
  [key: string]: string
}

/** 圆角令牌 */
export interface RadiusTokens {
  small: string
  medium: string
  large: string
  xl: string
  full: string
}

/** 阴影令牌 */
export interface ShadowTokens {
  card: string
  modal: string
  floating: string
  none: string
}

/** Design Tokens 全量定义 */
export interface DesignTokens {
  colors: ColorTokens
  typography: TypographyTokens
  spacing: SpacingTokens
  radius: RadiusTokens
  shadows: ShadowTokens
}

/** 间距标尺：基于 4px 的 8 级栅格（4/8/12/16/24/32/48/64） */
export const SPACING_SCALE = [4, 8, 12, 16, 24, 32, 48, 64] as const

/** 默认（浅色）设计令牌 */
export const DEFAULT_TOKENS: DesignTokens = {
  colors: {
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    primaryActive: '#1e40af',
    primarySubtle: '#eff6ff',
    secondary: '#6b7280',
    secondaryHover: '#4b5563',
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceHover: '#f1f5f9',
    surfaceRaised: '#ffffff',
    border: '#e2e8f0',
    borderStrong: '#cbd5e1',
    text: '#0f172a',
    textSecondary: '#475569',
    textTertiary: '#94a3b8',
    textOnPrimary: '#ffffff',
    success: '#16a34a',
    successSubtle: '#f0fdf4',
    warning: '#d97706',
    warningSubtle: '#fffbeb',
    error: '#dc2626',
    errorSubtle: '#fef2f2',
    info: '#2563eb',
    infoSubtle: '#eff6ff',
    focus: '#2563eb',
    overlay: 'rgba(15, 23, 42, 0.45)',
  },
  typography: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontFamilyMono: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
    size: {
      xs: '12px',
      sm: '13px',
      base: '14px',
      lg: '16px',
      xl: '18px',
      '2xl': '20px',
      '3xl': '24px',
      '4xl': '30px',
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    },
  },
  spacing: {
    '0': '0px',
    '1': '4px',
    '2': '8px',
    '3': '12px',
    '4': '16px',
    '5': '20px',
    '6': '24px',
    '8': '32px',
    '10': '40px',
    '12': '48px',
    '16': '64px',
    '20': '80px',
  },
  radius: {
    small: '6px',
    medium: '8px',
    large: '12px',
    xl: '16px',
    full: '9999px',
  },
  shadows: {
    none: 'none',
    card: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
    modal: '0 20px 40px rgba(15, 23, 42, 0.18), 0 8px 16px rgba(15, 23, 42, 0.10)',
    floating: '0 8px 24px rgba(15, 23, 42, 0.14)',
  },
}

/** 语义变体（供组件库与生成代码引用） */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'small' | 'medium' | 'large'

/**
 * 将 Design Tokens 序列化为 CSS 变量定义（:root 块）。
 * 生成应用通过 var(--ds-color-primary) 等方式引用，实现与设计系统解耦。
 */
export function tokensToCssVariables(tokens: DesignTokens = DEFAULT_TOKENS): string {
  const c = tokens.colors
  const t = tokens.typography
  const s = tokens.spacing
  const r = tokens.radius
  const sh = tokens.shadows

  const colorVars = Object.entries(c)
    .map(([k, v]) => `  --ds-color-${k}: ${v};`)
    .join('\n')
  const spaceVars = Object.entries(s)
    .map(([k, v]) => `  --ds-space-${k}: ${v};`)
    .join('\n')
  const radiusVars = Object.entries(r)
    .map(([k, v]) => `  --ds-radius-${k}: ${v};`)
    .join('\n')
  const shadowVars = Object.entries(sh)
    .map(([k, v]) => `  --ds-shadow-${k}: ${v};`)
    .join('\n')

  return `:root {
  /* 颜色 */
${colorVars}

  /* 排版 */
  --ds-font-family: ${t.fontFamily};
  --ds-font-mono: ${t.fontFamilyMono};
  --ds-font-size-xs: ${t.size.xs};
  --ds-font-size-sm: ${t.size.sm};
  --ds-font-size-base: ${t.size.base};
  --ds-font-size-lg: ${t.size.lg};
  --ds-font-size-xl: ${t.size.xl};
  --ds-font-size-2xl: ${t.size['2xl']};
  --ds-font-size-3xl: ${t.size['3xl']};
  --ds-font-size-4xl: ${t.size['4xl']};
  --ds-font-weight-regular: ${t.weight.regular};
  --ds-font-weight-medium: ${t.weight.medium};
  --ds-font-weight-semibold: ${t.weight.semibold};
  --ds-font-weight-bold: ${t.weight.bold};
  --ds-line-height-tight: ${t.lineHeight.tight};
  --ds-line-height-normal: ${t.lineHeight.normal};
  --ds-line-height-relaxed: ${t.lineHeight.relaxed};

  /* 间距 */
${spaceVars}

  /* 圆角 */
${radiusVars}

  /* 阴影 */
${shadowVars}
}`
}

/** 根据主色派生出完整色板（用于品牌定制，保持语义一致性） */
export function deriveTokens(
  primaryColor?: string,
  options?: { mode?: 'light' | 'dark'; fontFamily?: string },
): DesignTokens {
  const tokens: DesignTokens = JSON.parse(JSON.stringify(DEFAULT_TOKENS)) as DesignTokens
  if (primaryColor && /^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
    tokens.colors.primary = primaryColor
    tokens.colors.primaryHover = shade(primaryColor, -0.08)
    tokens.colors.primaryActive = shade(primaryColor, -0.16)
    tokens.colors.primarySubtle = tint(primaryColor, 0.94)
    tokens.colors.info = primaryColor
    tokens.colors.infoSubtle = tint(primaryColor, 0.94)
    tokens.colors.focus = primaryColor
  }
  if (options?.fontFamily) {
    tokens.typography.fontFamily = options.fontFamily
  }
  if (options?.mode === 'dark') {
    tokens.colors.background = '#0f172a'
    tokens.colors.surface = '#1e293b'
    tokens.colors.surfaceHover = '#334155'
    tokens.colors.surfaceRaised = '#1e293b'
    tokens.colors.border = '#334155'
    tokens.colors.borderStrong = '#475569'
    tokens.colors.text = '#f1f5f9'
    tokens.colors.textSecondary = '#cbd5e1'
    tokens.colors.textTertiary = '#94a3b8'
  }
  return tokens
}

/** 十六进制颜色加深（factor 为负）或提亮（factor 为正） */
function shade(hex: string, factor: number): string {
  const n = hexToRgb(hex)
  const t = factor < 0 ? 0 : 255
  const p = Math.abs(factor)
  const r = Math.round((t - n.r) * p + n.r)
  const g = Math.round((t - n.g) * p + n.g)
  const b = Math.round((t - n.b) * p + n.b)
  return rgbToHex(r, g, b)
}

/** 与白色按比例混合，得到浅色 tint */
function tint(hex: string, ratio: number): string {
  const n = hexToRgb(hex)
  const r = Math.round(n.r + (255 - n.r) * ratio)
  const g = Math.round(n.g + (255 - n.g) * ratio)
  const b = Math.round(n.b + (255 - n.b) * ratio)
  return rgbToHex(r, g, b)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}
