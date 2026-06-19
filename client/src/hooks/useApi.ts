import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query'
import { useMutation, UseMutationOptions, UseMutationResult } from '@tanstack/react-query'
import { api } from '../utils/api'

/**
 * Generic GET hook using React Query.
 * Wraps `api()` with automatic token handling and JSON parsing.
 *
 * Usage:
 *   const { data, isLoading, error } = useApiQuery<DataType>('/api/dashboard')
 */
export function useApiQuery<T>(
  url: string,
  options?: Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'> & { queryKey?: unknown[] }
): UseQueryResult<T, Error> {
  const { queryKey, ...rest } = options ?? {}
  return useQuery<T, Error>({
    queryKey: queryKey ?? [url],
    queryFn: async () => {
      const res = await api(url)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message || `Request failed (${res.status})`)
      }
      return res.json()
    },
    ...rest,
  })
}

/**
 * Generic mutation hook (POST / PUT / PATCH / DELETE).
 *
 * Usage:
 *   const mutation = useApiMutation<ResponseBody, RequestBody>('/api/documents', 'POST')
 *   mutation.mutate({ title: '...' })
 */
export function useApiMutation<TData, TVariables = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  options?: UseMutationOptions<TData, Error, TVariables>
): UseMutationResult<TData, Error, TVariables> {
  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables) => {
      const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH'
      const res = await api(url, {
        method,
        body: hasBody ? JSON.stringify(variables) : undefined,
        headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message || `Request failed (${res.status})`)
      }
      // 204 No Content
      if (res.status === 204) return undefined as TData
      return res.json()
    },
    ...options,
  })
}
