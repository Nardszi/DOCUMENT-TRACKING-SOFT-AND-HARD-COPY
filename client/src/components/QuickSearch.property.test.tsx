// Feature: noneco-enhancements, Property 7: Quick Search Debounce
// Feature: noneco-enhancements, Property 6: Quick Search Results Match Query and Scope

import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import QuickSearch from './QuickSearch'
import * as AuthContextModule from '../contexts/AuthContext'

// Mock react-router-dom's useNavigate
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

// Mock StatusBadge to simplify rendering
vi.mock('./StatusBadge', () => ({
  default: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
}))

function mockAuth(token = 'mock-token') {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: {
      id: 'user-1',
      role: 'staff',
      departmentId: 'dept-1',
      fullName: 'Test User',
    },
    token,
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
  })
}

// ---------------------------------------------------------------------------
// Property 7: Quick Search Debounce
// Validates: Requirements 3.6
// ---------------------------------------------------------------------------
describe('Property 7: Quick Search Debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockAuth()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as unknown as Response)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('for any keystroke sequence typed within 300ms, fetch is called at most once after 300ms of inactivity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 2, maxLength: 10 }), { minLength: 2, maxLength: 5 }),
        async (keystrokes) => {
          ;(global.fetch as ReturnType<typeof vi.fn>).mockClear()

          const { unmount } = render(<QuickSearch />)
          const input = screen.getByRole('searchbox')

          // Type each keystroke rapidly without advancing timers between them
          for (const stroke of keystrokes) {
            act(() => {
              fireEvent.change(input, { target: { value: stroke } })
            })
          }

          // Advance timers by less than 300ms — fetch should NOT have been called yet
          act(() => {
            vi.advanceTimersByTime(299)
          })
          expect(global.fetch).not.toHaveBeenCalled()

          // Advance timers past the 300ms debounce threshold
          await act(async () => {
            vi.advanceTimersByTime(1)
          })

          // fetch should have been called at most once (only for the final value)
          expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(1)

          unmount()
        },
      ),
      { numRuns: 20 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 6: Quick Search Results Match Query and Scope
// Validates: Requirements 3.2, 3.3, 3.8
// ---------------------------------------------------------------------------
describe('Property 6: Quick Search Results Match Query and Scope', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockAuth()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('for any search term >= 2 chars, fetch is called with the correct query param and at most 8 results are shown', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 2 }),
        async (term) => {
          // Build 10 mock documents that match the term so we can verify the 8-result cap
          const mockDocs = Array.from({ length: 10 }, (_, i) => ({
            id: `doc-${i}`,
            tracking_number: `${term.toUpperCase()}-${String(i).padStart(4, '0')}`,
            title: `Document about ${term} number ${i}`,
            status: 'pending',
          }))

          global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: mockDocs }),
          } as unknown as Response)

          const { unmount } = render(<QuickSearch />)
          const input = screen.getByRole('searchbox')

          act(() => {
            fireEvent.change(input, { target: { value: term } })
          })

          // Advance past debounce
          await act(async () => {
            vi.advanceTimersByTime(300)
          })

          // Verify fetch was called with the correct query parameter
          expect(global.fetch).toHaveBeenCalledTimes(1)
          const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
          expect(calledUrl).toContain(`q=${encodeURIComponent(term)}`)

          // Verify at most 8 results are rendered in the dropdown (Req 3.3)
          const listItems = screen.queryAllByRole('option')
          expect(listItems.length).toBeLessThanOrEqual(8)

          // Verify each displayed result contains the term (case-insensitive),
          // confirming tracking_number prefix or title substring match (Req 3.2, 3.8)
          listItems.forEach((item) => {
            const text = item.textContent ?? ''
            expect(text.toLowerCase()).toContain(term.toLowerCase())
          })

          unmount()
        },
      ),
      { numRuns: 20 },
    )
  })
})
