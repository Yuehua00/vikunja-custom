import type {Task} from '@/client/generated'

type ProgressSource = Pick<Task, 'done' | 'percent_done'>

export interface ParentProgress {
	// 0 to 1, rounded to two decimals so it stays a stable value across repeated syncs.
	percent: number
	allDone: boolean
}

// A finished subtask counts as fully done, whatever its own percentage says.
export function subtaskProgress(subtask: ProgressSource): number {
	return subtask.done ? 1 : Math.min(1, Math.max(0, subtask.percent_done ?? 0))
}

// The progress of a task is the mean progress of its subtasks; null when it has none.
export function computeParentProgress(subtasks: readonly ProgressSource[]): ParentProgress | null {
	if (subtasks.length === 0) {
		return null
	}

	const total = subtasks.reduce((sum, subtask) => sum + subtaskProgress(subtask), 0)
	return {
		percent: Math.round(total / subtasks.length * 100) / 100,
		allDone: subtasks.every(subtask => subtask.done),
	}
}
