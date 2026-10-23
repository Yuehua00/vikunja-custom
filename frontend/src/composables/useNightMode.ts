import {computed, nextTick, ref, watch} from 'vue'
import {createSharedComposable, tryOnMounted, useNow, useStorage} from '@vueuse/core'

import {useColorScheme} from '@/composables/useColorScheme'

export interface NightModeSettings {
	enabled: boolean
	// All times are local, as HH:MM.
	start: string
	end: string
	remind: string
}

export const DEFAULT_NIGHT_MODE_SETTINGS: NightModeSettings = {
	enabled: true,
	start: '22:00',
	end: '06:00',
	remind: '23:30',
}

const SNOOZE_MS = 30 * 60 * 1000

function toMinutes(time: string): number | null {
	const [hours, minutes] = time.split(':').map(Number)
	return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null
}

// The window may wrap around midnight (22:00 to 06:00). An empty window (start == end) never matches.
function inWindow(current: number, start: string, end: string): boolean {
	const from = toMinutes(start)
	const to = toMinutes(end)
	if (from === null || to === null || from === to) {
		return false
	}
	return from < to ? current >= from && current < to : current >= from || current < to
}

// Dims the interface at night and asks to stop for the day. The settings live in this browser only.
export const useNightMode = createSharedComposable(() => {
	const settings = useStorage<NightModeSettings>('nightMode', {...DEFAULT_NIGHT_MODE_SETTINGS}, localStorage, {mergeDefaults: true})
	const dismissedNight = useStorage('nightModeDismissed', '')
	const snoozeUntil = ref(0)

	const now = useNow({interval: 30_000})
	const minutes = computed(() => now.value.getHours() * 60 + now.value.getMinutes())

	const isNight = computed(() => settings.value.enabled && inWindow(minutes.value, settings.value.start, settings.value.end))

	// One id per night, so "done for today" holds until the next evening, also after midnight.
	const nightKey = computed(() => {
		const end = toMinutes(settings.value.end)
		const day = new Date(now.value)
		if (end !== null && minutes.value < end) {
			day.setDate(day.getDate() - 1)
		}
		return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`
	})

	const shouldRemind = computed(() =>
		settings.value.enabled &&
		inWindow(minutes.value, settings.value.remind, settings.value.end) &&
		dismissedNight.value !== nightKey.value &&
		now.value.getTime() >= snoozeUntil.value,
	)

	function dismissTonight() {
		dismissedNight.value = nightKey.value
	}

	function snooze() {
		snoozeUntil.value = Date.now() + SNOOZE_MS
	}

	// At night the page is dark whatever the color scheme setting says. useColorScheme owns the classes on
	// <html> and only rewrites them when its own value changes, so this runs after it and has the last word.
	const {isDark} = useColorScheme()

	function applyClasses() {
		const el = document.documentElement
		const dark = isNight.value || isDark.value
		el.classList.toggle('night-mode', isNight.value)
		el.classList.toggle('dark', dark)
		el.classList.toggle('light', !dark)
	}

	watch([isNight, isDark], () => nextTick(applyClasses), {flush: 'post'})
	tryOnMounted(() => nextTick(applyClasses))

	return {
		settings,
		isNight,
		shouldRemind,
		dismissTonight,
		snooze,
	}
})
