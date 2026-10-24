<template>
	<div
		v-cy="'calendarView'"
		class="calendar-view"
	>
		<div class="calendar-toolbar">
			<div class="calendar-nav">
				<XButton
					variant="secondary"
					:shadow="false"
					:aria-label="$t('calendar.previous')"
					@click="shift(-1)"
				>
					&lsaquo;
				</XButton>
				<XButton
					variant="secondary"
					:shadow="false"
					@click="goToToday"
				>
					{{ $t('calendar.today') }}
				</XButton>
				<XButton
					variant="secondary"
					:shadow="false"
					:aria-label="$t('calendar.next')"
					@click="shift(1)"
				>
					&rsaquo;
				</XButton>
			</div>

			<h3 class="calendar-title">
				{{ title }}
			</h3>

			<div class="calendar-modes">
				<XButton
					:variant="mode === 'month' ? 'primary' : 'secondary'"
					:shadow="false"
					@click="mode = 'month'"
				>
					{{ $t('calendar.month') }}
				</XButton>
				<XButton
					:variant="mode === 'week' ? 'primary' : 'secondary'"
					:shadow="false"
					@click="mode = 'week'"
				>
					{{ $t('calendar.week') }}
				</XButton>
			</div>
		</div>

		<div class="calendar-layout">
		<div
			class="calendar-grid"
			:class="{'is-loading': isFetching}"
		>
			<div
				v-for="(name, index) in weekdayNames"
				:key="'weekday-' + index"
				class="calendar-weekday"
			>
				{{ name }}
			</div>

			<div
				v-for="day in days"
				:key="day.getTime()"
				class="calendar-day"
				:class="{
					'is-today': isToday(day),
					'is-outside': mode === 'month' && !isSameMonth(day),
					'is-week': mode === 'week',
					'is-drop-target': dropTarget === day.getTime(),
					'has-mood': moodOfDay(day) !== undefined,
				}"
				:style="moodStyle(day)"
				@dragover="onDragOver($event, day)"
				@dragleave="onDragLeave(day)"
				@drop="onDrop($event, day)"
			>
				<div class="calendar-day-number">
					{{ day.getDate() }}
				</div>
				<RouterLink
					v-if="moodOfDay(day)"
					class="calendar-mood-dot"
					:to="{name: 'diary', query: {date: diaryDateKey(day)}}"
					:title="$t('diary.openDay', {date: diaryDateKey(day)})"
				/>

				<ul class="calendar-tasks">
					<li
						v-for="entry in visibleTasks(day)"
						:key="entry.task.id"
					>
						<RouterLink
							:to="{name: 'task.detail', params: {id: entry.task.id}, state: {backdropView: route.fullPath}}"
							class="calendar-task"
							:class="{
								'is-done': entry.task.done,
								'is-progress': isInProgress(entry.task),
								'is-paused': isPaused(entry.task),
								'is-continued': !isSpanStart(entry, day),
							}"
							:style="taskStyle(entry.task)"
							:data-priority-level="priorityLevel(entry.task)"
							:title="entry.task.title"
						>
							{{ entry.task.title }}
						</RouterLink>
					</li>
				</ul>

				<BaseButton
					v-if="hiddenCount(day) > 0"
					class="calendar-more"
					@click="openWeekOf(day)"
				>
					{{ $t('calendar.more', {count: hiddenCount(day)}) }}
				</BaseButton>
			</div>
		</div>

		<UnscheduledTasks
			v-if="showUnscheduled && projectId !== null"
			:project-id="projectId"
			:view-id="viewId"
		/>
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {useQuery, useQueryClient} from '@tanstack/vue-query'
import dayjs from 'dayjs'

import BaseButton from '@/components/base/BaseButton.vue'
import UnscheduledTasks, {UNSCHEDULED_DRAG_TYPE} from './UnscheduledTasks.vue'

