import React from 'react'
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import CommentsSection from './CommentsSection'
import * as AuthContextModule from '../contexts/AuthContext'
import * as ToastContainerModule from './ToastContainer'

// Mock useToast to avoid needing ToastProvider
vi.mock('./ToastContainer', async (importOriginal) => {
  const actual = await importOriginal<typeof ToastContainerModule>()
  return {
    ...actual,
    useToast: () => ({ showToast: vi.fn() }),
  }
})

// Mock ConfirmDialog to simplify rendering
vi.mock('./ConfirmDialog', () => ({
  default: ({ title }: { title: string }) => <div data-testid="confirm-dialog">{title}</div>,
}))

const NOW = new Date('2024-06-15T12:00:00.000Z').getTime()

function makeComment(overrides: Partial<{
  id: string
  content: string
  created_at: string
  updated_at: string
  userId: string
  full_name: string
  department: string
}> = {}) {
  const {
    id = 'c1',
    content = 'Test comment',
    created_at = new Date(NOW - 1 * 60 * 60 * 1000).toISOString(), // 1h ago (within 24h)
    updated_at = created_at,
    userId = 'user-1',
    full_name = 'Alice Smith',
    department = 'Finance',
  } = overrides
  return { id, content, created_at, updated_at, user: { id: userId, full_name, department } }
}

function mockAuthUser(user: Partial<AuthContextModule.DecodedUser> | null) {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user: user
      ? {
          id: 'user-1',
          role: 'staff',
          departmentId: 'dept-1',
          fullName: 'Alice Smith',
          ...user,
        }
      : null,
    token: 'mock-token',
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
  })
}

function setupFetch(comments: ReturnType<typeof makeComment>[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => comments,
  } as Response)
}

describe('CommentsSection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Test 1: Renders a list of comments with author name, department, and text
  // Validates: Requirements 4.5
  it('renders comment list with author name, department, and text', async () => {
    mockAuthUser({ id: 'user-2' })
    const comments = [
      makeComment({ id: 'c1', content: 'Hello world', full_name: 'Alice Smith', department: 'Finance' }),
      makeComment({ id: 'c2', content: 'Another comment', full_name: 'Bob Jones', department: 'HR', userId: 'user-3' }),
    ]
    setupFetch(comments)

    render(<CommentsSection documentId="doc-1" />)

    expect(await screen.findByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('Another comment')).toBeInTheDocument()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    expect(screen.getByText('· Finance')).toBeInTheDocument()
    expect(screen.getByText('· HR')).toBeInTheDocument()
  })

  // Test 2: Shows Edit button on own comment when created_at is within 24 hours
  // Validates: Requirements 4.7
  it('shows Edit button on own comment when created within 24 hours', async () => {
    mockAuthUser({ id: 'user-1' })
    const recentComment = makeComment({
      id: 'c1',
      userId: 'user-1',
      created_at: new Date(NOW - 1 * 60 * 60 * 1000).toISOString(), // 1h ago
    })
    setupFetch([recentComment])

    render(<CommentsSection documentId="doc-1" />)

    await screen.findByText('Test comment')
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  // Test 3: Hides Edit button on own comment when created_at is more than 24 hours ago
  // Validates: Requirements 4.7
  it('hides Edit button on own comment when created more than 24 hours ago', async () => {
    mockAuthUser({ id: 'user-1' })
    const oldComment = makeComment({
      id: 'c1',
      userId: 'user-1',
      created_at: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
    })
    setupFetch([oldComment])

    render(<CommentsSection documentId="doc-1" />)

    await screen.findByText('Test comment')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  // Test 4: Shows Delete button on own comments
  // Validates: Requirements 4.5
  it('shows Delete button on own comments', async () => {
    mockAuthUser({ id: 'user-1', role: 'staff' })
    const ownComment = makeComment({ id: 'c1', userId: 'user-1' })
    setupFetch([ownComment])

    render(<CommentsSection documentId="doc-1" />)

    await screen.findByText('Test comment')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  // Test 5: Shows Delete button for admin on all comments (not just own)
  // Validates: Requirements 4.5
  it('shows Delete button for admin on other users comments', async () => {
    mockAuthUser({ id: 'admin-1', role: 'admin' })
    const otherComment = makeComment({ id: 'c1', userId: 'user-99', full_name: 'Other User' })
    setupFetch([otherComment])

    render(<CommentsSection documentId="doc-1" />)

    await screen.findByText('Test comment')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  // Test 6: Does NOT show Edit button on other users' comments
  // Validates: Requirements 4.7
  it('does not show Edit button on other users comments', async () => {
    mockAuthUser({ id: 'user-1' })
    const otherComment = makeComment({ id: 'c1', userId: 'user-99', full_name: 'Other User' })
    setupFetch([otherComment])

    render(<CommentsSection documentId="doc-1" />)

    await screen.findByText('Test comment')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })
})
