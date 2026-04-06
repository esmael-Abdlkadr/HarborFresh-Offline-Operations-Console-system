// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('offline compliance — no external network dependencies in app shell', () => {
  it('index.html contains no external http(s) links', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8')
    const externalLinks = html.match(/https?:\/\/[^\s"']+/g) ?? []
    expect(externalLinks).toEqual([])
  })

  it('index.css does not reference external URLs', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf-8')
    const externalUrls = css.match(/url\(\s*['"]?https?:\/\//g) ?? []
    expect(externalUrls).toEqual([])
  })

  it('index.html uses no Google Fonts preconnect or stylesheet', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8')
    expect(html).not.toMatch(/fonts\.googleapis\.com/)
    expect(html).not.toMatch(/fonts\.gstatic\.com/)
    expect(html).not.toMatch(/preconnect/)
  })
})
