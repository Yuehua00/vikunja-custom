import type {IRepeatAfter} from '@/types/IRepeatAfter'

export interface repeatParsedResult {
	textWithoutMatched: string,
	repeats: IRepeatAfter | null,
}

export interface ParsedTaskText {
	text: string,
	date: Date | null,
	// Parts of the original text recognized as date or time. Only set when something was found.
	dateMatches?: string[],
	labels: string[],
	project: string | null,
	priority: number | null,
	assignees: string[],
	repeats: IRepeatAfter | null,
}

export interface Prefixes {
	label: string,
	project: string,
	priority: string,
	assignee: string,
}
