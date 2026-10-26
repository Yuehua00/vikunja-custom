<template>
	<div
		v-cy="'focusView'"
		class="focus-view print-focus-page"
	>
		<header class="focus-page-header">
			<p class="print-page-kicker">
				FOCUS
			</p>
			<h1 class="page-title focus-page-title">
				{{ $t('focus.title') }}
			</h1>
		</header>
		<section class="focus-main print-sheet">
			<header class="print-section-bar">
				<h2>TIMER 計時</h2><span>{{ isRunning ? '專注進行中' : '準備開始' }}</span>
			</header>
			<div class="focus-target">
				<span class="focus-target-label">
					{{ $t('focus.recordTo') }}
				</span>
				<FocusTaskSelect
					v-model="selectedTaskId"
					:tasks="taskOptions"
					:disabled="isRunning"
				/>
				<label class="focus-target-all">
					<input
						v-model="showAllTasks"
						type="checkbox"
						:disabled="isRunning"
					>
					{{ $t('focus.showAllTasks') }}
				</label>
				<p class="focus-target-hint">
					{{ showAllTasks ? $t('focus.allTasksHint') : $t('focus.candidatesHint') }}
				</p>
			</div>

			<div class="focus-modes-row">
				<div
					class="focus-modes"
					role="group"
					:aria-label="$t('focus.chooseMode')"
				>
					<button
						type="button"
						class="focus-mode"
						:class="{'is-selected': mode === 'pomo'}"
						:aria-pressed="mode === 'pomo'"
						:disabled="isRunning"
						@click="selectedMode = 'pomo'"
					>
						{{ $t('focus.pomo') }}
					</button>
					<button
						type="button"
						class="focus-mode"
						:class="{'is-selected': mode === 'stopwatch'}"
						:aria-pressed="mode === 'stopwatch'"
						:disabled="isRunning"
						@click="selectedMode = 'stopwatch'"
					>
						{{ $t('focus.stopwatch') }}
					</button>
				</div>
			</div>

			<div class="focus-dial">
				<svg
					class="focus-ticks"
					viewBox="0 0 300 300"
					aria-hidden="true"
				>
					<circle
						cx="150"
						cy="150"
						r="108"
						class="focus-ring-track"
					/>
					<circle
						cx="150"
						cy="150"
						r="108"
						class="focus-ring-progress"
						:stroke-dasharray="`${litTicks / 60 * 678.584} 678.584`"
						transform="rotate(-90 150 150)"
					/>
					<g
						:transform="`translate(${150 + 108 * Math.sin(litTicks / 60 * Math.PI * 2)} ${150 - 108 * Math.cos(litTicks / 60 * Math.PI * 2)})`"
						aria-hidden="true"
					>
						<ellipse
							rx="11"
							ry="10"
							class="focus-tomato"
						/><path
							d="M0 -5 -5 -10 0 -8 5 -10 3 -5Z"
							class="focus-tomato-leaf"
						/>
					</g>
					<line
						v-for="tick in TICKS"
						:key="tick"
						class="focus-tick"
						:class="{'is-lit': tick < litTicks}"
						x1="150"
						y1="10"
						x2="150"
						y2="24"
						:transform="`rotate(${tick * 6} 150 150)`"
					/>
				</svg>
				<div
					class="focus-time"
					role="timer"
				>
					{{ clock }}
				</div>
			</div>

			<div
				v-if="!isRunning && mode === 'pomo'"
				class="focus-minutes"
			>
				<button
					v-for="minutes in [15, 25, 45, 60]"
					:key="minutes"
					type="button"
					:class="{'is-selected': pomoMinutes === minutes}"
					:aria-pressed="pomoMinutes === minutes"
					@click="setPomoMinutes(minutes)"
				>
					{{ minutes }}
				</button>
				<label>
					<input
						type="number"
						:min="MIN_POMO_MINUTES"
						:max="MAX_POMO_MINUTES"
						:value="pomoMinutes"
						@change="event => setPomoMinutes(Number((event.target as HTMLInputElement).value))"
					>
					{{ $t('focus.minutes') }}
				</label>
			</div>

			<div class="focus-actions">
				<XButton
					v-if="!isRunning"
					variant="primary"
					class="focus-start"
					@click="start"
				>
					{{ $t('focus.start') }}
				</XButton>
				<template v-else>
					<XButton
						v-if="mode === 'stopwatch'"
						variant="primary"
						class="focus-start"
						@click="finish(false)"
					>
						{{ $t('focus.stopAndRecord') }}
					</XButton>
					<XButton
						v-else
						variant="secondary"
						class="focus-start"
						@click="abandon"
					>
						{{ $t('focus.abandon') }}
					</XButton>
				</template>
			</div>
		</section>

		<aside class="focus-side">
			<section class="focus-overview print-sheet">
				<h2 class="focus-side-title">
					OVERVIEW {{ $t('focus.overview') }}
				</h2>
				<div class="focus-stats">
					<div class="focus-stat">
						<div class="focus-stat-label">
							{{ $t('focus.todayPomos') }}
						</div>
						<div class="focus-stat-value">
							{{ stats.todayPomos }}
						</div>
					</div>
					<div class="focus-stat">
						<div class="focus-stat-label">
							{{ $t('focus.todayDuration') }}
						</div>
						<div class="focus-stat-value">
							{{ formatDuration(stats.todaySeconds) }}
						</div>
					</div>
					<div class="focus-stat">
						<div class="focus-stat-label">
							{{ $t('focus.totalPomos') }}
						</div>
						<div class="focus-stat-value">
							{{ stats.totalPomos }}
						</div>
					</div>
					<div class="focus-stat">
						<div class="focus-stat-label">
							{{ $t('focus.totalDuration') }}
						</div>
						<div class="focus-stat-value">
							{{ formatDuration(stats.totalSeconds) }}
						</div>
					</div>
				</div>
			</section>
			<section class="focus-log print-sheet">
				<h2 class="focus-side-title">
					LOG {{ $t('focus.records') }}<small class="focus-log-range">近 7 天</small>
				</h2>
				<p
					v-if="days.length === 0"
					class="focus-empty"
				>
					{{ $t('focus.noRecords') }}
				</p>
				<div
					v-for="day in days"
					:key="day.day"
					class="focus-day"
				>
					<div class="focus-day-title">
						{{ formatDay(day.day) }}
					</div>
					<ul class="focus-records">
						<li
							v-for="record in day.records"
							:key="record.id"
							class="focus-record"
						>
							<div class="focus-record-main">
								<div class="focus-record-time">
									{{ formatTime(record.started_at) }} - {{ formatTime(record.ended_at) }}
								</div>
								<div class="focus-record-task">
									<ColorBubble
										v-if="recordColor(record.project_id)"
										:color="recordColor(record.project_id)"
										class="focus-record-bubble"
									/>
									{{ record.task_title || $t('focus.noTask') }}
								</div>
							</div>
							<span class="focus-record-duration">{{ formatDuration(record.seconds) }}</span>
							<BaseButton
								v-if="pendingDelete !== record.id"
								class="focus-record-delete"
								:aria-label="$t('focus.deleteRecord')"
								@click="pendingDelete = record.id"
							>
								<Icon icon="trash-alt" />
							</BaseButton>
							<BaseButton
								v-else
								class="focus-record-confirm"
								@click="confirmDelete(record.id)"
							>
								{{ $t('focus.confirmDelete') }}
							</BaseButton>
						</li>
					</ul>
				</div>
			</section>
		</aside>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useQuery} from '@tanstack/vue-query'