import {allTasksQuery, taskKeys} from '@/client/queries/tasks'
import {useUpdateTaskMutation} from '@/client/queries/taskMutations'
import {isoToKebabDate} from '@/helpers/time/isoToKebabDate'
import {useAuthStore} from '@/stores/auth'
import type {Task} from '@/client/generated'
import {PRIORITIES, getPriorityLevel} from '@/constants/priorities'
import {isInProgress, isPaused} from '@/helpers/taskStatus'
import {useDiary} from '@/client/queries/diary'
import {MOOD_COLORS, diaryDateKey} from '@/helpers/diary'

import {
	getCalendarRange,
	getDaysInRange,
	groupTasksByDay,
	shiftAnchor,
	startOfDay,
	startOfWeek,
	type CalendarDayTask,
	type CalendarMode,
} from './calendarHelpers'

const props = withDefaults(defineProps<{
	// null loads the tasks of all projects (used on the home page).
	projectId?: number | null,
	viewId?: number,
	// Shows the tasks without a date next to the grid; dropping one on a day sets its due date.
	showUnscheduled?: boolean,
}>(), {
	projectId: null,
	viewId: 0,
	showUnscheduled: false,
})

const MAX_TASKS_PER_DAY_IN_MONTH = 3

const {locale} = useI18n()
const route = useRoute()
const authStore = useAuthStore()

// The mood of a day's diary entry tints its cell.
const {moodByDate} = useDiary()

function moodOfDay(day: Date) {
	return moodByDate.value.get(diaryDateKey(day))
}

function moodStyle(day: Date) {
	const mood = moodOfDay(day)
	return mood ? {'--mood-color': MOOD_COLORS[mood]} : undefined
}

const mode = ref<CalendarMode>('month')
const anchor = ref(startOfDay(new Date()))

const weekStart = computed(() => authStore.settings.week_start ?? 0)
const range = computed(() => getCalendarRange(anchor.value, mode.value, weekStart.value))
const days = computed(() => getDaysInRange(range.value))

const query = useQuery(computed(() => {
	const dateFrom = isoToKebabDate(range.value.start.toISOString())
	// The filter compares against midnight, so include the whole last day.
	const dateTo = isoToKebabDate(dayjs(range.value.end).add(1, 'day').toDate().toISOString())

	return allTasksQuery({
		project: props.projectId,
		view: props.viewId,
		params: {
			sort_by: ['start_date', 'done', 'id'],
			order_by: ['asc', 'asc', 'desc'],
			filter: '(' +
				'(start_date >= "' + dateFrom + '" && start_date <= "' + dateTo + '") || ' +
				'(end_date >= "' + dateFrom + '" && end_date <= "' + dateTo + '") || ' +
				'(due_date >= "' + dateFrom + '" && due_date <= "' + dateTo + '") || ' +
				'(start_date <= "' + dateFrom + '" && end_date >= "' + dateTo + '")' +
				')',
			filter_include_nulls: false,
			filter_timezone: authStore.settings.timezone,
		},
	})
}))

const isFetching = query.isFetching

const tasksByDay = computed(() => groupTasksByDay(query.data.value ?? [], days.value))

const title = computed(() => {
	if (mode.value === 'month') {
		return new Intl.DateTimeFormat(locale.value, {year: 'numeric', month: 'long'}).format(anchor.value)
	}
	const format = new Intl.DateTimeFormat(locale.value, {year: 'numeric', month: 'short', day: 'numeric'})
	return format.format(range.value.start) + ' – ' + format.format(range.value.end)
})

const weekdayNames = computed(() => {
	const format = new Intl.DateTimeFormat(locale.value, {weekday: 'short'})
	const first = startOfWeek(new Date(), weekStart.value)
	return Array.from({length: 7}, (_, i) => format.format(dayjs(first).add(i, 'day').toDate()))
})

function shift(direction: -1 | 1) {
	anchor.value = shiftAnchor(anchor.value, mode.value, direction)
}

function goToToday() {
	anchor.value = startOfDay(new Date())
}

function isToday(day: Date) {
	return dayjs(day).isSame(new Date(), 'day')
}

function isSameMonth(day: Date) {
	return dayjs(day).isSame(anchor.value, 'month')
}

