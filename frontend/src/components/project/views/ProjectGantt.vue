<template>
	<ProjectWrapper
		class="project-gantt"
		:is-loading-project="isLoadingProject"
		:project-id
		:view-id
	>
		<template #summary>
			<template v-if="statsQuery.isSuccess.value">
				<span class="project-progress-number">{{ projectStats.percent }}%</span>
				<span class="project-progress-count">{{ projectStats.done }} / {{ projectStats.total }} 完成</span>
			</template>
		</template>
		<template #default>
			<Card
				:has-content="false"
				:padding="false"
				class="print-gantt-sheet"
			>
				<header class="print-bar print-gantt-bar">
					<h2 class="print-bar-title">
						GANTT 甘特圖
					</h2>
					<div class="print-gantt-navigation">
						<button
							type="button"
							aria-label="上一個區間"
							@click="shiftRange(-1)"
						>
							‹
						</button>
						<span>{{ rangeLabel }}</span>
						<button
							type="button"
							aria-label="下一個區間"
							@click="shiftRange(1)"
						>
							›
						</button>
						<button
							type="button"
							@click="showToday"
						>
							跳到今天
						</button>
						<div
							class="print-gantt-scale"
							role="group"
							aria-label="時間軸範圍"
						>
							<button
								type="button"
								:aria-pressed="rangeDays === 14"
								@click="setRange(14)"
							>
								兩週
							</button>
							<button
								type="button"
								:aria-pressed="rangeDays === 28"
								@click="setRange(28)"
							>
								四週
							</button>
						</div>
					</div>
				</header>
				<div class="gantt-options">
					<FormField
						id="range"
						label="日期區間"
					>
						<template #default="{ id }">
							<DateRangeInput
								:id="id"
								v-model="dateRange"
								placeholder="日期區間"
							/>
						</template>
					</FormField>
					<div
						v-if="!hasDefaultFilters"
						class="field"
					>
						<span
							class="label"
							aria-hidden="true"
						>重設區間</span>
						<div class="control">
							<XButton @click="setDefaultFilters">
								重設
							</XButton>
						</div>
					</div>
					<FancyCheckbox
						v-model="filters.showTasksWithoutDates"
						is-block
					>
						{{ $t('task.show.noDates') }}
					</FancyCheckbox>
				</div>
				<div
					class="print-gantt-legend"
					aria-label="任務狀態圖例"
				>
					<span><i class="is-done" />已完成</span>
					<span><i class="is-doing" />處理中・深色表示進度</span>
					<span><i class="is-todo" />未開始</span>
					<span><i class="is-paused" />暫停中</span>
					<span><i class="is-today" />今天</span>
				</div>
				<div class="gantt-chart-container">
					<GanttChart
						:filters="filters"
						:tasks="tasks"
						:is-loading="isLoading"
						:default-task-start-date="defaultTaskStartDate"
						:default-task-end-date="defaultTaskEndDate"
						@update:task="updateTask"
						@shiftRange="extendTimeline"
					/>
					<TaskForm
						v-if="canWrite"
						@createTask="addGanttTask"
					/>
				</div>
			</Card>
		</template>
	</ProjectWrapper>
</template>

<script setup lang="ts">
import {computed, toRefs} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {allTasksQuery} from '@/client/queries/tasks'
import dayjs from 'dayjs'
import type {RouteLocationNormalized} from 'vue-router'

import {useCurrentProject} from '@/composables/useCurrentProject'

import DateRangeInput from '@/components/input/DateRangeInput.vue'
import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import TaskForm from '@/components/tasks/TaskForm.vue'
import FormField from '@/components/input/FormField.vue'

import GanttChart from '@/components/gantt/GanttChart.vue'
import {useGanttFilters} from '../../../views/project/helpers/useGanttFilters'
import {PERMISSIONS} from '@/constants/permissions'

import type {DateISO} from '@/types/DateISO'
import type {Task as ITask} from '@/client/generated'

const props = defineProps<{
	isLoadingProject: boolean,
	projectId: number,
	route: RouteLocationNormalized
	viewId: number
}>()


const {currentProject} = useCurrentProject()
const canWrite = computed(() =>
	typeof currentProject.value?.max_permission === 'number' &&
	currentProject.value.max_permission > PERMISSIONS.READ,
)

