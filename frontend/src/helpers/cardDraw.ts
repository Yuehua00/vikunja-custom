import type {Task} from '@/client/generated'
import {isSetDate} from '@/components/calendar/calendarHelpers'

export type CardDrawInterval = 'open' | 'day' | 'days3' | 'week' | 'custom'

// Saved per account and per view, so the same card stays across devices until it is due to change.
export interface CardDrawState {
	interval: CardDrawInterval
	custom_days?: number
	task_id?: number
	drawn_at?: string
}

export const DEFAULT_CARD_DRAW_STATE: CardDrawState = {interval: 'day'}

// How long a skipped card stays out of the draw.
export const SKIP_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_CUSTOM_DAYS = 365

// null while the card changes on every open instead of after a period.
export function intervalDays(state: CardDrawState): number | null {
	switch (state.interval) {
		case 'open':
			return null
		case 'day':
			return 1
		case 'days3':
			return 3
		case 'week':
			return 7
		case 'custom':
			return Math.min(MAX_CUSTOM_DAYS, Math.max(1, Math.round(state.custom_days ?? 1)))
	}
}

export function nextChangeAt(state: CardDrawState): Date | null {
	const days = intervalDays(state)
	if (days === null || !state.drawn_at) {
		return null
	}
	return new Date(new Date(state.drawn_at).getTime() + days * DAY_MS)
}

// True when no card was drawn yet or the period of the current one is over.
export function isDrawDue(state: CardDrawState, now: Date): boolean {
	if (!state.task_id || !state.drawn_at) {
		return true
	}
	const next = nextChangeAt(state)
	return next !== null && now >= next
}

// Finished cards and cards skipped into the future are not drawn.
export function isDrawable(task: Pick<Task, 'done' | 'start_date'>, now: Date): boolean {
	if (task.done) {
		return false
	}
	return !(isSetDate(task.start_date) && new Date(task.start_date) > now)
}

// Unset importance sits between low and mid, so unrated cards still come up.
const IMPORTANCE_WEIGHTS = [2, 1, 2, 4, 8, 16] as const
const MAX_AGE_DAYS = 90

// Importance raises the chance a lot; waiting raises it up to a factor of 4, so nothing is forgotten.
export function drawWeight(task: Pick<Task, 'importance' | 'created'>, now: Date): number {
	const importance = Math.min(5, Math.max(0, task.importance ?? 0))
	const created = task.created ? new Date(task.created).getTime() : now.getTime()
	const ageDays = Math.min(MAX_AGE_DAYS, Math.max(0, (now.getTime() - created) / DAY_MS))
	return IMPORTANCE_WEIGHTS[importance] * (1 + ageDays / 30)
}

export function pickCard<T extends Pick<Task, 'id' | 'importance' | 'created'>>(
	pool: readonly T[],
	now: Date,
	excludeId?: number,
	random: () => number = Math.random,
): T | undefined {
	// Drawing again should not hand back the same card, unless it is the only one.
	const candidates = pool.filter(task => task.id !== excludeId)
	const source = candidates.length > 0 ? candidates : pool
	if (source.length === 0) {
		return undefined
	}

	const weights = source.map(task => drawWeight(task, now))
	let remaining = random() * weights.reduce((sum, weight) => sum + weight, 0)
	for (let index = 0; index < source.length; index++) {
		remaining -= weights[index]
		if (remaining < 0) {
			return source[index]
		}
	}
	return source[source.length - 1]
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/

export function extractLink(description: string | undefined): string | null {
	const match = URL_PATTERN.exec(description ?? '')
	return match ? match[0].replace(TRAILING_PUNCTUATION, '') : null
}

// The description is rich text; the card shows it as plain text without the link it already lists.
export function summaryOf(description: string | undefined, maxLength = 400): string {
	if (!description) {
		return ''
	}

	const withBreaks = description
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
	const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? ''
	const link = extractLink(description)
	const cleaned = (link ? text.replace(link, '') : text)
		.replace(/[ \t]+/g, ' ')
		.replace(/\n\s*\n+/g, '\n')
		.trim()

	return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trimEnd() + '...' : cleaned
}
