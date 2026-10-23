import dayjs from 'dayjs'

import type {Label} from '@/client/generated'

// The diary is one project; every day is one finished task in it, titled with the date.
export const DIARY_PROJECT_TITLE = '日記'

export const MOODS = ['good', 'ok', 'low'] as const
export type Mood = typeof MOODS[number]

export const MOOD_COLORS: Record<Mood, string> = {
	good: '#3fa874',
	ok: '#e0a82e',
	low: '#5b7fa6',
}

const DATE_FORMAT = 'YYYY-MM-DD'
const DATE_TITLE = /^\d{4}-\d{2}-\d{2}$/

export function moodLabelTitle(mood: Mood): string {
	return `mood-${mood}`
}

export function diaryDateKey(date: Date | string): string {
	return dayjs(date).format(DATE_FORMAT)
}

export function isDiaryTitle(title: string | undefined): title is string {
	return title !== undefined && DATE_TITLE.test(title)
}

export function moodOf(labels: readonly Label[] | undefined): Mood | undefined {
	const titles = new Set((labels ?? []).map(label => label.title))
	return MOODS.find(mood => titles.has(moodLabelTitle(mood)))
}

// First line of the text of a description, for the list of past entries.
export function diaryPreview(description: string | undefined, maxLength = 60): string {
	const text = (description ?? '')
		.replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.split('\n')
		.map(line => line.trim())
		.find(line => line !== '') ?? ''
	return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}
