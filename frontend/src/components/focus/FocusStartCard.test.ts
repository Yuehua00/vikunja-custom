import {mount, flushPromises} from '@vue/test-utils'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import FocusStartCard from './FocusStartCard.vue'

const mocks = vi.hoisted(() => ({start: vi.fn(), setMinutes: vi.fn(), push: vi.fn(), success: vi.fn()}))
const active = ref<null | {task_title: string}>(null)
vi.mock('@/composables/useFocusTimer', () => ({useFocusTimer: () => ({active, pomoMinutes: ref(25), start: mocks.start, setPomoMinutes: mocks.setMinutes})}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key})}))
vi.mock('vue-router', () => ({useRouter: () => ({push: mocks.push})}))
vi.mock('@/message', () => ({success: mocks.success}))

function render() {
	return mount(FocusStartCard, {
		props: {taskId: 14, taskTitle: '論文整理', projectId: 2},
		global: {
			mocks: {$t: (key: string) => key},
			directives: {cy: {}},
			stubs: {Modal: {template: '<div><slot /></div>'}, Icon: true, XButton: {props: ['disabled', 'loading'], template: '<button :disabled="disabled"><slot /></button>'}},
		},
	})
}

describe('FocusStartCard', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		active.value = null
		mocks.start.mockResolvedValue(undefined)
		mocks.setMinutes.mockResolvedValue(undefined)
	})

	it('starts the selected preset for the correct task and remembers it', async () => {
		const wrapper = render()
		await wrapper.findAll('.focus-start-presets button')[2].trigger('click')
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(mocks.setMinutes).toHaveBeenCalledWith(45)
		expect(mocks.start).toHaveBeenCalledWith({taskId: 14, taskTitle: '論文整理', projectId: 2, mode: 'pomo', minutes: 45})
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('accepts a custom duration', async () => {
		const wrapper = render()
		await wrapper.find('input').setValue(32)
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({minutes: 32}))
	})

	it('starts a stopwatch without changing the countdown preference', async () => {
		const wrapper = render()
		await wrapper.findAll('.focus-start-modes button')[1].trigger('click')
		expect(wrapper.find('input').exists()).toBe(false)
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({mode: 'stopwatch'}))
		expect(mocks.setMinutes).not.toHaveBeenCalled()
	})

	it('prevents duplicate starts and dismissal while saving', async () => {
		let finish!: () => void
		mocks.start.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
		const wrapper = render()
		await wrapper.find('form').trigger('submit')
		await wrapper.find('form').trigger('submit')
		await wrapper.find('[aria-label="關閉"]').trigger('click')
		expect(mocks.start).toHaveBeenCalledTimes(1)
		expect(wrapper.emitted('close')).toBeUndefined()
		finish()
		await flushPromises()
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('keeps the dialog open after failure and allows retry', async () => {
		mocks.start.mockRejectedValueOnce(new Error('offline'))
		const wrapper = render()
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(wrapper.find('[role="alert"]').exists()).toBe(true)
		expect(wrapper.emitted('close')).toBeUndefined()
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(wrapper.emitted('close')).toHaveLength(1)
	})

	it('does not start a timer when saving its preference fails', async () => {
		mocks.setMinutes.mockRejectedValueOnce(new Error('offline'))
		const wrapper = render()
		await wrapper.find('input').setValue(60)
		await wrapper.find('form').trigger('submit')
		await flushPromises()
		expect(mocks.start).not.toHaveBeenCalled()
		expect(wrapper.find('[role="alert"]').exists()).toBe(true)
	})

	it('offers the focus page when a timer is already running', async () => {
		active.value = {task_title: '現有專注'}
		const wrapper = render()
		expect(wrapper.find('form').exists()).toBe(false)
		await wrapper.find('.focus-start-button').trigger('click')
		expect(mocks.push).toHaveBeenCalledWith({name: 'focus'})
		expect(mocks.start).not.toHaveBeenCalled()
	})
})
