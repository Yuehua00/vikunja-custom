export const PRIORITIES = {
	'UNSET': 0,
	'LOW': 1,
	'MEDIUM': 2,
	'HIGH': 3,
	'URGENT': 4,
	'DO_NOW': 5,
} as const

export type Priority = typeof PRIORITIES[keyof typeof PRIORITIES]

export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent'

/**
 * The level used to tint a task by its priority, or undefined when the task should not be tinted:
 * unset priority, done tasks and priorities below the user's minimum priority setting.
 */
export function getPriorityLevel(priority: number | undefined, done: boolean | undefined, minimumPriority: number): PriorityLevel | undefined {
	const value = priority ?? PRIORITIES.UNSET
	if (done || value === PRIORITIES.UNSET || value < minimumPriority) {
		return undefined
	}
	if (value >= PRIORITIES.URGENT) {
		return 'urgent'
	}
	if (value >= PRIORITIES.HIGH) {
		return 'high'
	}
	return value > PRIORITIES.LOW ? 'medium' : 'low'
}
