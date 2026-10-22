import type {Task} from '@/client/generated'

type StatusSource = Pick<Task, 'done' | 'percent_done' | 'paused'>

// A task that was started and is being worked on: it has some progress, is not finished and not paused.
export function isInProgress(task: StatusSource): boolean {
	return !task.done && !task.paused && (task.percent_done ?? 0) > 0
}

// A task that was started and is put aside for now. Its progress is kept.
export function isPaused(task: StatusSource): boolean {
	return !task.done && Boolean(task.paused) && (task.percent_done ?? 0) > 0
}
