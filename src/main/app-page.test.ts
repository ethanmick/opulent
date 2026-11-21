import { describe, expect, it, vi } from 'vitest'
import { isSamePage, lockToPage } from './app-page'

const PAGE = 'file:///Applications/opulent.app/renderer/dist/index.html'
const DEV_PAGE = 'http://localhost:5173'

describe('isSamePage', () => {
  it.each([
    [PAGE, PAGE],
    [`${PAGE}#accounts`, PAGE],
    [`${PAGE}?tab=1`, PAGE],
    ['http://localhost:5173/', DEV_PAGE],
    ['http://localhost:5173/?t=1', DEV_PAGE],
  ])('accepts %s as %s', (candidate, page) => {
    expect(isSamePage(candidate, page)).toBe(true)
  })

  it.each([
    ['file:///Users/me/Downloads/evil.html', PAGE],
    [`${PAGE}.evil`, PAGE],
    ['file:///Applications/opulent.app/renderer/dist/', PAGE],
    ['https://example.com/', PAGE],
    ['http://localhost:5174/', DEV_PAGE],
    ['https://localhost:5173/', DEV_PAGE],
    ['http://localhost:5173/other', DEV_PAGE],
    ['http://localhost:5173.example.com/', DEV_PAGE],
    ['about:blank', PAGE],
    ['', PAGE],
    ['not a url', PAGE],
  ])('rejects %s as %s', (candidate, page) => {
    expect(isSamePage(candidate, page)).toBe(false)
  })
})

describe('lockToPage', () => {
  function lockedContents() {
    const handlers: Record<string, (details: unknown) => void> = {}
    let openHandler!: (details: { url: string }) => unknown
    lockToPage(
      {
        on: (event: string, handler: (details: never) => void) =>
          (handlers[event] = handler as (details: unknown) => void),
        setWindowOpenHandler: (handler: typeof openHandler) =>
          (openHandler = handler),
      } as never,
      PAGE
    )
    const attempt = (event: string, url: string) => {
      const details = { url, preventDefault: vi.fn<() => void>() }
      handlers[event](details)
      return details.preventDefault.mock.calls.length > 0
    }
    return { attempt, open: (url: string) => openHandler({ url }) }
  }

  it.each(['will-navigate', 'will-redirect'])(
    'blocks %s to another page',
    (event) => {
      const { attempt } = lockedContents()

      expect(attempt(event, 'https://example.com/')).toBe(true)
      expect(attempt(event, 'file:///Users/me/Downloads/evil.html')).toBe(true)
    }
  )

  it('lets the app page reload itself', () => {
    const { attempt } = lockedContents()

    expect(attempt('will-navigate', PAGE)).toBe(false)
  })

  it('refuses to open new windows', () => {
    const { open } = lockedContents()

    expect(open('https://example.com/')).toEqual({ action: 'deny' })
    expect(open(PAGE)).toEqual({ action: 'deny' })
  })
})
