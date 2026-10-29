import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'

import {useUpdateFrontendSettingsMutation} from '@/client/queries/account'
import {useAuthStore} from '@/stores/auth'
import {playFocusAlarm} from '@/helpers/focusAlarm'
import {
	MIN_RECORD_SECONDS,
	buildRecord,
	clampPomoMinutes,
	elapsedSeconds,
	flattenRecords,
	monthKey,
	remainingSeconds,
	type ActiveFocus,
	type FocusEnded,
	type FocusMode,
	type FocusRecords,
} from '@/helpers/focus'
import type {FrontendSettings} from '@/helpers/userSettings'

// One clock shared by everything that shows the timer, running only while something is looking at it.
const nowMs = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
let consumers = 0

function retainTicker() {
	consumers++
	nowMs.value = Date.now()
	ticker ??= setInterval(() => {
		nowMs.value = Date.now()
	}, 1000)
}

function releaseTicker() {
	consumers = Math.max(0, consumers - 1)
	if (consumers === 0 && ticker !== undefined) {
		clearInterval(ticker)
		ticker = undefined
	}
}

// Only one save may touch the account settings at a time, and one session may only be finished once.
let finishing = false

export function useFocusTimer() {
	const authStore = useAuthStore()
	const updateFrontendSettings = useUpdateFrontendSettingsMutation()

	onMounted(retainTicker)
	onBeforeUnmount(releaseTicker)

	const settings = computed(() => authStore.settings.frontend_settings)
	const active = computed<ActiveFocus | null>(() => settings.value.focus_active ?? null)
	const ended = computed<FocusEnded | null>(() => settings.value.focus_ended ?? null)
	const records = computed(() => flattenRecords(settings.value.focus_records))
	const pomoMinutes = computed(() => clampPomoMinutes(settings.value.focus_pomo_minutes))

	const elapsed = computed(() => active.value ? elapsedSeconds(active.value, nowMs.value) : 0)
	const remaining = computed(() => active.value?.mode === 'pomo' ? remainingSeconds(active.value, nowMs.value) : 0)

	async function save(patch: Partial<FrontendSettings>) {
		const session = authStore.session
		if (!session) {
			return
		}
		await updateFrontendSettings.mutateAsync({id: session.id, type: session.type, frontendSettings: patch})
	}

	async function start(input: {
		taskId: number | null,
		taskTitle: string,
		projectId?: number | null,
		mode: FocusMode,
		minutes?: number,
	}) {
		if (active.value) {
			return
		}
		await save({
			// Starting something new answers the question the ended pomodoro was still asking.
			focus_ended: null,
			focus_active: {
				task_id: input.taskId,
				task_title: input.taskTitle,
				project_id: input.projectId ?? null,
				mode: input.mode,
				started_at: new Date().toISOString(),
				...(input.mode === 'pomo' ? {duration_seconds: clampPomoMinutes(input.minutes ?? pomoMinutes.value) * 60} : {}),
			},
		})
	}

	// Ends the running timer and keeps it as a record, in a single save so the two cannot get out of step.
	// A pomodoro that ran out is recorded as ending exactly when it was due.
	async function finish(completed: boolean) {
		const current = active.value
		if (!current || finishing) {
			return
		}
		finishing = true
		try {
			const endedAt = completed && current.duration_seconds !== undefined
				? new Date(new Date(current.started_at).getTime() + current.duration_seconds * 1000)
				: new Date()
			const record = buildRecord(current, endedAt, completed)

			const next: FocusRecords = Object.fromEntries(
				Object.entries(settings.value.focus_records ?? {}).map(([key, month]) => [key, [...month]]),
			)
			if (record.seconds >= MIN_RECORD_SECONDS) {
				const key = monthKey(new Date(current.started_at))
				next[key] = [...(next[key] ?? []).filter(item => item.id !== record.id), record]
			}
			// A pomodoro that ran out stays visible as ended, until the user decides what comes next.
			await save({
				focus_active: null,
				focus_records: next,
				focus_ended: completed && current.duration_seconds !== undefined
					? {
						task_id: current.task_id,
						task_title: current.task_title,
						project_id: current.project_id,
						duration_seconds: current.duration_seconds,
						ended_at: endedAt.toISOString(),
					}
					: null,
			})
		} finally {
			finishing = false
		}
	}

	// Closes the notice of an ended pomodoro.
	function dismissEnded() {
		return save({focus_ended: null})
	}

	// Starts the next pomodoro for the same task and of the same length as the one that just ended.
	async function startAnother() {
		const previous = ended.value
		if (!previous || active.value) {
			return
		}
		await save({
			focus_ended: null,
			focus_active: {
				task_id: previous.task_id,
				task_title: previous.task_title,
				project_id: previous.project_id ?? null,
				mode: 'pomo',
				started_at: new Date().toISOString(),
				duration_seconds: previous.duration_seconds,
			},
		})
	}

	// Drops the running timer without recording it.
	async function abandon() {
		if (!active.value || finishing) {
			return
		}
		await save({focus_active: null})
	}

	async function deleteRecord(id: string) {
		const next: FocusRecords = Object.fromEntries(
			Object.entries(settings.value.focus_records ?? {}).map(([key, month]) => [key, month.filter(item => item.id !== id)]),
		)
		await save({focus_records: next})
	}

	function setPomoMinutes(minutes: number) {
		return save({focus_pomo_minutes: clampPomoMinutes(minutes)})
	}

	return {
		active,
		ended,
		dismissEnded,
		startAnother,
		records,
		pomoMinutes,
		elapsed,
		remaining,
		start,
		finish,
		abandon,
		deleteRecord,
		setPomoMinutes,
	}
}

// Records a pomodoro when its time is up, wherever the user is. Used once, by the always visible badge.
export function useFocusCompletion() {
	const timer = useFocusTimer()

	watch(
		() => timer.active.value?.mode === 'pomo' && timer.remaining.value <= 0,
		async over => {
			if (!over) {
				return
			}
			await timer.finish(true)
			// The floating window now says the time is up; the alarm makes sure it is noticed.
			playFocusAlarm()
		},
		{immediate: true},
	)
}
