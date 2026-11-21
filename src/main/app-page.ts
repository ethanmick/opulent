import type { WebContents } from 'electron'

function pageKey(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined
  const { protocol, host, pathname } = new URL(url)
  return `${protocol}//${host}${pathname}`
}

/** True when both URLs name the same document, ignoring query and fragment. */
export function isSamePage(candidate: string, page: string): boolean {
  const key = pageKey(candidate)
  return key !== undefined && key === pageKey(page)
}

/** Keeps a window on the app page: no navigation away, no new windows. */
export function lockToPage(
  contents: Pick<WebContents, 'on' | 'setWindowOpenHandler'>,
  page: string
): void {
  const blockOtherPages = (details: {
    url: string
    preventDefault(): void
  }) => {
    if (!isSamePage(details.url, page)) details.preventDefault()
  }
  contents.on('will-navigate', blockOtherPages)
  contents.on('will-redirect', blockOtherPages)
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
}
