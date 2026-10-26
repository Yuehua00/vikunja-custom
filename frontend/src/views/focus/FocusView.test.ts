import {afterEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {shallowMount} from '@vue/test-utils'

vi.mock('@/composables/useGlobalNow', async () => { const {ref} = await import('vue'); return {useGlobalNow: () => ({now: ref(new Date(2026, 9, 26, 12))})} })
vi.mock('@/composables/useFocusTimer', async () => {
	const {ref} = await import('vue')
	return {useFocusTimer: () => ({active: ref(null), pomoMinutes: ref(25), elapsed: ref(0), remaining: ref(1500),
		records: ref([26, 20, 19].map(day => ({id: `record-${day}`, mode: 'pomo', task_id: null, task_title: 'Read', seconds: 1500, completed: true,
			started_at: new Date(2026, 9, day, 10).toISOString(), ended_at: new Date(2026, 9, day, 10, 25).toISOString()}))),
		start: vi.fn(), finish: vi.fn(), abandon: vi.fn(), deleteRecord: vi.fn(), setPomoMinutes: vi.fn()})}
})
vi.mock('@/stores/auth', () => ({useAuthStore: () => ({settings: {timezone: 'Asia/Taipei'}})}))
vi.mock('@/composables/useProjects', () => ({useProjects: () => ({projects: {}})}))
vi.mock('@tanstack/vue-query', () => ({useQuery: () => ({data: ref([])})}))
vi.mock('@/client/queries/tasks', () => ({allTasksQuery: () => ({})}))
vi.mock('vue-i18n', () => ({useI18n: () => ({locale: ref('zh-TW')})}))
import FocusView from './FocusView.vue'

afterEach(() => vi.useRealTimers())
describe('FocusView recent records', () => {
	it('shows today and the previous six days while preserving lifetime totals', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(2026, 9, 26, 12))
		const wrapper = shallowMount(FocusView, {global: {mocks: {$t: (key: string) => key}, directives: {cy: () => {}}}})
		expect(wrapper.findAll('.focus-day-title').map(day => day.text())).toEqual(['10月26日', '10月20日'])
		expect(wrapper.findAll('.focus-record')).toHaveLength(2)
		expect(wrapper.findAll('.focus-stat-value')[2].text()).toBe('3')
		wrapper.unmount()
	})
})
