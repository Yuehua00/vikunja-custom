import {ref} from 'vue'

export interface FinishConfirmRequest {
	title: string
	subtasks: {id: number, title: string}[]
	resolve: (confirmed: boolean) => void
}

// The question that is open right now, shown by FinishSubtasksDialog. There is only ever one.
export const finishConfirmRequest = ref<FinishConfirmRequest | null>(null)

interface TaskWithSubtasks {
	title?: string
	related_tasks?: Record<string, readonly {id?: number, title?: string, done?: boolean}[] | null | undefined>
}

// Asks whether a task may be finished together with its unfinished subtasks, listing them. Answers yes right
// away for a task without any, so it can sit in front of every way a task gets finished.
export function confirmFinishingSubtasks(task: TaskWithSubtasks): Promise<boolean> {
	const open = (task.related_tasks?.subtask ?? []).filter(subtask => !subtask.done)
	if (open.length === 0) {
		return Promise.resolve(true)
	}

	// A second question while the first one is open counts as a no for the first.
	finishConfirmRequest.value?.resolve(false)

	return new Promise(resolve => {
		finishConfirmRequest.value = {
			title: task.title ?? '',
			subtasks: open.map(subtask => ({id: subtask.id ?? 0, title: subtask.title ?? ''})),
			resolve: confirmed => {
				finishConfirmRequest.value = null
				resolve(confirmed)
			},
		}
	})
}
