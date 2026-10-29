// A habit is done on some days of the week, with a weekly goal. Days are 0 (Sunday) to 6 (Saturday).
export interface Habit {
	id: string
	name: string
	days: number[]
	weekly_target: number
	// The project the habit practices in, so the overview can link to it.
	project_id?: number | null
}

// The days a habit was ticked off: local date (YYYY-MM-DD) to the ids of the habits done that day.
export type HabitLogs = Record<string, string[]>

export const DEFAULT_HABITS: Habit[] = [
	{id: 'speaking', name: '英文口說', days: [1, 2, 3, 4, 5], weekly_target: 5},
	{id: 'leetcode', name: 'LeetCode', days: [1, 3, 5], weekly_target: 3},
	{id: 'ctf', name: '資安 CTF', days: [2, 6], weekly_target: 2},
	{id: 'hardware-ai', name: '硬體或 AI 用法', days: [4, 0], weekly_target: 2},
]

// Longest streak that is looked back, so a corrupt log can never loop for long.
const MAX_STREAK_WEEKS = 520

const pad = (value: number) => String(value).padStart(2, '0')

export function dateKey(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Weeks start on Monday, which is how the weekly schedule is planned.
export function weekStartOf(date: Date): Date {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
	start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
	return start
}

export function weekDates(date: Date): Date[] {
	const start = weekStartOf(date)
	return Array.from({length: 7}, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

export function isScheduled(habit: Habit, date: Date): boolean {
	return habit.days.includes(date.getDay())
}

export function isDone(logs: Readonly<Record<string, readonly string[]>> | undefined, habitId: string, date: Date): boolean {
	return (logs?.[dateKey(date)] ?? []).includes(habitId)
}

// How often the habit was done in the week that contains the date.
export function weekCount(habit: Habit, logs: Readonly<Record<string, readonly string[]>> | undefined, date: Date): number {
	return weekDates(date).filter(day => isDone(logs, habit.id, day)).length
}

// Consecutive weeks in which the goal was reached. The running week only counts once its goal is
// reached, and does not break the streak while it is still open.
export function streakWeeks(habit: Habit, logs: Readonly<Record<string, readonly string[]>> | undefined, today: Date): number {
	const target = Math.max(1, habit.weekly_target)
	let streak = weekCount(habit, logs, today) >= target ? 1 : 0
	const cursor = weekStartOf(today)
	for (let i = 0; i < MAX_STREAK_WEEKS; i++) {
		cursor.setDate(cursor.getDate() - 7)
		if (weekCount(habit, logs, cursor) < target) {
			break
		}
		streak++
	}
	return streak
}

// The logs with the habit ticked on that day, or unticked when it already was. A day with nothing left
// keeps an empty list: the settings are saved as a merge patch, which would not drop a missing key.
export function toggleLog(logs: Readonly<Record<string, readonly string[]>> | undefined, habitId: string, date: Date): HabitLogs {
	const key = dateKey(date)
	const ids = logs?.[key] ?? []
	return {
		...Object.fromEntries(Object.entries(logs ?? {}).map(([day, ids]) => [day, [...ids]])),
		[key]: ids.includes(habitId) ? ids.filter(id => id !== habitId) : [...ids, habitId],
	}
}
