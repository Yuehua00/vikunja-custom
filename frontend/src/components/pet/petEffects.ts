export const PET_COMPLETION_EVENT = 'vikunja:pet-task-completed'

export function announceTaskCompletion(previousDone: boolean | undefined, task: {id?: number; done?: boolean}) {
	if (previousDone !== false || task.done !== true || !task.id || typeof window === 'undefined') return
	window.dispatchEvent(new CustomEvent(PET_COMPLETION_EVENT, {detail: {id: task.id}}))
}

// A burst produces one small response instead of a queue of celebrations.
export function createEffectGate(interval: number) {
	let next = 0
	return (now = Date.now()) => {
		if (now < next) return false
		next = now + interval
		return true
	}
}

export function isPetBlankArea(target: EventTarget | null) {
	return target instanceof Element && !target.closest(
		'button,a,input,textarea,select,label,[contenteditable],[role=button],[role=dialog],.modal-container,.task,.draw-card,.web-pet-layer,svg,img',
	)
}
