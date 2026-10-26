import {describe, it, expect, vi} from 'vitest'
import {createPinia} from 'pinia'
import {mount} from '@vue/test-utils'
import {createI18n} from 'vue-i18n'
import {createRouter, createMemoryHistory} from 'vue-router'

import GanttChart from './GanttChart.vue'
import GanttTimelineHeader from './GanttTimelineHeader.vue'
import GanttRowBars from './GanttRowBars.vue'
import en from '@/i18n/lang/en.json'
import {i18n as globalI18n} from '@/i18n'
import type {TaskResponse} from '@/client/queries/tasks'
import type {GanttFilters} from '@/views/project/helpers/useGanttFilters'

const i18n = createI18n({legacy: false, locale: 'en', messages: {en}})

// the dayjs locale sync reads the app-wide i18n instance, not the one installed on the wrapper
globalI18n.global.locale.value = 'en'
const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: {template: '<div/>'}}]})

const FILTERS: GanttFilters = {
	projectId: 1,
	viewId: 1,
	dateFrom: '2026-08-01T00:00:00.000Z',
	dateTo: '2026-10-01T00:00:00.000Z',
	showTasksWithoutDates: false,
}

function mountChart(isLoading: boolean, withTask = false) {
	return mount(GanttChart, {
		shallow: true,
		props: {
			isLoading,
			filters: FILTERS,
			tasks: new Map<number, TaskResponse>(withTask ? [[7, {
				id: 7, project_id: 1, title: 'Task', related_tasks: {}, hex_color: '', done: false,
				start_date: '2026-08-02T00:00:00Z', end_date: '2026-08-04T00:00:00Z',
			} as TaskResponse]] : []),
			defaultTaskStartDate: FILTERS.dateFrom,
			defaultTaskEndDate: FILTERS.dateTo,
		},
		global: {
			plugins: [createPinia(), i18n, router],
			stubs: {
				GanttChartBody: {template: '<div><slot :focused-row="null" :focused-cell="null" /></div>'},
				GanttRow: {template: '<div><slot /></div>'},
			},
		},
	})
}

describe('GanttChart.vue', () => {
	function pressBar(wrapper: ReturnType<typeof mountChart>) {
		const rows = wrapper.getComponent(GanttRowBars)
		const event = new MouseEvent('pointerdown', {button: 0, clientX: 20, clientY: 20})
		Object.defineProperty(event, 'target', {value: document.body})
		rows.vm.$emit('barPointerDown', rows.props('bars')[0], event)
	}

	it('opens a task after a single pointer release', () => {
		const wrapper = mountChart(false, true)
		const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
		pressBar(wrapper)
		document.dispatchEvent(new MouseEvent('pointerup', {clientX: 20, clientY: 20}))
		expect(push).toHaveBeenCalledWith(expect.objectContaining({name: 'task.detail', params: {id: '7'}}))
		push.mockRestore()
		wrapper.unmount()
	})

	it('does not open a task when the pointer gesture becomes a drag', () => {
		const wrapper = mountChart(false, true)
		const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
		pressBar(wrapper)
		document.dispatchEvent(new MouseEvent('pointermove', {clientX: 30, clientY: 20}))
		document.dispatchEvent(new MouseEvent('pointerup', {clientX: 30, clientY: 20}))
		expect(push).not.toHaveBeenCalled()
		push.mockRestore()
		wrapper.unmount()
	})

	it('does not open a task after pointer cancellation', () => {
		const wrapper = mountChart(false, true)
		const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
		pressBar(wrapper)
		document.dispatchEvent(new Event('pointercancel'))
		document.dispatchEvent(new MouseEvent('pointerup'))
		expect(push).not.toHaveBeenCalled()
		push.mockRestore()
		wrapper.unmount()
	})
	it('measures the day width once the chart replaces the loading state', async () => {
		const wrapper = mountChart(true)
		expect(wrapper.findComponent(GanttTimelineHeader).exists()).toBe(false)

		await wrapper.setProps({isLoading: false})

		expect(wrapper.findComponent(GanttTimelineHeader).props('dayWidthPixels')).toBeGreaterThan(0)
	})
})
