import {describe, it, expect, vi, beforeEach} from 'vitest'
import {shallowMount, flushPromises} from '@vue/test-utils'
import {createPinia, setActivePinia} from 'pinia'
import {createRouter, createMemoryHistory} from 'vue-router'
import {QueryClient, VueQueryPlugin} from '@tanstack/vue-query'

import type {Task as ITask} from '@/client/generated'

const sdk = vi.hoisted(() => ({
	patchTasksRead: vi.fn(),
}))

vi.mock('@/client/generated', () => sdk)
vi.mock('@/message', () => ({error: vi.fn(), success: vi.fn()}))
vi.mock('@/helpers/playPop', () => ({playPopSound: vi.fn()}))
vi.mock('@/composables/useProjects', () => ({useProjects: () => ({projects: {}})}))
vi.mock('@/composables/useCurrentProject', () => ({useCurrentProject: () => ({currentProject: {value: null}})}))
vi.mock('vue-i18n', async importOriginal => ({
	...(await importOriginal<typeof import('vue-i18n')>()),
	useI18n: () => ({t: (key: string) => key}),
}))

import SingleTaskInProject from './SingleTaskInProject.vue'
import Labels from './Labels.vue'

const theTask = {id: 7, project_id: 1, title: 'Water the plants', done: true, is_favorite: false} as ITask

function deferred() {
	let resolve!: (value: unknown) => void
	const promise = new Promise(done => resolve = done)
	return {promise, resolve}
}

function mountRow(props: {printRow?: boolean, projectRow?: boolean} = {}) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{path: '/tasks/:id', name: 'task.detail', component: {render: () => null}},
			{path: '/projects/:projectId', name: 'project.index', component: {render: () => null}},
		],
	})
	return shallowMount(SingleTaskInProject, {
		props: {theTask, ...props},
		global: {
			plugins: [createPinia(), router, [VueQueryPlugin, {queryClient: new QueryClient({defaultOptions: {queries: {retry: false}}})}]],
			directives: {tooltip: {}},
			mocks: {$t: (key: string) => key},
		},
	})
}

describe('SingleTaskInProject', () => {
	it('keeps urgency in the status area with or without an overdue date', async () => {
		const wrapper = mountRow({printRow: true})
		for (const due_date of ['2020-01-01T00:00:00Z', undefined]) {
			await wrapper.setProps({theTask: {...theTask, done: false, priority: 5, due_date}})
			expect(wrapper.find('.print-row-main .print-row-urgent').exists()).toBe(false)
			expect(wrapper.get('.print-row-end .print-row-urgent').text()).toContain('緊急')
			expect(wrapper.find('.print-row-late').exists()).toBe(Boolean(due_date))
		}
		wrapper.unmount()
	})
	it('places labels beside urgency in the status area and removes the group when empty', async () => {
		const wrapper = mountRow({printRow: true})
		const labels = [{id: 3, title: 'Research', hex_color: '336699'}]
		await wrapper.setProps({theTask: {...theTask, labels}})
		expect(wrapper.get('.print-row-end .print-row-markers').getComponent(Labels).props('labels')).toEqual(labels)
		expect(wrapper.find('.print-row-main .print-row-labels').exists()).toBe(false)
		await wrapper.setProps({theTask: {...theTask, labels: []}})
		expect(wrapper.findComponent(Labels).exists()).toBe(false)
		wrapper.unmount()
	})

	it('labels urgent open tasks explicitly and removes the badge when completed', async () => {
		const wrapper = mountRow({printRow: true})
		await wrapper.setProps({theTask: {...theTask, done: false, priority: 5}})
		expect(wrapper.get('.print-row-urgent').text()).toContain('緊急')
		await wrapper.setProps({theTask: {...theTask, done: true, priority: 5}})
		expect(wrapper.find('.print-row-urgent').exists()).toBe(false)
		wrapper.unmount()
	})

	beforeEach(() => {
		setActivePinia(createPinia())
		sdk.patchTasksRead.mockReset()
	})

	it.each([{printRow: true}, {projectRow: true}, {}])('opens task detail from row space in layout %j', async props => {
		const wrapper = mountRow(props)
		const push = vi.spyOn(wrapper.vm.$router, 'push')
		await wrapper.get('.single-task').trigger('click')
		expect(push).toHaveBeenCalledWith(expect.objectContaining({
			name: 'task.detail', params: {id: 7}, state: expect.objectContaining({backdropView: expect.any(String)}),
		}))
	})

	it('does not open task detail when clicking the completion button', async () => {
		const wrapper = mountRow({printRow: true})
		const push = vi.spyOn(wrapper.vm.$router, 'push')
		await wrapper.get('.print-row-check').trigger('click')
		expect(push).not.toHaveBeenCalled()
	})

	it('shows the row as loading while marking it undone is in flight', async () => {
		const update = deferred()
		sdk.patchTasksRead.mockReturnValue(update.promise)
		const wrapper = mountRow()

		wrapper.getComponent({name: 'FancyCheckbox'}).vm.$emit('update:modelValue', false)
		await flushPromises()

		await vi.waitFor(() => expect(wrapper.get('.task').classes()).toContain('is-loading'))

		update.resolve({data: {...theTask, done: false}})
		await flushPromises()

		expect(wrapper.get('.task').classes()).not.toContain('is-loading')
	})

	it('shows the row as loading while favouring it is in flight', async () => {
		const favorite = deferred()
		sdk.patchTasksRead.mockReturnValue(favorite.promise)
		const wrapper = mountRow()

		await wrapper.get('.favorite').trigger('click')
		await flushPromises()

		expect(sdk.patchTasksRead).toHaveBeenCalledWith(expect.objectContaining({
			path: {task: 7},
			body: [expect.objectContaining({path: '/is_favorite', value: true})],
		}))
		await vi.waitFor(() => expect(wrapper.get('.task').classes()).toContain('is-loading'))

		favorite.resolve({data: {...theTask, is_favorite: true}})
		await flushPromises()

		expect(wrapper.get('.task').classes()).not.toContain('is-loading')
	})
})