function dayTasks(day: Date): CalendarDayTask[] {
	return tasksByDay.value.get(day.getTime()) ?? []
}

function visibleTasks(day: Date): CalendarDayTask[] {
	const all = dayTasks(day)
	return mode.value === 'month' ? all.slice(0, MAX_TASKS_PER_DAY_IN_MONTH) : all
}

function hiddenCount(day: Date) {
	return mode.value === 'month' ? Math.max(0, dayTasks(day).length - MAX_TASKS_PER_DAY_IN_MONTH) : 0
}

function openWeekOf(day: Date) {
	anchor.value = startOfDay(day)
	mode.value = 'week'
}

// Multi-day tasks repeat on every day; later days are drawn lighter, and the first visible
// day of each week row is treated as a start so the title stays readable.
function isSpanStart(entry: CalendarDayTask, day: Date) {
	return entry.span.start.getTime() === day.getTime() || day.getDay() === weekStart.value
}

function priorityLevel(task: Task) {
	return getPriorityLevel(
		task.priority,
		task.done,
		authStore.settings.frontend_settings.minimum_priority || PRIORITIES.MEDIUM,
	)
}

const queryClient = useQueryClient()
const updateTask = useUpdateTaskMutation()
const dropTarget = ref<number | null>(null)

function isUnscheduledDrag(event: DragEvent) {
	return props.showUnscheduled && Boolean(event.dataTransfer?.types.includes(UNSCHEDULED_DRAG_TYPE))
}

function onDragOver(event: DragEvent, day: Date) {
	if (!isUnscheduledDrag(event)) {
		return
	}
	event.preventDefault()
	dropTarget.value = day.getTime()
}

function onDragLeave(day: Date) {
	if (dropTarget.value === day.getTime()) {
		dropTarget.value = null
	}
}

async function onDrop(event: DragEvent, day: Date) {
	dropTarget.value = null
	if (!isUnscheduledDrag(event)) {
		return
	}
	event.preventDefault()

	const id = Number(event.dataTransfer?.getData(UNSCHEDULED_DRAG_TYPE))
	if (!id) {
		return
	}

	// Noon keeps the date stable across timezone offsets.
	await updateTask.mutateAsync({id, due_date: dayjs(day).hour(12).toISOString()})
	// The task was not part of the date-filtered lists, so they have to be refetched to show it.
	await queryClient.invalidateQueries({queryKey: taskKeys.allLists})
}

function taskStyle(task: Task) {
	return task.hex_color ? {borderInlineStartColor: '#' + task.hex_color.replace('#', '')} : undefined
}
</script>

<style scoped lang="scss">
.calendar-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: .75rem 1rem;
	flex-wrap: wrap;
	margin-block-end: 1rem;
}

.calendar-nav,
.calendar-modes {
	display: flex;
	align-items: center;
	gap: .5rem;

	:deep(.button) {
		min-inline-size: 2.75rem;
		block-size: 2.5rem;
		padding-inline: 1rem;
		font-size: .95rem;
	}
}

// Month and week as one segmented switch.
.calendar-modes {
	padding: .25rem;
	gap: .25rem;
	background: var(--grey-100);
	border-radius: 2px;

	:deep(.button) {
		block-size: 2.25rem;
		border-radius: 2px;
	}
}

.calendar-title {
	margin: 0;
	font-family: $display-font;
	font-size: 1.15rem;
	font-weight: 800;
	letter-spacing: .06em;
	text-align: center;
	flex: 1 1 auto;
}

.calendar-layout {
	display: flex;
	align-items: flex-start;
	gap: .75rem;
}

.calendar-grid {
	flex: 1 1 auto;
	min-inline-size: 0;
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
	border-block-start: 1px solid var(--grey-200);
	border-inline-start: 1px solid var(--grey-200);
	background: var(--white);
	transition: opacity $transition;

	&.is-loading {
		opacity: .6;
	}
}