import BaseButton from '@/components/base/BaseButton.vue'
import ColorBubble from '@/components/misc/ColorBubble.vue'
import FocusTaskSelect from '@/components/focus/FocusTaskSelect.vue'
import {allTasksQuery} from '@/client/queries/tasks'
import {useFocusTimer} from '@/composables/useFocusTimer'
import {useGlobalNow} from '@/composables/useGlobalNow'
import {useProjects} from '@/composables/useProjects'
import {useAuthStore} from '@/stores/auth'
import {
	MAX_POMO_MINUTES,
	MIN_POMO_MINUTES,
	computeStats,
	formatClock,
	formatDuration,
	groupByDay,
	dayKey,
	isFocusCandidate,
	projectColorOf,
	type FocusMode,
} from '@/helpers/focus'

const TICKS = Array.from({length: 60}, (_, index) => index)

const {locale} = useI18n({useScope: 'global'})
const authStore = useAuthStore()
const projectList = useProjects()
const {active, records, pomoMinutes, elapsed, remaining, start: startTimer, finish, abandon, deleteRecord, setPomoMinutes} = useFocusTimer()

const isRunning = computed(() => active.value !== null)

const selectedMode = ref<FocusMode>('pomo')
const mode = computed<FocusMode>(() => active.value?.mode ?? selectedMode.value)

