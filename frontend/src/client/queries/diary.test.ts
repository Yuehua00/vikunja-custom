import {beforeEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'

const mocks = vi.hoisted(() => ({update: vi.fn(), remove: vi.fn(), refetch: vi.fn(), data: [] as Record<string, unknown>[]}))
vi.mock('@tanstack/vue-query', async importOriginal => {
	const actual = await importOriginal<typeof import('@tanstack/vue-query')>()
	const {ref} = await import('vue')
	return {...actual, useQuery: () => ({data: ref(mocks.data), isFetching: ref(false), refetch: mocks.refetch})}
})
vi.mock('@/composables/useProjects', () => ({useProjects: () => ({projectsArray: [{id: 9, title: '日記'}]})}))
vi.mock('@/composables/useLabels', async () => { const {ref} = await import('vue'); return {useLabels: () => ({labels: ref([])})} })
vi.mock('@/client/queries/projects', () => ({createProjectDraft: vi.fn(), useCreateProjectMutation: () => ({mutateAsync: vi.fn()})}))
vi.mock('@/client/queries/labels', () => ({useCreateLabelMutation: () => ({mutateAsync: vi.fn()})}))
vi.mock('@/client/queries/tasks', () => ({allTasksQuery: () => ({})}))
vi.mock('@/client/queries/taskMutations', () => ({
	useCreateTaskMutation: () => ({mutateAsync: vi.fn()}),
	useUpdateTaskMutation: () => ({mutateAsync: mocks.update}),
	useDeleteTaskMutation: () => ({mutateAsync: mocks.remove}),
	useAddTaskLabelMutation: () => ({mutateAsync: vi.fn()}),
	useRemoveTaskLabelMutation: () => ({mutateAsync: vi.fn()}),
}))
import {useDiary} from './diary'

function diary() {
	let api!: ReturnType<typeof useDiary>
	const wrapper = mount(defineComponent({setup() { api = useDiary(); return () => h('div') }}))
	return {api, wrapper}
}
describe('diary deletion', () => {
	beforeEach(() => {
		vi.resetAllMocks()
		mocks.data = [{id: 18, title: '2026-10-26', description: 'Today', labels: []}]
		mocks.refetch.mockResolvedValue(undefined)
		mocks.remove.mockResolvedValue(undefined)
	})
	it('waits for a running autosave before deleting the entry', async () => {
		let release!: () => void
		mocks.update.mockImplementation(() => new Promise<void>(resolve => {release = resolve}))
		const {api, wrapper} = diary()
		const save = api.saveText('2026-10-26', 'Edited')
		await flushPromises()
		const deletion = api.deleteEntry('2026-10-26')
		await flushPromises()
		expect(mocks.remove).not.toHaveBeenCalled()
		release()
		await save
		await deletion
		expect(mocks.remove).toHaveBeenCalledWith(18)
		expect(mocks.refetch).toHaveBeenCalledTimes(1)
		wrapper.unmount()
	})
	it('does not delete any other date when the requested entry is absent', async () => {
		const {api, wrapper} = diary()
		await api.deleteEntry('2026-10-25')
		expect(mocks.remove).not.toHaveBeenCalled()
		wrapper.unmount()
	})
	it('reports a failed deletion without clearing the entry', async () => {
		mocks.remove.mockRejectedValue(new Error('offline'))
		const {api, wrapper} = diary()
		await expect(api.deleteEntry('2026-10-26')).rejects.toThrow('offline')
		expect(api.entryByDate.value.has('2026-10-26')).toBe(true)
		wrapper.unmount()
	})
})

