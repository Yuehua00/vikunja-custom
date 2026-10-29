import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {ref} from 'vue'
import QuickNoteEditor from './QuickNoteEditor.vue'

const api = vi.hoisted(() => ({upload: vi.fn(), blob: vi.fn()}))
vi.mock('@/client/queries/quickNotes', () => ({quickNoteImageBlob: api.blob, useUploadQuickNoteImageMutation: () => ({mutateAsync: api.upload, isPending: ref(false)})}))
let wrapper: ReturnType<typeof mount>
beforeEach(() => {
	vi.clearAllMocks()
	vi.stubGlobal('requestAnimationFrame', () => 0)
	vi.stubGlobal('cancelAnimationFrame', () => {})
	URL.createObjectURL = vi.fn(() => 'blob:private-note-image')
	URL.revokeObjectURL = vi.fn()
	api.blob.mockResolvedValue(new Blob(['image'], {type: 'image/png'}))
})
afterEach(() => {wrapper?.unmount(); vi.unstubAllGlobals()})
async function pasteText(text: string, html = '', content = '') {
	wrapper = mount(QuickNoteEditor, {props: {noteId: 1, content}})
	await flushPromises()
	const event = new Event('paste', {bubbles: true, cancelable: true})
	Object.defineProperty(event, 'clipboardData', {value: {files: [], getData: (type: string) => type === 'text/plain' ? text : type === 'text/html' ? html : ''}})
	wrapper.get('.tiptap').element.dispatchEvent(event)
	await flushPromises()
}

describe('quick note Markdown paste', () => {
	it('converts headings, bold text and lists to editable content', async () => {
		await pasteText('# 標題\n\n**重點**\n\n- 第一項\n- 第二項')
		expect(wrapper.get('.tiptap h1').text()).toBe('標題')
		expect(wrapper.get('.tiptap strong').text()).toBe('重點')
		expect(wrapper.findAll('.tiptap li')).toHaveLength(2)
		expect(wrapper.emitted('change')).toBeTruthy()
	})
	it('converts fenced code without interpreting its Markdown', async () => {
		await pasteText('```python\n# comment\nprint("hello")\n```')
		expect(wrapper.get('.tiptap pre code').text()).toContain('# comment')
		expect(wrapper.find('.tiptap h1').exists()).toBe(false)
	})
	it('keeps rich clipboard formatting', async () => {
		await pasteText('# title', '<p><strong># title</strong></p>')
		expect(wrapper.get('.tiptap strong').text()).toBe('# title')
		expect(wrapper.find('.tiptap h1').exists()).toBe(false)
	})
	it('preserves Markdown source when pasted inside a code block', async () => {
		await pasteText('**literal**', '', '<pre><code>existing</code></pre>')
		expect(wrapper.get('.tiptap pre').text()).toContain('**literal**')
		expect(wrapper.find('.tiptap strong').exists()).toBe(false)
	})
})
describe('quick note images', () => {
	it('uploads a pasted image to the selected note and serializes its durable id', async () => {
		api.upload.mockResolvedValue({note_id: 1, file_id: 42})
		wrapper = mount(QuickNoteEditor, {props: {noteId: 1, content: ''}})
		await flushPromises()
		const file = new File(['png'], 'screen.png', {type: 'image/png'})
		const event = new Event('paste', {bubbles: true, cancelable: true})
		Object.defineProperty(event, 'clipboardData', {value: {files: [file], getData: () => ''}})
		wrapper.get('.tiptap').element.dispatchEvent(event)
		await flushPromises()
		expect(api.upload).toHaveBeenCalledWith({id: 1, file})
		const changes = wrapper.emitted('change')!.map(args => String(args[0]))
		expect(changes.join('')).toContain('data-note-image-id="42"')
		expect(changes.join('')).not.toContain('blob:private-note-image')
	})
	it('loads stored images through authenticated download and releases blob URLs', async () => {
		wrapper = mount(QuickNoteEditor, {props: {noteId: 1, readonly: true, content: '<p><img src="#" data-note-image-id="42"></p>'}})
		await flushPromises()
		expect(api.blob).toHaveBeenCalledWith(1, 42)
		expect(wrapper.get('img').attributes('src')).toBe('blob:private-note-image')
		wrapper.unmount()
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-note-image')
	})
	it('keeps failed uploads available for retry without inserting a fake saved image', async () => {
		api.upload.mockRejectedValue(new Error('offline'))
		wrapper = mount(QuickNoteEditor, {props: {noteId: 1, content: ''}})
		await flushPromises()
		const file = new File(['png'], 'screen.png', {type: 'image/png'})
		Object.defineProperty(wrapper.get('input[type=file]').element, 'files', {value: [file]})
		await wrapper.get('input[type=file]').trigger('change')
		await flushPromises()
		expect(wrapper.text()).toContain('重試上傳')
		expect(wrapper.find('.tiptap img').exists()).toBe(false)
	})
})
