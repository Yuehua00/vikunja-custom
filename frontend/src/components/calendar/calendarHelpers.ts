import dayjs from 'dayjs'

import type {Task} from '@/client/generated'

export type CalendarMode = 'month' | 'week'

export interface CalendarRange {
	// First and last day (inclusive) shown in the grid, both at the start of their day.
	start: Date
	end: Date
}

export interface CalendarTaskSpan {
	start: Date
	end: Date
}

// Vikunja serializes unset dates as the zero time, which is not a real date.
export function isSetDate(date: string | null | undefined): date is string {
	return Boolean(date) && dayjs(date).year() > 1
}

export function startOfDay(date: Date): Date {
	return dayjs(date).startOf('day').toDate()
}

export function startOfWeek(date: Date, weekStart: number): Date {
	const day = dayjs(date).startOf('day')
	const diff = (day.day() - weekStart + 7) % 7
	return day.subtract(diff, 'day').toDate()
}

export function getCalendarRange(anchor: Date, mode: CalendarMode, weekStart: number): CalendarRange {
	if (mode === 'week') {
		const start = startOfWeek(anchor, weekStart)
		return {start, end: dayjs(start).add(6, 'day').toDate()}
	}

	const firstOfMonth = dayjs(anchor).startOf('month').toDate()
	const lastOfMonth = dayjs(anchor).endOf('month').startOf('day').toDate()
	const start = startOfWeek(firstOfMonth, weekStart)
	const end = dayjs(startOfWeek(lastOfMonth, weekStart)).add(6, 'day').toDate()
	return {start, end}
}

export function getDaysInRange(range: CalendarRange): Date[] {
	const days: Date[] = []
	let current = dayjs(range.start)
	const last = dayjs(range.end)
	while (!current.isAfter(last, 'day')) {
		days.push(current.toDate())
		current = current.add(1, 'day')
	}
	return days
}

export function shiftAnchor(anchor: Date, mode: CalendarMode, direction: -1 | 1): Date {
	return dayjs(anchor).add(direction, mode === 'week' ? 'week' : 'month').toDate()
}

// A task spans start_date to end_date when both are set, otherwise it sits on its due date,
// otherwise on whichever single date it has. Tasks without any date are not shown.
export function getTaskSpan(task: Task): CalendarTaskSpan | null {
	const hasStart = isSetDate(task.start_date)
	const hasEnd = isSetDate(task.end_date)
	const hasDue = isSetDate(task.due_date)

	if (hasStart && hasEnd) {
		const start = startOfDay(new Date(task.start_date!))
		const end = startOfDay(new Date(task.end_date!))
		return end < start ? {start: end, end: start} : {start, end}
	}

	const single = hasDue ? task.due_date : hasStart ? task.start_date : hasEnd ? task.end_date : null
	if (!single) {
		return null
	}

	const day = startOfDay(new Date(single))
	return {start: day, end: day}
}

export function taskCoversDay(span: CalendarTaskSpan, day: Date): boolean {
	const d = startOfDay(day).getTime()
	return span.start.getTime() <= d && d <= span.end.getTime()
}

export interface CalendarDayTask {
	task: Task
	span: CalendarTaskSpan
}

export function groupTasksByDay(tasks: Task[], days: Date[]): Map<number, CalendarDayTask[]> {
	const byDay = new Map<number, CalendarDayTask[]>(days.map(day => [day.getTime(), []]))

	for (const task of tasks) {
		const span = getTaskSpan(task)
		if (!span) {
			continue
		}
		for (const day of days) {
			if (taskCoversDay(span, day)) {
				byDay.get(day.getTime())!.push({task, span})
			}
		}
	}

	return byDay
}
