import type { Plugin } from 'vite'
import { withProductName } from '../../src/shared/oficina-product-name'

// Why: the window title follows the page <title>, so it is renamed in the built HTML from the identity module.
export function createProductTitlePlugin(): Plugin {
  return {
    name: 'product-title',
    transformIndexHtml: (html) =>
      html.replace(
        /<title>([^<]*)<\/title>/,
        (_match, title: string) => `<title>${withProductName(title)}</title>`
      )
  }
}
