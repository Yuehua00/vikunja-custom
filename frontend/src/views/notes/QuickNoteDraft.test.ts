import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {ref} from 'vue'
import QuickNoteDraft from './QuickNoteDraft.vue'
import QuickNoteEditor from './QuickNoteEditor.vue'
import {noteDraftKey} from '@/helpers/quickNotes'

const api = vi.hoisted(() => ({save: vi.fn(), trash: vi.fn(), create: vi.fn()}))
vi.mock('@/stores/auth', () => ({useAuthStore: () => ({info: {id: 1}})}))
vi.mock('@/helpers/apiUrl', () => ({getApiRootUrl: () => 'http://notes.test'}))
vi.mock('@/client/requestContext', () => ({isRequestContextAbort: () => false}))
vi.mock('@/client/queries/quickNotes', () => ({
	useSaveQuickNoteMutation: () => ({mutateAsync: api.save}),
	useTrashQuickNoteMutation: () => ({mutateAsync: api.trash, isPending: ref(false)}),
	useCreateQuickNoteMutation: () => ({mutateAsync: api.create, isPending: ref(false)}),
}))
const note = {id: 1, title: 'hello', preview: 'hello', content: '<p>hello</p>', pinned: false, is_trashed: false, version: 1}
let wrapper: ReturnType<typeof mount>
beforeEach(() => {vi.useFakeTimers(); localStorage.clear(); vi.clearAllMocks()})
afterEach(() => {wrapper?.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()})
function open() {
	wrapper = mount(QuickNoteDraft, {props: {note}, global: {stubs: {QuickNoteEditor: true}}})
	return wrapper.getComponent(QuickNoteEditor)
}
describe('quick note draft', () => {
	it('does not claim a local backup exists when browser storage fails', async () => {
		const editor = open()
		const storage = localStorage
		vi.stubGlobal('localStorage', {getItem: (key: string) => storage.getItem(key), removeItem: (key: string) => storage.removeItem(key), setItem: () => {throw new Error('quota')}})
		api.save.mockRejectedValue(new Error('offline'))
		editor.vm.$emit('change', '<p>unsaved</p>')
		await vi.advanceTimersByTimeAsync(650); await flushPromises()
		expect(wrapper.text()).toContain('無法保留本機草稿')
		expect(wrapper.text()).not.toContain('內容已保留在這台裝置')
	})

	it('saves edits automatically and ignores server refetches while typing', async () => {
		const editor = open()
		api.save.mockResolvedValue({...note, content: '<p>new</p>', version: 2})
		editor.vm.$emit('change', '<p>new</p>')
		await wrapper.setProps({note: {...note, content: '<p>stale refetch</p>'}})
		expect(editor.props('content')).toBe('<p>new</p>')
		await vi.advanceTimersByTimeAsync(650); await flushPromises()
		expect(api.save).toHaveBeenCalledWith(expect.objectContaining({id: 1, content: '<p>new</p>', version: 1}))
		expect(wrapper.text()).toContain('已儲存')
		expect(localStorage.getItem(noteDraftKey('http://notes.test', 1, 1))).toBeNull()
	})
	it('retains an offline draft and does not report success', async () => {
		const editor = open(); api.save.mockRejectedValue(new Error('offline'))
		editor.vm.$emit('change', '<p>offline text</p>')
		await vi.advanceTimersByTimeAsync(650); await flushPromises()
		expect(wrapper.text()).toContain('尚未同步')
		expect(localStorage.getItem(noteDraftKey('http://notes.test', 1, 1))).toContain('offline text')
	})
	it('does not overwrite a newer server revision and can save a separate copy', async () => {
		localStorage.setItem(noteDraftKey('http://notes.test', 1, 1), JSON.stringify({...note, content: '<p>my older draft</p>', version: 0}))
		open()
		await vi.advanceTimersByTimeAsync(1000)
		expect(api.save).not.toHaveBeenCalled()
		api.create.mockResolvedValue({...note, id: 2})
		await wrapper.findAll('button').find(button => button.text() === '另存成新筆記')!.trigger('click')
		await flushPromises()
		expect(api.create).toHaveBeenCalledWith('<p>my older draft</p>')
		expect(wrapper.emitted('copied')).toEqual([[2]])
	})
})
