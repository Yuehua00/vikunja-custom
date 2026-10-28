import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {mount} from '@vue/test-utils'
import {nextTick} from 'vue'
import WebPet from './WebPet.vue'
import {PET_COMPLETION_EVENT} from './petEffects'

vi.mock('vue-router', () => ({useRoute: () => ({fullPath: '/'})}))
vi.mock('@/stores/auth', () => ({useAuthStore: () => ({info: {id: 1}, settings: {frontend_settings: {}}})}))
let wrapper: ReturnType<typeof mount>
beforeEach(() => {
	vi.useFakeTimers()
	localStorage.clear()
	vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()}))
	vi.stubGlobal('Image', class {naturalWidth = 1254; naturalHeight = 1254; onload?: () => void; set src(_value: string) {this.onload?.()}})
	wrapper = mount(WebPet, {attachTo: document.body})
})
afterEach(() => {wrapper.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''})
describe('visible pet effects', () => {
	it('shows the stamp and response even with a leftover input focus', async () => {
		const input = document.createElement('input')
		document.body.append(input); input.focus()
		window.dispatchEvent(new CustomEvent(PET_COMPLETION_EVENT))
		await nextTick()
		expect(document.querySelector('.pet-completion-stamp')?.textContent).toBe('已完成')
		expect(document.querySelector('.pet-bubble')?.textContent).toContain('又完成')
		await vi.advanceTimersByTimeAsync(1800)
		expect(document.querySelector('.pet-completion-stamp')).toBeNull()
	})
	it('starts walking when blank space is double clicked while an input retains focus', async () => {
		const input = document.createElement('input')
		document.body.append(input); input.focus()
		document.body.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, clientX: 250, clientY: 200}))
		await nextTick()
		expect(document.querySelector('.web-pet')?.getAttribute('data-motion')).toBe('walk')
		await vi.advanceTimersByTimeAsync(30)
		expect(document.querySelector('.web-pet')?.getAttribute('data-motion')).toBe('walk')
	})
	it('does not summon when a control is double clicked', async () => {
		const input = document.createElement('input')
		document.body.append(input)
		input.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, clientX: 250, clientY: 200}))
		await nextTick()
		expect(document.querySelector('.web-pet')?.getAttribute('data-motion')).toBe('idle')
	})
})
