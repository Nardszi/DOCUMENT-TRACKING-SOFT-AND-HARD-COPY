`     /**
 * Unit tests for DocumentListPage bulk action confirmation dialog
 * Validates: Requirements 6.4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DocumentListPage from './DocumentListPage'
import { ToastProvider } from '../components/ToastContainer'

// ---------------------------------------------------------------------------
// Mock the auth context so we can control the user role
// ---------------------------------------------------------------------------
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      role: 'department_head',
      departmentId: '10',
      fullName: 'Test User',
    },
    token: 'fake.token.value',
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
  }),
}))

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleDocuments = [
  {
    id: 1,
    tracking_number: 'TRK-001',
    title: 'Document One',
    category: { id: 1, name: 'Memo' },
    current_department: { id: 10, code: 'IT', name: 'IT Department' },
    status: 'pending',
    priority: 'normal',
    deadline: null,
    is_overdue: false,
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    tracking_number: 'TRK-002',
    title: 'Document Two',
    category: { id: 1, name: 'Memo' },
    current_department: { id: 10, code: 'IT', name: 'IT Department' },
    status: 'in_progress',
    priority: 'high',
    deadline: null,
    is_overdue: false,
    updated_at: new Date().toISOString(),
  },
]

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DocumentListPage />
      </ToastProvider>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// fetch mock setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()

  global.fetch = vi.fn((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString()

    if (urlStr.includes('/api/documents/bulk-complete')) {
      return Promise.resolve(
        new Response(JSON.stringify({ completed: 2, skipped: 0 }), { status: 200 }),
      )
    }

    if (urlStr.includes('/api/documents')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: sampleDocuments, total: 2, totalPages: 1 }),
          { status: 200 },
        ),
      )
    }

    if (urlStr.includes('/api/categories')) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
    }

    if (urlStr.includes('/api/departments')) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
    }

    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
  }) as unknown as typeof fetch
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocumentListPage – bulk action confirmation dialog', () => {
  it('bulk action toolbar is hidden when no documents are selected', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Document One')).toBeDefined()
    })

    // Toolbar should not be visible yet
    expect(screen.queryByText(/selected/)).toBeNull()
    expect(screen.queryByRole('button', { name: /mark complete/i })).toBeNull()
  })

  it('bulk action toolbar appears after selecting a document', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Document One')).toBeDefined()
    })

    const checkbox = screen.getByRole('checkbox', { name: /select document TRK-001/i })
    await user.click(checkbox)

    expect(screen.getByText(/1 selected/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /mark complete/i })).toBeDefined()
  })

  it('clicking "Mark Complete" shows the confirmation dialog before any API call', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Document One')).toBeDefined()
    })

    // Select a document
    await user.click(screen.getByRole('checkbox', { name: /select document TRK-001/i }))

    // Click "Mark Complete" in the toolbar
    await user.click(screen.getByRole('button', { name: /mark complete/i }))

    // Confirmation dialog must be visible
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText(/mark as complete/i)).toBeDefined()

    // The bulk-complete API must NOT have been called yet
    const bulkCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url.includes('/api/documents/bulk-complete'),
    )
    expect(bulkCalls).toHaveLength(0)
  })

  it('cancelling the confirmation dialog does NOT call the bulk-complete API', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Document One')).toBeDefined()
    })

    // Select a document and open the dialog
    await user.click(screen.getByRole('checkbox', { name: /select document TRK-001/i }))
    await user.click(screen.getByRole('button', { name: /mark complete/i }))

    // Dialog is open – click Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Dialog should be dismissed
    expect(screen.queryByRole('dialog')).toBeNull()

    // bulk-complete endpoint must NOT have been called
    const bulkCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url.includes('/api/documents/bulk-complete'),
    )
    expect(bulkCalls).toHaveLength(0)
  })

  it('confirming the dialog calls the bulk-complete API', async () => {
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Document One')).toBeDefined()
    })

    // Select a document and open the dialog
    await user.click(screen.getByRole('checkbox', { name: /select document TRK-001/i }))
    await user.click(screen.getByRole('button', { name: /mark complete/i }))

    // Find the confirm button inside the dialog
    const dialog = screen.getByRole('dialog')
    const confirmBtn = Array.from(dialog.querySelectorAll('button')).find((btn) =>
      /mark complete/i.test(btn.textContent ?? ''),
    )
    expect(confirmBtn).toBeDefined()
    await user.click(confirmBtn!)

    // bulk-complete endpoint must have been called exactly once
    await waitFor(() => {
      const bulkCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([url]: [string]) => url.includes('/api/documents/bulk-complete'),
      )
      expect(bulkCalls).toHaveLength(1)
    })
  })
})