// Open tasks of every project. The default list is the ones due soon or overdue; every open task can be shown.
const showAllTasks = ref(false)
const tasksQuery = useQuery(computed(() => allTasksQuery({
	project: null,
	params: {
		filter: 'done = false',
		sort_by: ['due_date', 'id'],
		order_by: ['asc', 'asc'],
		filter_timezone: authStore.settings.timezone,
	},
})))
const openTasks = computed(() => tasksQuery.data.value ?? [])
const taskOptions = computed(() => showAllTasks.value
	? openTasks.value
	: openTasks.value.filter(task => isFocusCandidate(task, new Date())))

const selectedTaskId = ref(0)
// A timer that is already running keeps the task it was started for.
watch(() => active.value?.task_id, taskId => {
	if (taskId) {
		selectedTaskId.value = taskId
	}
}, {immediate: true})

const selectedTask = computed(() => openTasks.value.find(task => task.id === selectedTaskId.value))

const clock = computed(() => {
	if (active.value) {
		return formatClock(mode.value === 'pomo' ? remaining.value : elapsed.value)
	}
	return formatClock(mode.value === 'pomo' ? pomoMinutes.value * 60 : 0)
})

// Pomodoro: the ticks fill up as time passes. Stopwatch: one sweep per minute.
const litTicks = computed(() => {
	if (!active.value) {
		return 0
	}
	if (mode.value === 'stopwatch') {
		return elapsed.value % 60
	}
	const total = active.value.duration_seconds ?? 0
	return total > 0 ? Math.min(60, Math.floor(elapsed.value / total * 60)) : 0
})

function start() {
	return startTimer({
		taskId: selectedTaskId.value || null,
		taskTitle: selectedTask.value?.title ?? '',
		projectId: selectedTask.value?.project_id ?? null,
		mode: mode.value,
	})
}

const stats = computed(() => computeStats(records.value, new Date()))
const {now} = useGlobalNow()
const days = computed(() => {
	const start = new Date(now.value)
	start.setDate(start.getDate() - 6)
	const firstDay = dayKey(start)
	const lastDay = dayKey(now.value)
	return groupByDay(records.value).filter(day => day.day >= firstDay && day.day <= lastDay)
})

const pendingDelete = ref<string | null>(null)
async function confirmDelete(id: string) {
	pendingDelete.value = null
	await deleteRecord(id)
}

function recordColor(projectId: number | null | undefined) {
	return projectId ? projectColorOf(projectList.projects[projectId]?.hex_color) : undefined
}

function formatDay(day: string) {
	const [year, month, date] = day.split('-').map(Number)
	return new Intl.DateTimeFormat(locale.value, {month: 'short', day: 'numeric'}).format(new Date(year, month - 1, date))
}

function formatTime(iso: string) {
	return new Intl.DateTimeFormat(locale.value, {hour: 'numeric', minute: '2-digit'}).format(new Date(iso))
}
</script>

<style lang="scss" scoped>
.focus-view {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 24rem);
	gap: 1.5rem;
	align-items: start;

	@media screen and (max-width: $desktop) {
		grid-template-columns: minmax(0, 1fr);
	}
}

.focus-main,
.focus-side {
	padding: 1.5rem 1.75rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: 20px;
}

