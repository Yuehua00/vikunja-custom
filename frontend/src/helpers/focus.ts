import type {Task} from '@/client/generated'
import {isSetDate} from '@/components/calendar/calendarHelpers'

export type FocusMode = 'pomo' | 'stopwatch'

export const DEFAULT_POMO_MINUTES = 25
export const MIN_POMO_MINUTES = 1
export const MAX_POMO_MINUTES = 180

// A session shorter than this is treated as an accidental click and not recorded.
export const MIN_RECORD_SECONDS = 5

// How far ahead a task still counts as one of the tasks to work on now.
const CANDIDATE_WINDOW_DAYS = 14

// The timer that is running right now. It stores the start time, not a countdown, so it survives
// reloads and shows the same on every device.
export interface ActiveFocus {
	task_id: number | null
	// Copied when the timer starts, so a record stays readable after the task is renamed or deleted.
	task_title: string
	// The project of the task, for its color. Missing on timers and records from before it was kept.
	project_id?: number | null
	mode: FocusMode
	started_at: string
	duration_seconds?: number
}

// A pomodoro that has just run out. It stays until the user decides what is next: it is already recorded.
export interface FocusEnded {
	task_id: number | null
	task_title: string
	project_id?: number | null
	duration_seconds: number
	ended_at: string
}

export interface FocusRecord {
	id: string
	task_id: number | null
	task_title: string
	project_id?: number | null
	mode: FocusMode
	started_at: string
	ended_at: string
	seconds: number
	// A pomodoro that ran to the end. Only these count as pomodoros.
	completed: boolean
}

// Records are kept per month ("2026-10"), which keeps one account setting from growing without bound.
export type FocusRecords = Record<string, FocusRecord[]>

export function clampPomoMinutes(minutes: number | undefined): number {
	if (minutes === undefined || !Number.isFinite(minutes)) {
		return DEFAULT_POMO_MINUTES
	}
	return Math.min(MAX_POMO_MINUTES, Math.max(MIN_POMO_MINUTES, Math.round(minutes)))
}

const pad = (value: number) => String(value).padStart(2, '0')

export function dayKey(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function monthKey(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

// Newest first, and a record saved twice by two open devices only counts once.
export function flattenRecords(records: Readonly<Record<string, readonly FocusRecord[]>> | undefined): FocusRecord[] {
	const unique = new Map<string, FocusRecord>()
	for (const month of Object.values(records ?? {})) {
		for (const record of month ?? []) {
			unique.set(record.id, record)
		}
	}
	return [...unique.values()].sort((a, b) => b.started_at.localeCompare(a.started_at))
}

export function elapsedSeconds(active: ActiveFocus, nowMs: number): number {
	return Math.max(0, Math.floor((nowMs - new Date(active.started_at).getTime()) / 1000))
}

export function remainingSeconds(active: ActiveFocus, nowMs: number): number {
	return Math.max(0, (active.duration_seconds ?? 0) - elapsedSeconds(active, nowMs))
}

// 25:00, or 1:05:00 from one hour on.
export function formatClock(totalSeconds: number): string {
	const seconds = Math.max(0, Math.floor(totalSeconds))
	const hours = Math.floor(seconds / 3600)
	const minutes = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
	return hours >= 1 ? `${hours}:${minutes}` : minutes
}

// 49m, 2h42m.
export function formatDuration(totalSeconds: number): string {
	const minutes = Math.round(Math.max(0, totalSeconds) / 60)
	const hours = Math.floor(minutes / 60)
	return hours >= 1 ? `${hours}h${pad(minutes % 60)}m` : `${minutes}m`
}

export function buildRecord(active: ActiveFocus, endedAt: Date, completed: boolean): FocusRecord {
	const seconds = completed && active.duration_seconds !== undefined
		? active.duration_seconds
		: Math.max(0, Math.floor((endedAt.getTime() - new Date(active.started_at).getTime()) / 1000))
	return {
		// The start time identifies the session, so finishing it twice cannot add a second record.
		id: active.started_at,
		task_id: active.task_id,
		task_title: active.task_title,
		project_id: active.project_id,
		mode: active.mode,
		started_at: active.started_at,
		ended_at: endedAt.toISOString(),
		seconds,
		completed,
	}
}

export interface FocusStats {
	todayPomos: number
	todaySeconds: number
	totalPomos: number
	totalSeconds: number
}

export function computeStats(records: readonly FocusRecord[], now: Date): FocusStats {
	const today = dayKey(now)
	const stats: FocusStats = {todayPomos: 0, todaySeconds: 0, totalPomos: 0, totalSeconds: 0}
	for (const record of records) {
		const isPomo = record.mode === 'pomo' && record.completed
		stats.totalSeconds += record.seconds
		if (isPomo) {
			stats.totalPomos++
		}
		if (dayKey(new Date(record.started_at)) === today) {
			stats.todaySeconds += record.seconds
			if (isPomo) {
				stats.todayPomos++
			}
		}
	}
	return stats
}

export interface FocusDay {
	day: string
	records: FocusRecord[]
}

// Records come newest first, so the days and the records inside them keep that order.
export function groupByDay(records: readonly FocusRecord[]): FocusDay[] {
	const days: FocusDay[] = []
	for (const record of records) {
		const day = dayKey(new Date(record.started_at))
		const last = days[days.length - 1]
		if (last?.day === day) {
			last.records.push(record)
		} else {
			days.push({day, records: [record]})
		}
	}
	return days
}

// Tasks due within this many days, or already overdue, are flagged.
export const DUE_SOON_DAYS = 2

const DAY_MS = 24 * 60 * 60 * 1000

export interface DueCountdown {
	// Whole days until the due date; negative once it is overdue, 0 on the day itself.
	days: number
	isSoon: boolean
}

export function dueCountdown(task: Pick<Task, 'due_date'>, now: Date): DueCountdown | null {
	if (!isSetDate(task.due_date)) {
		return null
	}
	const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
	const days = Math.round((startOfDay(new Date(task.due_date)) - startOfDay(now)) / DAY_MS)
	return {days, isSoon: days <= DUE_SOON_DAYS}
}

// A project color as a CSS color, or undefined when the project has none.
export function projectColorOf(hex: string | undefined): string | undefined {
	if (!hex) {
		return undefined
	}
	return hex.startsWith('#') ? hex : `#${hex}`
}

// Open tasks that are overdue or have a date within the next two weeks.
export function isFocusCandidate(
	task: Pick<Task, 'done' | 'due_date' | 'start_date' | 'end_date'>,
	now: Date,
): boolean {
	if (task.done) {
		return false
	}
	const limit = new Date(now)
	limit.setDate(limit.getDate() + CANDIDATE_WINDOW_DAYS)
	limit.setHours(23, 59, 59, 999)

	return [task.due_date, task.start_date, task.end_date]
		.some(date => isSetDate(date) && new Date(date) <= limit)
}
