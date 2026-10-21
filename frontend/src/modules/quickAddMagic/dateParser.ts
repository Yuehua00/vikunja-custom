import {calculateDayInterval} from '@/helpers/time/calculateDayInterval'
import {getDateWithTime} from '@/helpers/time/getDateWithTime'
import {replaceAll} from '@/helpers/replaceAll'

export interface dateParseResult {
	newText: string,
	date: Date | null,
	// The parts of the text that were recognized as date or time, used to highlight them in the input.
	matched?: string[],
}

interface dateFoundResult {
	foundText: string | null,
	date: Date | null,
}

const monthsRegexGroup = '(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)'

/**
 * Matches a date regex against text, rejecting matches that appear in the middle
 * of text with non-date content on both sides. This prevents false positives like
 * "The 9/11 Report" while still allowing "meeting 9/11 at 10:00".
 *
 * Matches at the start or end of text are always accepted. Middle matches are
 * only accepted when followed by a time expression (at/@ prefix).
 */
function matchDateAtBoundary(text: string, pattern: string): RegExpExecArray | null {
	const regex = new RegExp(`(^| )${pattern}($| )`, 'gi')
	let result: RegExpExecArray | null
	while ((result = regex.exec(text)) !== null) {
		const matchEnd = result.index + result[0].length
		const isAtStart = result.index === 0
		const isAtEnd = matchEnd >= text.length

		if (isAtStart || isAtEnd) return result

		// Allow middle-of-text matches when followed by a time expression
		const afterMatch = text.substring(matchEnd)
		if (/^(at |@ )/i.test(afterMatch)) return result
	}

	return null
}

function matchesDateExpr(text: string, dateExpr: string): boolean {
	return text.match(new RegExp('(^| )' + dateExpr, 'gi')) !== null
}

const CHINESE_NUMBERS: Record<string, number> = {
	'一': 1, '二': 2, '兩': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
}
const CHINESE_WEEKDAYS: Record<string, number> = {
	'日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
}
const chineseNumberGroup = '([0-9]+|[一二兩两三四五六七八九十])'
const chineseWeekWords = '(?:週|周|星期|禮拜|礼拜)'

function parseChineseNumber(value: string): number {
	return CHINESE_NUMBERS[value] ?? parseInt(value)
}

/**
 * Finds Chinese date expressions like 今天, 明天, 後天, 下週三, 10月21日, 3天後.
 * Chinese text has no spaces between words, so unlike the English expressions these are matched anywhere in the text.
 */