.calendar-weekday {
	padding: .4rem .5rem;
	font-family: $display-font;
	font-size: .8rem;
	font-weight: 700;
	letter-spacing: .12em;
	text-align: start;
	color: var(--grey-600);
	background: transparent;
	border-inline-end: 1px solid var(--grey-200);
	border-block-end: 1px solid var(--grey-200);
}

.calendar-day {
	min-block-size: 6.5rem;
	padding: .25rem;
	text-align: start;
	border-inline-end: 1px solid var(--grey-200);
	border-block-end: 1px solid var(--grey-200);
	overflow: hidden;

	&.is-week {
		min-block-size: 16rem;
	}

	&.is-outside {
		.calendar-day-number {
			color: var(--grey-400);
		}
	}

	&.has-mood {
		background: color-mix(in srgb, var(--mood-color) 18%, var(--white));
	}

	&.is-drop-target {
		background: color-mix(in srgb, var(--primary) 12%, var(--white));
		outline: 2px dashed var(--primary);
		outline-offset: -2px;
	}

	&.is-today .calendar-day-number {
		background: var(--primary);
		color: var(--white);
	}
}

.calendar-day-number {
	display: inline-block;
	min-inline-size: 1.5rem;
	margin-block-end: .25rem;
	padding-inline: .25rem;
	font-family: $display-font;
	font-size: 1rem;
	font-weight: 700;
	line-height: 1.5rem;
	text-align: center;
	border-radius: 0;
}

.calendar-mood-dot {
	display: inline-block;
	inline-size: .6rem;
	block-size: .6rem;
	margin-inline-start: .3rem;
	background: var(--mood-color);
	border-radius: 50%;
}

.calendar-tasks {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.calendar-task {
	display: block;
	padding: 1px .35rem;
	font-size: .75rem;
	line-height: 1.4;
	color: var(--text);
	background: var(--grey-100);
	border-inline-start: 3px solid var(--primary);
	border-radius: 1px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;

	&:hover {
		background: var(--grey-200);
	}

	&[data-priority-level] {
		background: color-mix(in srgb, var(--priority-color) var(--priority-tint), transparent);

		&:hover {
			background: color-mix(in srgb, var(--priority-color) calc(var(--priority-tint) + 10%), transparent);
		}
	}

	&[data-priority-level='low'] {
		--priority-color: var(--info);
		--priority-tint: 20%;
	}

	&[data-priority-level='medium'] {
		--priority-color: var(--warning);
		--priority-tint: 25%;
	}

	&[data-priority-level='high'] {
		--priority-color: var(--danger);
		--priority-tint: 25%;
	}

	&[data-priority-level='urgent'] {
		--priority-color: var(--danger);
		--priority-tint: 50%;
	}

	// A task being worked on is yellow; urgent keeps its red.
	&.is-progress:not([data-priority-level='urgent']) {
		background: color-mix(in srgb, var(--status-doing) 28%, transparent);

		&:hover {
			background: color-mix(in srgb, var(--status-doing) 36%, transparent);
		}
	}

	// A paused task is a calm blue-grey; urgent keeps its red.
	&.is-paused:not([data-priority-level='urgent']) {
		background: color-mix(in srgb, var(--status-paused) 22%, transparent);

		&:hover {
			background: color-mix(in srgb, var(--status-paused) 30%, transparent);
		}
	}

	// A finished task has a light green background instead of a strike-through.
	&.is-done {
		background: color-mix(in srgb, var(--success) 18%, transparent);

		&:hover {
			background: color-mix(in srgb, var(--success) 26%, transparent);
		}
	}

	&.is-continued {
		opacity: .7;
	}
}

.calendar-more {
	margin-block-start: 2px;
	font-size: .7rem;
	color: var(--grey-500);

	&:hover {
		color: var(--primary);
	}
}

@media screen and (max-width: $tablet) {
	.calendar-layout {
		flex-direction: column-reverse;
		align-items: stretch;
	}

	.calendar-day {
		min-block-size: 4.5rem;

		&.is-week {
			min-block-size: 10rem;
		}
	}
}
</style>
