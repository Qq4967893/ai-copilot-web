import { describe, expect, it } from 'vitest'

import { ALLOWED_ELEMENTS, sanitizeUrl } from '@/lib/markdown'

/**
 * XSS 是技术设计 §4.4 的硬要求、§24.1 的重点测试项，所以这一组用例覆盖得比别处密。
 */
describe('sanitizeUrl', () => {
  it.each([
    ['javascript:alert(1)', '最基本的 javascript: 伪协议'],
    ['JaVaScRiPt:alert(1)', '大小写混写'],
    ['JAVASCRIPT:alert(1)', '全大写'],
    ['java\tscript:alert(1)', 'scheme 中间插 TAB'],
    ['java\nscript:alert(1)', 'scheme 中间插换行'],
    ['\u0000javascript:alert(1)', '前导 NUL'],
    ['  javascript:alert(1)', '前导空白'],
    ['data:text/html;base64,PHNjcmlwdD4=', 'data: 可以直接承载 HTML'],
    ['vbscript:msgbox(1)', '老 IE 的伪协议'],
    ['blob:https://example.com/uuid', 'blob:'],
    ['file:///etc/passwd', 'file:'],
    ['//evil.com/path', '协议相对地址会继承当前 scheme 指向外站'],
  ])('挡掉 %s（%s）', (url) => {
    expect(sanitizeUrl(url)).toBe('')
  })

  it.each([
    'https://admin.example.com/users/1',
    'http://10.0.0.5:8000/orders',
    'mailto:ops@example.com',
    '/relative/path',
    'relative/path',
    '#anchor',
  ])('放行 %s', (url) => {
    expect(sanitizeUrl(url)).toBe(url)
  })
})

describe('ALLOWED_ELEMENTS', () => {
  it('不包含 img —— §4.4 没列图片，且 img 是 onerror 载体和对外信标', () => {
    expect(ALLOWED_ELEMENTS).not.toContain('img')
  })

  it('不包含 script / iframe / style 这类可执行或可注入的元素', () => {
    for (const tag of ['script', 'iframe', 'style', 'object', 'embed', 'form', 'input']) {
      expect(ALLOWED_ELEMENTS).not.toContain(tag)
    }
  })

  it('覆盖 §4.4 要求的展示能力', () => {
    // 段落 / 标题 / 有序列表 / 无序列表 / 简单表格 / 行内代码 / 代码块 / 链接
    for (const tag of ['p', 'h1', 'ol', 'ul', 'table', 'code', 'pre', 'a']) {
      expect(ALLOWED_ELEMENTS).toContain(tag)
    }
  })
})
