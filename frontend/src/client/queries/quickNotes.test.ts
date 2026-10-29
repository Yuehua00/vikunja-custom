import {beforeEach, describe, expect, it, vi} from 'vitest'
import {QueryClient} from '@tanstack/vue-query'
import {normalizeQuickNote, quickNoteKeys, quickNoteQuery, quickNotesQuery, saveQuickNoteMutationOptions, trashQuickNoteMutationOptions} from './quickNotes'
const sdk = vi.hoisted(() => ({quickNotesList: vi.fn(), quickNotesRead: vi.fn(), quickNotesCreate: vi.fn(), quickNotesUpdate: vi.fn(), quickNotesDelete: vi.fn(), quickNoteImagesUpload: vi.fn(), quickNoteImagesDownload: vi.fn()}))
vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({error: vi.fn(), success: vi.fn()}))
vi.mock('@/client/requestContext', () => ({captureClientRequestContext: () => 1, assertClientRequestContext: vi.fn(), isClientRequestContextCurrent: () => true, isRequestContextAbort: () => false}))
beforeEach(() => vi.clearAllMocks())
describe('quick note queries', () => {
	it('keeps full content in detail and keeps trash/search/page query identities distinct', async () => {
		const client = new QueryClient()
		sdk.quickNotesRead.mockResolvedValue({data: {id: 1, content: '<p>full</p>', version: 3}})
		expect(await client.fetchQuery(quickNoteQuery(1))).toMatchObject({content: '<p>full</p>', version: 3})
		expect(quickNotesQuery(true, 'query', 2).queryKey).not.toEqual(quickNotesQuery(false, '', 1).queryKey)
	})
	it('saves the exact version and refreshes summary lists', async () => {
		const client = new QueryClient()
		const key = quickNotesQuery().queryKey
		client.setQueryData(key, {items: [normalizeQuickNote({id: 1})], total: 1, page: 1, per_page: 50, total_pages: 1})
		sdk.quickNotesUpdate.mockResolvedValue({data: {id: 1, content: 'saved', version: 2}})
		await client.getMutationCache().build(client, saveQuickNoteMutationOptions()).execute({id: 1, content: 'saved', version: 1, pinned: false, is_trashed: false})
		expect(sdk.quickNotesUpdate).toHaveBeenCalledWith(expect.objectContaining({path: {id: 1}, body: expect.objectContaining({version: 1})}))
		expect(client.getQueryData(quickNoteKeys.detail(1))).toMatchObject({version: 2})
		expect(client.getQueryState(key)?.isInvalidated).toBe(true)
	})
	it('uses recoverable deletion without deleting another note cache', async () => {
		const client = new QueryClient()
		client.setQueryData(quickNoteKeys.detail(1), {id: 1})
		client.setQueryData(quickNoteKeys.detail(2), {id: 2})
		sdk.quickNotesDelete.mockResolvedValue({})
		await client.getMutationCache().build(client, trashQuickNoteMutationOptions()).execute(1)
		expect(client.getQueryData(quickNoteKeys.detail(1))).toBeUndefined()
		expect(client.getQueryData(quickNoteKeys.detail(2))).toEqual({id: 2})
	})
})
