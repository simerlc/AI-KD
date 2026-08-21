import { describe, it, expect } from 'vitest'
import { extractJson } from '../utils'

describe('extractJson', () => {
  it('解析纯 JSON', () => {
    expect(extractJson('{"name":"a","n":1}')).toEqual({ name: 'a', n: 1 })
  })

  it('解析被 ```json 代码块包裹的 JSON（前后带说明文字）', () => {
    const text = '好的，下面是应用模型：\n```json\n{"name":"app","schema":{"pages":[]}}\n```\n如有需要请继续。'
    expect(extractJson(text)).toEqual({ name: 'app', schema: { pages: [] } })
  })

  it('解析 ```JSON 大写标签 + 空格变体', () => {
    const text = '```JSON  \n{"x":1}\n```'
    expect(extractJson(text)).toEqual({ x: 1 })
  })

  it('解析无语言标签的 ``` code 块', () => {
    const text = '```\n{"y":[1,2,3]}\n```'
    expect(extractJson(text)).toEqual({ y: [1, 2, 3] })
  })

  it('解析多个代码块时取最后一个有效 JSON', () => {
    const text = '```json\n{"bad":\n```\n```json\n{"ok":true}\n```'
    expect(extractJson(text)).toEqual({ ok: true })
  })

  it('移除 <think> 推理标签后再解析', () => {
    const text = '<think>让我想想</think>\n{"a":"b"}'
    expect(extractJson(text)).toEqual({ a: 'b' })
  })

  it('从前后有额外文本的响应中提取括号内容', () => {
    const text = '结果如下：{"name":"todo","schema":{"pages":[],"routes":[],"dataSources":[]}} 请查收'
    expect(extractJson(text)).toEqual({ name: 'todo', schema: { pages: [], routes: [], dataSources: [] } })
  })

  it('提取数组形态', () => {
    expect(extractJson('数据是：[{"id":"1"},{"id":"2"}]')).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('修复行尾多余逗号', () => {
    expect(extractJson('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 })
  })

  it('修复键名缺失引号（{ name: "x" }）', () => {
    expect(extractJson('{ name: "x", count: 3 }')).toEqual({ name: 'x', count: 3 })
  })

  it('修复单引号键名（{ \'key\': "val" }）', () => {
    expect(extractJson("{ 'key': 'val' }")).toEqual({ key: 'val' })
  })

  it('修复字符串内部的裸换行', () => {
    expect(extractJson('{"note":"第一行\n第二行"}')).toEqual({ note: '第一行 第二行' })
  })

  it('无法解析时返回 null', () => {
    expect(extractJson('完全不是 JSON 的内容')).toBeNull()
    expect(extractJson('')).toBeNull()
    expect(extractJson('{ 未闭合')).toBeNull()
  })
})