const getDateFromChineseText = (text: string, now: Date = new Date()): dateFoundResult => {
	const startOfToday = new Date(now)
	startOfToday.setHours(0, 0, 0, 0)

	const inDays = (days: number): Date => {
		const date = new Date(now)
		date.setDate(date.getDate() + days)
		return getDateWithTime(date)
	}
	const found = (match: RegExpExecArray, date: Date): dateFoundResult => ({foundText: match[0], date})

	let match: RegExpExecArray | null

	match = /(\d{4})年(\d{1,2})月(\d{1,2})[日號号]?/.exec(text)
	if (match !== null) {
		const date = getDateWithTime(new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3])))
		if (!isNaN(date.getTime())) {
			return found(match, date)
		}
	}

	match = /(\d{1,2})月(\d{1,2})[日號号]?/.exec(text)
	if (match !== null) {
		const date = getDateWithTime(new Date(now.getFullYear(), parseInt(match[1]) - 1, parseInt(match[2])))
		if (!isNaN(date.getTime())) {
			if (date < startOfToday) {
				date.setFullYear(date.getFullYear() + 1)
			}
			return found(match, date)
		}
	}

	match = new RegExp(chineseNumberGroup + '個?天[後后]').exec(text)
	if (match !== null) {
		return found(match, inDays(parseChineseNumber(match[1])))
	}

	match = new RegExp(chineseNumberGroup + '個?' + chineseWeekWords + '[後后]').exec(text)
	if (match !== null) {
		return found(match, inDays(parseChineseNumber(match[1]) * 7))
	}

	match = new RegExp(chineseNumberGroup + '個月[後后]').exec(text)
	if (match !== null) {
		const date = new Date(now)
		date.setMonth(date.getMonth() + parseChineseNumber(match[1]))
		return found(match, getDateWithTime(date))
	}

	// Weeks start on Monday here. 下週三 is Wednesday of next week, 本週三 / 這週三 is Wednesday of this week
	// and a bare 週三 is the next upcoming Wednesday (today included).
	match = new RegExp('(下|本|這|这)?' + chineseWeekWords + '([日天一二三四五六])').exec(text)
	if (match !== null) {
		const currentIndex = (now.getDay() + 6) % 7
		const targetIndex = (CHINESE_WEEKDAYS[match[2]] + 6) % 7
		let days = (targetIndex - currentIndex + 7) % 7
		if (match[1] === '下') {
			days = 7 - currentIndex + targetIndex
		} else if (match[1] !== undefined) {
			days = targetIndex - currentIndex
		}
		return found(match, inDays(days))
	}

	match = /大[後后]天/.exec(text)
	if (match !== null) {
		return found(match, inDays(3))
	}

	match = /[後后]天/.exec(text)
	if (match !== null) {
		return found(match, inDays(2))
	}

	match = /明[天日]/.exec(text)
	if (match !== null) {
		return found(match, inDays(1))
	}

	match = /今晚/.exec(text)
	if (match !== null) {
		const date = inDays(0)
		date.setHours(21)
		return found(match, date)
	}

	match = /今[天日]/.exec(text)
	if (match !== null) {
		return found(match, inDays(0))
	}

	match = new RegExp('下(?:個|个)?' + chineseWeekWords).exec(text)
	if (match !== null) {
		return found(match, inDays(7))
	}

	match = /下(?:個|个)月/.exec(text)
	if (match !== null) {
		const date = new Date(now)
		date.setDate(1)
		date.setMonth(date.getMonth() + 1)
		return found(match, getDateWithTime(date))
	}

	match = /月底/.exec(text)
	if (match !== null) {
		return found(match, getDateWithTime(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
	}

	return {foundText: null, date: null}
}

export const parseDate = (text: string, now: Date = new Date()): dateParseResult => {
	const chinese = getDateFromChineseText(text, now)
	if (chinese.date !== null) {
		return addTimeToDate(text, chinese.date, chinese.foundText)
	}

	if (matchesDateExpr(text, 'today')) {
		return addTimeToDate(text, getDateFromInterval(calculateDayInterval('today')), 'today')
	}
	if (matchesDateExpr(text, 'tonight')) {
		const taskDate = getDateFromInterval(calculateDayInterval('today'))
		taskDate.setHours(21)
		return addTimeToDate(text, taskDate, 'tonight')
	}
	if (matchesDateExpr(text, 'tomorrow')) {
		return addTimeToDate(text, getDateFromInterval(calculateDayInterval('tomorrow')), 'tomorrow')
	}
	if (matchesDateExpr(text, 'next monday')) {
		return addTimeToDate(text, getDateFromInterval(calculateDayInterval('nextMonday')), 'next monday')
	}
	if (matchesDateExpr(text, 'this weekend')) {
		return addTimeToDate(text, getDateFromInterval(calculateDayInterval('thisWeekend')), 'this weekend')
	}
	if (matchesDateExpr(text, 'later this week')) {
		return addTimeToDate(text, getDateFromInterval(calculateDayInterval('laterThisWeek')), 'later this week')
	}
	if (matchesDateExpr(text, 'later next week')) {
		return addTimeToDate(text, getDateFromInterval(calculateDayInterval('laterNextWeek')), 'later next week')
	}
	if (matchesDateExpr(text, 'next week')) {
		return addTimeToDate(text, getDateFromInterval(calculateDayInterval('nextWeek')), 'next week')
	}
	if (matchesDateExpr(text, 'next month')) {
		const date: Date = new Date()
		date.setDate(1)
		date.setMonth(date.getMonth() + 1)

		return addTimeToDate(text, getDateWithTime(date), 'next month')
	}
	if (matchesDateExpr(text, 'end of month')) {
		const curDate: Date = new Date()
		const date: Date = new Date(curDate.getFullYear(), curDate.getMonth() + 1, 0)

		return addTimeToDate(text, getDateWithTime(date), 'end of month')
	}

	let parsed = getDateFromWeekday(text, now)
	if (parsed.date !== null) {
		return addTimeToDate(text, parsed.date, parsed.foundText)
	}

	parsed = getDayFromText(text, now)
	if (parsed.date !== null) {
		const month = getMonthFromText(text, parsed.date)
		const withTime = addTimeToDate(month.newText, month.date, parsed.foundText)
		return {...withTime, matched: [...(withTime.matched ?? []), ...(month.foundText ? [month.foundText] : [])]}
	}

	parsed = getDateFromTextIn(text, now)
	if (parsed.date !== null) {
		return addTimeToDate(text, parsed.date, parsed.foundText)
	}

	parsed = getDateFromText(text, now)

	if (parsed.date === null) {
		const time = addTimeToDate(text, new Date(now), parsed.foundText)

		if (time.date !== null && +now !== +time.date) {
			return time
		}

		return {
			newText: parsed.foundText ? replaceAll(text, parsed.foundText, '') : text,
			date: parsed.date,
		}
	}

	return addTimeToDate(text, parsed.date, parsed.foundText)
}

const addTimeToDate = (text: string, date: Date, previousMatch: string | null): dateParseResult => {
	previousMatch = previousMatch?.trim() || ''
	const matched = previousMatch !== '' ? [previousMatch] : []
	text = replaceAll(text, previousMatch, '')
	if (previousMatch === null) {
		return {
			newText: text,
			date: null,
		}
	}

	const timeRegex = ' (at|@) ([0-9][0-9]?(:[0-9][0-9])?( ?(a|p)m)?)'
	const matcher = new RegExp(timeRegex, 'ig')
	const results = matcher.exec(text)

	if (results !== null) {
		const time = results[2]
		const parts = time.split(':')
		let hours = parseInt(parts[0])
		let minutes = 0
		if (time.toLowerCase().endsWith('pm')) {
			if (hours !== 12) {
				hours += 12
			}
		} else if (time.toLowerCase().endsWith('am') && hours === 12) {
			hours = 0
		}
		if (parts.length > 1) {
			minutes = parseInt(parts[1])
		}

		date.setHours(hours)
		date.setMinutes(minutes)
		date.setSeconds(0)
		date.setMilliseconds(0)
		matched.push(results[0].trim())
	}

	const replace = results !== null ? results[0] : previousMatch
	return {
		newText: replaceAll(text, replace, '').trim(),
		date,
		matched,
	}
}

export const getDateFromText = (text: string, now: Date = new Date()) => {
	const datePatterns: string[] = [
		'(?<found>(?<month>[0-9][0-9]?)\\/(?<day>[0-9][0-9]?)(\\/(?<year>[0-9][0-9]([0-9][0-9])?))?)',
		'(?<found>(?<year>[0-9][0-9][0-9][0-9]?)\\/(?<month>[0-9][0-9]?)\\/(?<day>[0-9][0-9]))',
		'(?<found>(?<year>[0-9][0-9][0-9][0-9]?)-(?<month>[0-9][0-9]?)-(?<day>[0-9][0-9]))',
		'(?<found>(?<day>[0-9][0-9]?)\\.(?<month>[0-9][0-9]?)(\\.(?<year>[0-9][0-9]([0-9][0-9])?))?)',
	]

	let result: string | null = null
	let results: RegExpExecArray | null
	let foundText: string | null = ''
	let containsYear = true

	// 1. Try parsing the text as a "usual" date, like 2021-06-24 or "06/24/2021" or "27/01" or "01/27"
	for (const datePattern of datePatterns) {
		results = matchDateAtBoundary(text, datePattern)
		if (results !== null) {
			const {day, month, year, found} = {...results.groups}
			let tmp_year = year

			if (tmp_year === undefined) {
				tmp_year = year ?? now.getFullYear()
				containsYear = false
			}

			result = `${month}/${day}/${tmp_year}`
			result = !isNaN(new Date(result).getTime()) ? result : `${day}/${month}/${tmp_year}`
			result = !isNaN(new Date(result).getTime()) ? result : null

			if(result !== null){
				foundText = found
				break
			}
		}
	}

	// 2. Try parsing the date as something like "jan 21" or "21 jan"
	if (result === null) {
		const monthRegex = new RegExp(`(^| )(${monthsRegexGroup} [0-9][0-9]?|[0-9][0-9]? ${monthsRegexGroup})`, 'ig')
		results = monthRegex.exec(text)
		result = results === null ? null : `${results[0]} ${now.getFullYear()}`.trim()
		foundText = results === null ? '' : results[0].trim()
		containsYear = false
	}

	if (result === null) {
		return {
			foundText,
			date: null,
		}
	}

	const date = new Date(result)
	if (isNaN(date.getTime())) {
		return {
			foundText,
			date: null,
		}
	}

	// Compare against the start of today, otherwise a date without a year that is today (parsed as 00:00)
	// would count as "already passed" and be moved to next year.
	const startOfToday = new Date(now)
	startOfToday.setHours(0, 0, 0, 0)
	if (!containsYear && date < startOfToday) {
		date.setFullYear(date.getFullYear() + 1)
	}

	return {
		foundText,
		date,
	}
}

export const getDateFromTextIn = (text: string, now: Date = new Date()) => {
	const regex = /(in [0-9]+ (hours?|days?|weeks?|months?))/ig
	const results = regex.exec(text)
	if (results === null) {
		return {
			foundText: '',
			date: null,
		}
	}

	const foundText: string = results[0]
	const date = new Date(now)
	const parts = foundText.split(' ')
	switch (parts[2]) {
		case 'hours':
		case 'hour':
			date.setHours(date.getHours() + parseInt(parts[1]))
			break
		case 'days':
		case 'day':
			date.setDate(date.getDate() + parseInt(parts[1]))
			break
		case 'weeks':
		case 'week':
			date.setDate(date.getDate() + parseInt(parts[1]) * 7)
			break
		case 'months':
		case 'month':
			date.setMonth(date.getMonth() + parseInt(parts[1]))
			break
	}

	return {
		foundText,
		date,
	}
}

const getDateFromWeekday = (text: string, date: Date = new Date()): dateFoundResult => {
	const matcher = /(^| )(next )?(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)($| )/g
	const results: string[] | null = matcher.exec(text.toLowerCase()) // The i modifier does not seem to work.
	if (results === null) {
		return {
			foundText: null,
			date: null,
		}
	}

	const currentDay: number = date.getDay()
	let day: number

	switch (results[3]) {
		case 'mon':
		case 'monday':
			day = 1
			break
		case 'tue':
		case 'tuesday':
			day = 2
			break
		case 'wed':
		case 'wednesday':
			day = 3
			break
		case 'thu':
		case 'thursday':
			day = 4
			break
		case 'fri':
		case 'friday':
			day = 5
			break
		case 'sat':
		case 'saturday':
			day = 6
			break
		case 'sun':
		case 'sunday':
			day = 0
			break
		default:
			return {
				foundText: null,
				date: null,
			}
	}

	const distance: number = (day + 7 - currentDay) % 7
	date.setDate(date.getDate() + distance)

	// This a space at the end of the found text to not break parsing suffix strings like "at 14:00" in cases where the
	// matched string comes with a space at the end (last part of the regex).
	let foundText = results[0]
	if (foundText.endsWith(' ')) {
		foundText = foundText.slice(0, foundText.length - 1)
	}

	return {
		foundText: foundText,
		date: date,
	}
}

const getDayFromText = (text: string, now: Date = new Date()) => {
	// Only match ordinals when followed by end-of-string, time expressions, or month names
	// This prevents matching "2nd Floor" or "13th floor" as dates
	const matcher = new RegExp('(^| )(([1-2][0-9])|(3[01])|(0?[1-9]))(st|nd|rd|th|\\.)(?=$| at | @ | ' + monthsRegexGroup + ')', 'ig')
	const results = matcher.exec(text)
	if (results === null) {
		return {
			foundText: null,
			date: null,
		}
	}

	const date = new Date(now)
	const day = parseInt(results[0])
	date.setDate(day)

	// If the parsed day is the 31st (or 29+ and the next month is february) but the next month only has 30 days,
	// setting the day to 31 will "overflow" the date to the next month, but the first.
	// This would look like a very weired bug. Now, to prevent that, we check if the day is the same as parsed after
	// setting it for the first time and set it again if it isn't - that would mean the month overflowed.
	while (date < now) {
		date.setMonth(date.getMonth() + 1)
	}

	if (date.getDate() !== day) {
		date.setDate(day)
	}

	return {
		foundText: results[0],
		date: date,
	}
}

const getMonthFromText = (text: string, date: Date) => {
	const matcher = new RegExp('\\b' + monthsRegexGroup + '\\b', 'ig')
	const results = matcher.exec(text)

	if (results === null) {
		return {
			newText: text,
			date,
			foundText: '',
		}
	}

	const fullDate = new Date(`${results[0]} 1 ${(new Date()).getFullYear()}`)
	date.setMonth(fullDate.getMonth())
	return {
		newText: replaceAll(text, results[0], ''),
		date,
		foundText: results[0],
	}
}

const getDateFromInterval = (interval: number): Date => {
	const newDate = new Date()
	newDate.setDate(newDate.getDate() + interval)

	return getDateWithTime(newDate)
}