const {route, projectId, viewId} = toRefs(props)
const statsQuery = useQuery(computed(() => ({
	...allTasksQuery({project: projectId.value, params: {filter: 'done = true || done = false'}}),
	enabled: projectId.value > 0,
})))
const projectStats = computed(() => {
	const items = statsQuery.data.value ?? []
	const done = items.filter(task => task.done).length
	return {total: items.length, done, percent: items.length ? Math.round(done / items.length * 100) : 0}
})
const {
	filters,
	hasDefaultFilters,
	setDefaultFilters,
	tasks,
	isLoading,
	addTask,
	updateTask,
} = useGanttFilters(route, projectId, viewId)

const DEFAULT_DATE_RANGE_DAYS = 7

const rangeDays = computed(() => dayjs(filters.value.dateTo).startOf('day').diff(dayjs(filters.value.dateFrom).startOf('day'), 'day') + 1)
const rangeLabel = computed(() => `${dayjs(filters.value.dateFrom).format('YYYY/M/D')} – ${dayjs(filters.value.dateTo).format('M/D')}`)
function setRange(days: number, start = dayjs(filters.value.dateFrom)) {
	Object.assign(filters.value, {
		dateFrom: start.startOf('day').toISOString(),
		dateTo: start.add(days - 1, 'day').endOf('day').toISOString(),
	})
}
function shiftRange(direction: number) {
	setRange(rangeDays.value, dayjs(filters.value.dateFrom).add(direction * rangeDays.value, 'day'))
}
function showToday() {
	setRange(rangeDays.value, dayjs().subtract(3, 'day'))
}

// Move a bounded calendar window instead of growing the DOM for every scroll.
function extendTimeline(direction: -1 | 1) {
	const chunk = 28
	const maxDays = 84
	let start = dayjs(filters.value.dateFrom).startOf('day')
	let end = dayjs(filters.value.dateTo).endOf('day')
	if (direction < 0) start = start.subtract(chunk, 'day')
	else end = end.add(chunk, 'day')
	if (end.startOf('day').diff(start, 'day') + 1 > maxDays) {
		if (direction < 0) end = start.add(maxDays - 1, 'day').endOf('day')
		else start = end.startOf('day').subtract(maxDays - 1, 'day')
	}
	Object.assign(filters.value, {dateFrom: start.toISOString(), dateTo: end.toISOString()})
}

const today = new Date()
const defaultTaskStartDate: DateISO = new Date(today.setHours(0, 0, 0, 0)).toISOString()
const defaultTaskEndDate: DateISO = new Date(new Date(
	today.getFullYear(),
	today.getMonth(),
	today.getDate() + DEFAULT_DATE_RANGE_DAYS,
).setHours(23, 59, 0, 0)).toISOString()

async function addGanttTask(title: ITask['title']) {
	return await addTask({
		title,
		project_id: filters.value.projectId,
		start_date: defaultTaskStartDate,
		end_date: defaultTaskEndDate,
	})
}

const dateRange = computed({
	get: () => ({
		start: new Date(filters.value.dateFrom),
		end: new Date(filters.value.dateTo),
	}),
	set({start, end}: {start: Date, end: Date}) {
		Object.assign(filters.value, {dateFrom: start.toISOString(), dateTo: end.toISOString()})
	},
})
</script>

<style lang="scss" scoped>
.gantt-chart-container {
	padding-block-end: 1rem;
	position: relative;
	z-index: 0;
}

.gantt-options {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-block-end: 1rem;

	@media screen and (max-width: $tablet) {
		flex-direction: column;
	}
}

:global(.link-share-view:not(.has-background)) .gantt-options {
	border: none;
	box-shadow: none;

	.card-content {
		padding: .5rem;
	}
}

.field {
	margin-block-end: 0;
	inline-size: 33%;

	&:not(:last-child) {
		padding-inline-end: .5rem;
	}

	@media screen and (max-width: $tablet) {
		inline-size: 100%;
		max-inline-size: 100%;
		margin-block-start: .5rem;
		padding-inline-end: 0 !important;
	}

	&, .input {
		font-size: .8rem;
	}

	.select,
	.select select {
		block-size: auto;
		inline-size: 100%;
		font-size: .8rem;
	}

	.label {
		font-size: .9rem;
	}
}
</style>
