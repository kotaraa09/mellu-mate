// Run with `claude plugin test plugins/filetree`. Added by Mellu.mate; see PROVENANCE.md.
import { describe, expect, test } from 'claude-code/testing'

import { shownAs } from './tree'

// With Follow Claude off, a file Claude changes inside a closed folder no longer opens that
// folder: users found the tree "zoomed in" on every edit. The row they can see lights up.
describe('where a file shows in the tree', () => {
  const root = '/p'

  test('a file whose folders are open shows as itself', () => {
    expect(shownAs('/p/src/app.js', root, new Set(['/p/src']))).toBe('/p/src/app.js')
    expect(shownAs('/p/index.html', root, new Set())).toBe('/p/index.html')
  })

  test('a file in a closed folder shows as the outermost closed folder above it', () => {
    expect(shownAs('/p/src/ui/button.js', root, new Set())).toBe('/p/src')
    expect(shownAs('/p/src/ui/button.js', root, new Set(['/p/src']))).toBe('/p/src/ui')
  })
})
