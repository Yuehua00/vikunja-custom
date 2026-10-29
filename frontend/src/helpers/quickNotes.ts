export function noteDraftKey(server: string, owner: number, id: number) {
	return `vikunja:quick-note:${encodeURIComponent(server)}:${owner}:${id}`
}

// Only one write at a time. A keystroke arriving during a save gets a second snapshot,
// after the first response has supplied the next server revision.
export function createNoteSaveQueue<T>(read: () => T, write: (draft: T) => Promise<void>) {
	let changed = 0
	let saved = 0
	let running: Promise<boolean> | undefined
	return {
		get dirty() {return changed !== saved},
		markChanged() {changed++},
		flush(): Promise<boolean> {
			if (running) return running
			running = (async () => {
				try {
					while (saved !== changed) {
						const snapshot = changed
						await write(read())
						saved = snapshot
					}
					return true
				} catch {return false}
			})().finally(() => {running = undefined})
			return running
		},
	}
}