.focus-page-title {
	grid-column: 1 / -1;
	margin-block-end: 0;
}

// The mode switch sits centered right above the dial.
.focus-modes-row {
	display: flex;
	justify-content: center;
	margin-block-start: 2rem;
}

.focus-modes {
	display: inline-flex;
	padding: .25rem;
	background: var(--grey-100);
	border-radius: 999px;
}

.focus-mode {
	padding: .4rem 1.1rem;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--grey-500);
	font-size: .95rem;
	cursor: pointer;

	&.is-selected {
		background: var(--white);
		color: var(--text);
		box-shadow: var(--shadow-xs);
	}

	&:disabled {
		cursor: default;
	}
}

.focus-target {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .5rem .75rem;
	margin-block-start: 1.5rem;
}

.focus-target-label {
	font-size: .85rem;
	color: var(--grey-500);
}

.focus-target-all {
	display: inline-flex;
	align-items: center;
	gap: .4rem;
	font-size: .85rem;
}

.focus-target-hint {
	flex-basis: 100%;
	margin: 0;
	font-size: .8rem;
	color: var(--grey-500);
}

.focus-dial {
	position: relative;
	inline-size: min(100%, 20rem);
	aspect-ratio: 1;
	margin: 1.25rem auto 1rem;
}

.focus-ticks {
	inline-size: 100%;
	block-size: 100%;
}

.focus-tick {
	stroke: var(--grey-200);
	stroke-width: 2;
	stroke-linecap: round;
	transition: stroke .3s ease;

	&.is-lit {
		stroke: var(--primary);
	}
}

.focus-time {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 3.5rem;
	font-weight: 500;
	font-variant-numeric: tabular-nums;
}

.focus-minutes {
	display: flex;
	justify-content: center;
	margin-block-end: 1rem;
	font-size: .9rem;

	input {
		inline-size: 4.5rem;
		margin-inline-end: .35rem;
		padding: .3rem .5rem;
		border: 1px solid var(--grey-300);
		border-radius: 8px;
		background: var(--white);
		color: var(--text);
		text-align: center;
	}
}

.focus-actions {
	display: flex;
	justify-content: center;
	margin-block-start: .5rem;
}

.focus-start {
	min-inline-size: 12rem;
	border-radius: 999px;
}

.focus-side-title {
	margin: 0 0 .75rem;
	font-size: 1.15rem;
	font-weight: 600;

	& ~ & {
		margin-block-start: 1.75rem;
	}
}

.focus-stats {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: .6rem;
}

.focus-stat {
	padding: .8rem 1rem;
	background: var(--grey-100);
	border-radius: 12px;
}

.focus-stat-label {
	font-size: .8rem;
	color: var(--grey-500);
}

.focus-stat-value {
	margin-block-start: .25rem;
	font-size: 1.6rem;
	font-weight: 500;
}

.focus-empty {
	margin: 0;
	font-size: .9rem;
	color: var(--grey-500);
}

.focus-day {
	margin-block-start: 1rem;
}

.focus-day-title {
	margin-block-end: .4rem;
	font-size: .9rem;
	font-weight: 700;
	color: var(--grey-500);
}

.focus-records {
	list-style: none;
	margin: 0;
	padding: 0;
}

.focus-record {
	display: flex;
	align-items: center;
	gap: .75rem;
	padding: .5rem 0;
	border-block-end: 1px solid var(--grey-100);
}

.focus-record-main {
	flex: 1 1 auto;
	min-inline-size: 0;
}

.focus-record-time {
	font-size: .8rem;
	color: var(--grey-500);
}

.focus-record-task {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.focus-record-bubble {
	margin-inline-end: .5rem;
}

.focus-record-duration {
	flex: none;
	font-size: .85rem;
	color: var(--grey-500);
}

.focus-record-delete,
.focus-record-confirm {
	flex: none;
	color: var(--grey-400);

	&:hover {
		color: var(--danger);
	}
}

.focus-record-confirm {
	font-size: .8rem;
	color: var(--danger);
}
</style>
