import {afterEach, describe, expect, it, vi} from 'vitest'
import {announceTaskCompletion, createEffectGate, isPetBlankArea, PET_COMPLETION_EVENT} from './petEffects'

afterEach(() => vi.restoreAllMocks())
describe('pet interaction effects', () => {
	it('announces only a confirmed unfinished to finished transition', () => {
		const dispatch = vi.spyOn(window, 'dispatchEvent')
		announceTaskCompletion(false, {id: 2, done: false})
		announceTaskCompletion(true, {id: 2, done: true})
		announceTaskCompletion(undefined, {id: 2, done: true})
		expect(dispatch).not.toHaveBeenCalled()
		announceTaskCompletion(false, {id: 2, done: true})
		expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({type: PET_COMPLETION_EVENT, detail: {id: 2}}))
	})
	it('coalesces bursts and allows a later response', () => {
		const allow = createEffectGate(4000)
		expect(allow(100)).toBe(true)
		expect(allow(101)).toBe(false)
		expect(allow(4099)).toBe(false)
		expect(allow(4100)).toBe(true)
	})
	it('summons only from blank areas, never controls or task content', () => {
		for (const markup of ['<button><span></span></button>', '<div class="task"><span></span></div>', '<div contenteditable="true"><span></span></div>', '<a><span></span></a>']) {
			const host = document.createElement('div')
			host.innerHTML = markup
			expect(isPetBlankArea(host.querySelector('span'))).toBe(false)
		}
		expect(isPetBlankArea(document.createElement('main'))).toBe(true)
	})
})
