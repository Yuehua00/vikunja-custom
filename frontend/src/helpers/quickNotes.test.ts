import {describe, expect, it} from 'vitest'
import {createNoteSaveQueue, noteDraftKey} from './quickNotes'

describe('quick note save queue', () => {
	it('serializes typing during a save and uses the new server revision', async () => {
		let content = 'first'; let version = 1
		const calls: {content: string, version: number}[] = []
		let release!: () => void
		const queue = createNoteSaveQueue(() => ({content, version}), async draft => {
			calls.push(draft)
			if (calls.length === 1) await new Promise<void>(resolve => {release = resolve})
			version++
		})
		queue.markChanged()
		const pending = queue.flush()
		content = 'second'; queue.markChanged()
		release(); expect(await pending).toBe(true)
		expect(calls).toEqual([{content: 'first', version: 1}, {content: 'second', version: 2}])
		expect(queue.dirty).toBe(false)
	})
	it('keeps a failed draft dirty and permits retry', async () => {
		let fail = true
		const queue = createNoteSaveQueue(() => 'draft', async () => {if (fail) throw new Error('offline')})
		queue.markChanged(); expect(await queue.flush()).toBe(false); expect(queue.dirty).toBe(true)
		fail = false; expect(await queue.flush()).toBe(true); expect(queue.dirty).toBe(false)
	})
	it('isolates drafts by API server, user and note', () => {
		expect(new Set([noteDraftKey('a', 1, 2), noteDraftKey('b', 1, 2), noteDraftKey('a', 2, 2), noteDraftKey('a', 1, 3)]).size).toBe(4)
	})
})
