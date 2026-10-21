import {parseDate} from './dateParser'
import {PREFIXES, PrefixMode} from './prefixes'
import {getItemsFromPrefix, getLabelsFromPrefix, getProjectFromPrefix} from './prefixParser'
import {getPriority} from './priorityParser'
import {getRepeats} from './repeatParser'
import {cleanupItemText, cleanupResult} from './textCleanup'
import type {ParsedTaskText} from './types'

/**
 * Parses task text for dates, assignees, labels, projects, priorities and returns an object with all found intents.
 *
 * @param text
 */
export const parseTaskText = (text: string, prefixesMode: PrefixMode = PrefixMode.Default, now: Date = new Date()): ParsedTaskText => {
	const result: ParsedTaskText = {
		text: text,
		date: null,
		labels: [],
		project: null,
		priority: null,
		assignees: [],
		repeats: null,
	}

	// If the entire text is wrapped in quotes, strip them and skip all parsing
	if (
		text.length >= 2
		&& ((text.startsWith('"') && text.endsWith('"'))
			|| (text.startsWith('\'') && text.endsWith('\'')))
	) {
		result.text = text.slice(1, -1)
		return result
	}

	const prefixes = PREFIXES[prefixesMode]
	if (prefixes === undefined) {
		return result
	}

	result.labels = getLabelsFromPrefix(text, prefixesMode) ?? []
	result.text = cleanupItemText(result.text, result.labels, prefixes.label)

	result.project = getProjectFromPrefix(result.text, prefixesMode)
	result.text = result.project !== null ? cleanupItemText(result.text, [result.project], prefixes.project) : result.text

	result.priority = getPriority(result.text, prefixes.priority)
	result.text = result.priority !== null ? cleanupItemText(result.text, [String(result.priority)], prefixes.priority) : result.text

	result.assignees = getItemsFromPrefix(result.text, prefixes.assignee)

	const {textWithoutMatched, repeats} = getRepeats(result.text)
	result.text = textWithoutMatched
	result.repeats = repeats

	const {newText, date, matched} = parseDate(result.text, now)
	result.text = newText
	result.date = date
	if (matched !== undefined && matched.length > 0) {
		result.dateMatches = matched
	}

	return cleanupResult(result, prefixes)
}

export type HighlightKind = 'date' | 'label' | 'project' | 'priority'

export interface HighlightRange {
	start: number,
	end: number,
	kind: HighlightKind,
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Finds the parts of a single line of task text that quick add magic recognizes
 * (date and time, labels, project and priority) so they can be highlighted while typing.
 */
export const getHighlightRanges = (text: string, prefixesMode: PrefixMode = PrefixMode.Default, now: Date = new Date()): HighlightRange[] => {
	const prefixes = PREFIXES[prefixesMode]
	if (prefixes === undefined || text === '') {
		return []
	}

	const parsed = parseTaskText(text, prefixesMode, now)
	const ranges: HighlightRange[] = []

	// A prefix only counts at the start of the text or after a space, like in getItemsFromPrefix.
	const addPrefixed = (prefix: string, items: string[], kind: HighlightKind) => {
		for (const item of items) {
			if (item === '') {
				continue
			}
			const escaped = escapeRegExp(item)
			const regex = new RegExp(`(?<![^ ])${escapeRegExp(prefix)}('${escaped}'|"${escaped}"|${escaped}(?![^ ]))`, 'ig')
			let match: RegExpExecArray | null
			while ((match = regex.exec(text)) !== null) {
				ranges.push({start: match.index, end: match.index + match[0].length, kind})
			}
		}
	}

	addPrefixed(prefixes.label, parsed.labels, 'label')
	addPrefixed(prefixes.project, parsed.project !== null ? [parsed.project] : [], 'project')
	addPrefixed(prefixes.priority, parsed.priority !== null ? [String(parsed.priority)] : [], 'priority')

	const lowerText = text.toLowerCase()
	for (const dateMatch of parsed.dateMatches ?? []) {
		const start = lowerText.indexOf(dateMatch.toLowerCase())
		if (start !== -1) {
			ranges.push({start, end: start + dateMatch.length, kind: 'date'})
		}
	}

	ranges.sort((a, b) => a.start - b.start)

	// Join overlapping ranges, and ranges of the same kind that are only separated by whitespace.
	const merged: HighlightRange[] = []
	for (const range of ranges) {
		const last = merged[merged.length - 1]
		if (last !== undefined && (range.start < last.end || (range.kind === last.kind && text.slice(last.end, range.start).trim() === ''))) {
			last.end = Math.max(last.end, range.end)
		} else {
			merged.push({...range})
		}
	}

	return merged
}
