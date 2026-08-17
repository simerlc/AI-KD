/**
 * 测试脚本：验证 Builder 代码生成 + LocalNodeSandbox 实时预览
 *
 * 不依赖 LLM API Key，直接构造 App Model + 确定性代码生成。
 * 生成一个"待办事项"应用作为测试用例。
 *
 * 运行方式（在 packages/server 目录下）：
 *   $env:SANDBOX_MODE='node'; $env:WORKSPACE_ROOT='../../workspaces'; pnpm exec tsx scripts/test-preview.ts
 */
import { BuilderAgent } from '@aikd/agent'
import type { LLMClient, AppModel } from '@aikd/agent'
import { LocalNodeSandbox } from '../src/sandbox/local-node-sandbox.js'
import { writeWorkspaceFiles, getWorkspacePath } from '../src/lib/workspace.js'
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'

// Mock LLM Client（Builder 不实际调用 LLM，确定性生成）
const mockLLM: LLMClient = {
  async complete() {
    return ''
  },
  async stream() {
    return ''
  },
}

// ─── 构造测试用 App Model：待办事项应用 ─────────────────
function createTodoAppModel(): AppModel {
  return {
    id: 'app_todo_test',
    name: '待办事项',
    type: 'web',
    version: '1.0.0',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    schema: {
      theme: {
        primaryColor: '#3b82f6',
        secondaryColor: '#6b7280',
        backgroundColor: '#ffffff',
        textColor: '#1a1a1a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      dataSources: [],
      pages: [
        {
          id: 'page_home',
          path: '/',
          title: '待办事项',
          layout: 'web',
          components: [
            // 顶部导航
            {
              id: 'c_header',
              type: 'Header',
              props: {
                title: '待办事项',
                background: '#ffffff',
                height: '64px',
              },
            },
            // 主内容区
            {
              id: 'c_main_section',
              type: 'Section',
              props: {
                title: '',
                background: '#f8fafc',
                padding: '48px 24px',
              },
              children: [
                // 标题
                {
                  id: 'c_title',
                  type: 'Heading',
                  props: {
                    text: '我的待办事项',
                    level: 'h1',
                    align: 'center',
                    color: '#1a1a1a',
                  },
                },
                // 描述
                {
                  id: 'c_desc',
                  type: 'Paragraph',
                  props: {
                    text: '高效管理你的日常任务，提升工作效率',
                    fontSize: '16px',
                    lineHeight: '1.6',
                    color: '#666666',
                    align: 'center',
                  },
                },
                // 输入区（横向布局）
                {
                  id: 'c_input_row',
                  type: 'Flex',
                  props: {
                    direction: 'row',
                    justify: 'center',
                    align: 'center',
                    gap: '12px',
                  },
                  children: [
                    {
                      id: 'c_input',
                      type: 'Input',
                      props: {
                        label: '',
                        placeholder: '输入新的待办事项...',
                        type: 'text',
                        required: false,
                      },
                    },
                    {
                      id: 'c_add_btn',
                      type: 'Button',
                      props: {
                        text: '添加',
                        variant: 'primary',
                        size: 'medium',
                        disabled: false,
                      },
                    },
                  ],
                },
                // 待办列表卡片
                {
                  id: 'c_todo_card',
                  type: 'Card',
                  props: {
                    title: '任务列表',
                    shadow: 'medium',
                    radius: '8px',
                    padding: '24px',
                  },
                  children: [
                    // 列表容器
                    {
                      id: 'c_todo_list',
                      type: 'List',
                      props: {
                        gap: '12px',
                        dataSource: 'todos',
                      },
                      children: [
                        // 待办项 1
                        {
                          id: 'c_todo_1',
                          type: 'Flex',
                          props: {
                            direction: 'row',
                            justify: 'flex-start',
                            align: 'center',
                            gap: '12px',
                          },
                          children: [
                            {
                              id: 'c_check_1',
                              type: 'Checkbox',
                              props: {
                                label: '完成项目文档编写',
                                checked: false,
                              },
                            },
                          ],
                        },
                        // 待办项 2
                        {
                          id: 'c_todo_2',
                          type: 'Flex',
                          props: {
                            direction: 'row',
                            justify: 'flex-start',
                            align: 'center',
                            gap: '12px',
                          },
                          children: [
                            {
                              id: 'c_check_2',
                              type: 'Checkbox',
                              props: {
                                label: 'Review 团队代码提交',
                                checked: true,
                              },
                            },
                          ],
                        },
                        // 待办项 3
                        {
                          id: 'c_todo_3',
                          type: 'Flex',
                          props: {
                            direction: 'row',
                            justify: 'flex-start',
                            align: 'center',
                            gap: '12px',
                          },
                          children: [
                            {
                              id: 'c_check_3',
                              type: 'Checkbox',
                              props: {
                                label: '准备周会演示材料',
                                checked: false,
                              },
                            },
                          ],
                        },
                        // 待办项 4
                        {
                          id: 'c_todo_4',
                          type: 'Flex',
                          props: {
                            direction: 'row',
                            justify: 'flex-start',
                            align: 'center',
                            gap: '12px',
                          },
                          children: [
                            {
                              id: 'c_check_4',
                              type: 'Checkbox',
                              props: {
                                label: '部署测试环境应用',
                                checked: false,
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                // 统计信息
                {
                  id: 'c_stats',
                  type: 'Flex',
                  props: {
                    direction: 'row',
                    justify: 'space-around',
                    align: 'center',
                    gap: '24px',
                  },
                  children: [
                    {
                      id: 'c_stat_total',
                      type: 'Card',
                      props: {
                        title: '',
                        shadow: 'small',
                        radius: '8px',
                        padding: '16px 32px',
                      },
                      children: [
                        {
                          id: 'c_stat_total_num',
                          type: 'Heading',
                          props: {
                            text: '4',
                            level: 'h2',
                            align: 'center',
                            color: '#3b82f6',
                          },
                        },
                        {
                          id: 'c_stat_total_label',
                          type: 'Text',
                          props: {
                            text: '总任务',
                            fontSize: '14px',
                            color: '#666666',
                            align: 'center',
                          },
                        },
                      ],
                    },
                    {
                      id: 'c_stat_done',
                      type: 'Card',
                      props: {
                        title: '',
                        shadow: 'small',
                        radius: '8px',
                        padding: '16px 32px',
                      },
                      children: [
                        {
                          id: 'c_stat_done_num',
                          type: 'Heading',
                          props: {
                            text: '1',
                            level: 'h2',
                            align: 'center',
                            color: '#10b981',
                          },
                        },
                        {
                          id: 'c_stat_done_label',
                          type: 'Text',
                          props: {
                            text: '已完成',
                            fontSize: '14px',
                            color: '#666666',
                            align: 'center',
                          },
                        },
                      ],
                    },
                    {
                      id: 'c_stat_pending',
                      type: 'Card',
                      props: {
                        title: '',
                        shadow: 'small',
                        radius: '8px',
                        padding: '16px 32px',
                      },
                      children: [
                        {
                          id: 'c_stat_pending_num',
                          type: 'Heading',
                          props: {
                            text: '3',
                            level: 'h2',
                            align: 'center',
                            color: '#f59e0b',
                          },
                        },
                        {
                          id: 'c_stat_pending_label',
                          type: 'Text',
                          props: {
                            text: '待处理',
                            fontSize: '14px',
                            color: '#666666',
                            align: 'center',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            // 底部
            {
              id: 'c_footer',
              type: 'Footer',
              props: {
                text: 'AI快搭 - 让想法快速变为应用',
                background: '#1e293b',
                color: '#94a3b8',
              },
            },
          ],
        },
      ],
      routes: [
        {
          path: '/',
          pageId: 'page_home',
        },
      ],
    },
  } as AppModel
}

async function main() {
  const appId = 'test-todo-app'
  console.log('═══════════════════════════════════════════════════')
  console.log('  AI快搭 V1 预览测试 - 待办事项应用')
  console.log('═══════════════════════════════════════════════════\n')

  // 1. 构造 App Model
  console.log('[1/5] 构造待办事项 App Model...')
  const appModel = createTodoAppModel()
  console.log(`      应用名称: ${appModel.name}`)
  console.log(`      应用类型: ${appModel.type}`)
  console.log(`      页面数量: ${appModel.schema.pages.length}`)
  console.log(`      组件数量: ${appModel.schema.pages[0].components.length}`)

  // 2. 生成代码
  console.log('\n[2/5] 调用 Builder Agent 生成 React 代码...')
  const builder = new BuilderAgent(mockLLM)
  const { files } = await builder.build({ appModel })
  console.log(`      生成文件数: ${files.length}`)
  console.log('      文件清单:')
  for (const f of files) {
    console.log(`        - ${f.path} (${f.content.length} bytes)`)
  }

  // 3. 写入工作区
  console.log('\n[3/5] 写入工作区文件...')
  const workspacePath = getWorkspacePath(appId)
  console.log(`      工作区路径: ${workspacePath}`)
  await writeWorkspaceFiles(appId, files)

  // 验证 package.json 存在
  const pkgJsonPath = path.join(workspacePath, 'package.json')
  try {
    const stats = await fs.stat(pkgJsonPath)
    console.log(`      package.json: ${stats.size} bytes OK`)
  } catch {
    throw new Error('package.json not generated')
  }

  // 4. 启动沙箱
  console.log('\n[4/5] 启动 LocalNodeSandbox...')
  console.log('      (npm install + vite dev server，预计 30-60 秒)')
  const sandbox = new LocalNodeSandbox()
  const startTime = Date.now()
  const instance = await sandbox.create({ appId })
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`      启动耗时: ${elapsed}s`)
  console.log(`      主机端口: ${instance.hostPort}`)
  console.log(`      预览 URL: ${instance.url}`)

  // 5. 验证预览可访问
  console.log('\n[5/5] 验证预览可访问性...')
  await sleep(2000) // 给 Vite 一点时间完全就绪
  const accessible = await probeUrl(instance.url)
  if (accessible) {
    console.log(`      OK - 预览已就绪: ${instance.url}`)
  } else {
    console.log(`      FAIL - 预览无法访问`)
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  测试完成！预览 URL: ' + instance.url)
  console.log('  按 Ctrl+C 停止沙箱并退出')
  console.log('═══════════════════════════════════════════════════\n')

  // 保持进程运行，等待 Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n[Test] 正在停止沙箱...')
    await sandbox.destroy(appId)
    console.log('[Test] 沙箱已停止')
    process.exit(0)
  })

  // 保持进程不退出
  setInterval(() => {}, 1000)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function probeUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.destroy()
      resolve(res.statusCode !== undefined && res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(5000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

main().catch((err) => {
  console.error('\n[Test] 测试失败:', err instanceof Error ? err.message : err)
  process.exit(1)
})
