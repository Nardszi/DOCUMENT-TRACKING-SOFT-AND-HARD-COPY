// Feature: noneco-enhancements, Property 5: Web App Manifest Contains Required Fields

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import manifestJson from '../public/manifest.json'

// ---------------------------------------------------------------------------
// Manifest validator
// ---------------------------------------------------------------------------

interface ManifestIcon {
  src: string
  sizes: string
  type?: string
}

interface Manifest {
  name: string
  short_name: string
  start_url: string
  display: string
  theme_color: string
  background_color: string
  icons: ManifestIcon[]
}

function validateManifest(manifest: Manifest): boolean {
  if (!manifest.name || manifest.name.trim() === '') return false
  if (!manifest.short_name || manifest.short_name.trim() === '') return false
  if (!manifest.start_url || manifest.start_url.trim() === '') return false
  if (!manifest.display || manifest.display.trim() === '') return false
  if (!manifest.theme_color || manifest.theme_color.trim() === '') return false
  if (!manifest.background_color || manifest.background_color.trim() === '') return false
  if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) return false

  const has192 = manifest.icons.some((icon) => icon.sizes === '192x192')
  const has512 = manifest.icons.some((icon) => icon.sizes === '512x512')

  return has192 && has512
}

// ---------------------------------------------------------------------------
// Property 5: Web App Manifest Contains Required Fields
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------

describe('Property 5: Web App Manifest Contains Required Fields', () => {
  // Arbitrary for a valid manifest icon
  const iconArb = fc.record({
    src: fc.string({ minLength: 1 }),
    sizes: fc.string({ minLength: 1 }),
    type: fc.constant('image/png'),
  })

  // Arbitrary for a valid manifest (always includes 192x192 and 512x512 icons)
  const validManifestArb = fc
    .record({
      name: fc.string({ minLength: 1 }),
      short_name: fc.string({ minLength: 1 }),
      start_url: fc.string({ minLength: 1 }),
      display: fc.string({ minLength: 1 }),
      theme_color: fc.string({ minLength: 1 }),
      background_color: fc.string({ minLength: 1 }),
      extraIcons: fc.array(iconArb, { minLength: 0, maxLength: 5 }),
    })
    .map(({ extraIcons, ...fields }) => ({
      ...fields,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ...extraIcons,
      ],
    }))

  it('any manifest object with all required fields passes validation', () => {
    fc.assert(
      fc.property(validManifestArb, (manifest) => {
        return validateManifest(manifest) === true
      }),
      { numRuns: 100 },
    )
  })

  it('the actual manifest.json passes validation', () => {
    expect(validateManifest(manifestJson as Manifest)).toBe(true)
  })

  it('the actual manifest.json has non-empty required string fields', () => {
    expect(manifestJson.name.trim()).not.toBe('')
    expect(manifestJson.short_name.trim()).not.toBe('')
    expect(manifestJson.start_url.trim()).not.toBe('')
    expect(manifestJson.display.trim()).not.toBe('')
    expect(manifestJson.theme_color.trim()).not.toBe('')
    expect(manifestJson.background_color.trim()).not.toBe('')
  })

  it('the actual manifest.json icons array contains 192x192 and 512x512 entries', () => {
    const icons = manifestJson.icons
    expect(icons.length).toBeGreaterThanOrEqual(2)
    expect(icons.some((icon) => icon.sizes === '192x192')).toBe(true)
    expect(icons.some((icon) => icon.sizes === '512x512')).toBe(true)
  })
})
