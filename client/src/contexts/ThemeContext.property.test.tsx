// Feature: noneco-enhancements, Property 25: Dark Mode Toggle Round-Trip
// Feature: noneco-enhancements, Property 26: Theme Preference Persisted in localStorage

import { act, renderHook } from '@testing-library/react'
import * as fc from 'fast-check'
import React from 'react'
import { afterEach, describe, it } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'

const THEME_KEY = 'noneco_theme'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
)

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

/**
 * Property 25: Dark Mode Toggle Round-Trip
 * Validates: Requirements 8.2, 8.3
 */
describe('Property 25: Dark Mode Toggle Round-Trip', () => {
  it('toggling dark mode on adds "dark" class, toggling off removes it', () => {
    fc.assert(
      fc.property(fc.boolean(), (startDark) => {
        // Set initial localStorage state
        localStorage.setItem(THEME_KEY, startDark ? 'dark' : 'light')
        document.documentElement.classList.remove('dark')
        if (startDark) document.documentElement.classList.add('dark')

        const { result, unmount } = renderHook(() => useTheme(), { wrapper })

        // First toggle: flips from initial state
        act(() => {
          result.current.toggleTheme()
        })

        const afterFirstToggle = document.documentElement.classList.contains('dark')
        // After first toggle, dark class should be the opposite of startDark
        if (startDark) {
          // was dark → now light
          if (afterFirstToggle) {
            unmount()
            return false
          }
        } else {
          // was light → now dark
          if (!afterFirstToggle) {
            unmount()
            return false
          }
        }

        // Second toggle: should revert to original state
        act(() => {
          result.current.toggleTheme()
        })

        const afterSecondToggle = document.documentElement.classList.contains('dark')
        const restoredCorrectly = afterSecondToggle === startDark

        unmount()
        return restoredCorrectly
      }),
    )
  })
})

/**
 * Property 26: Theme Preference Persisted in localStorage
 * Validates: Requirements 8.4
 */
describe('Property 26: Theme Preference Persisted in localStorage', () => {
  it('localStorage reflects the new theme value after toggleTheme()', () => {
    fc.assert(
      fc.property(fc.constantFrom('light', 'dark') as fc.Arbitrary<'light' | 'dark'>, (initial) => {
        localStorage.setItem(THEME_KEY, initial)

        const { result, unmount } = renderHook(() => useTheme(), { wrapper })

        act(() => {
          result.current.toggleTheme()
        })

        const expected = initial === 'light' ? 'dark' : 'light'
        const stored = localStorage.getItem(THEME_KEY)

        unmount()
        return stored === expected
      }),
    )
  })
})
