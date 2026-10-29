<template>
	<div
		v-cy="'subtaskList'"
		class="subtask-list"
	>
		<div class="subtask-header">
			<h2 class="task-section-title">
				<span class="icon is-grey">
					<Icon icon="list-check" />
				</span>
				{{ $t('task.subtasks.title') }}
			</h2>
			<span
				v-if="subtasks.length > 0"
				class="subtask-summary"
			>
				{{ $t('task.subtasks.summary', {done: doneCount, total: subtasks.length}) }}
			</span>
		</div>

		<div
			v-if="progress"
			class="subtask-progress"
		>
			<ProgressBar
				:value="Math.round(progress.percent * 100)"
				is-primary
			/>
			<span class="subtask-percent">{{ Math.round(progress.percent * 100) }}%</span>
		</div>

		<ul
			v-if="subtasks.length > 0"
			class="subtask-rows"
		>
			<li
				v-for="subtask in subtasks"
				:key="subtask.id"
				class="subtask-row"
				:class="{'is-done': subtask.done, 'is-progress': isInProgress(subtask), 'is-paused': isPaused(subtask)}"
				:data-priority-level="priorityLevel(subtask)"
			>
				<FancyCheckbox
					:model-value="subtask.done"
					:disabled="!canWrite"
					:aria-label="$t('task.detail.markAsDone', {task: subtask.title})"
					@update:modelValue="done => setDone(subtask, done)"
				/>
				<RouterLink
					:to="{name: 'task.detail', params: {id: subtask.id}, state: {backdropView}}"
					class="subtask-title"
				>
					{{ subtask.title }}
				</RouterLink>
				<input
					type="date"
					class="subtask-date"
					:value="dueDateValue(subtask)"
					:disabled="!canWrite"
					:aria-label="$t('task.attributes.dueDate')"
					@change="event => setDueDate(subtask, (event.target as HTMLInputElement).value)"
				>
				<PercentDoneSelect
					class="subtask-percent-select"
					:model-value="subtask.done ? 1 : subtask.percent_done"
					:disabled="!canWrite"
					@update:modelValue="percent => setPercent(subtask, percent)"
				/>
			</li>
		</ul>
		<p
			v-else
			class="subtask-empty"
		>
			{{ $t('task.subtasks.empty') }}
		</p>

		<!-- Same input as for main tasks, so dates, labels and priority are detected while typing. -->
		<AddTask
			v-if="canWrite"
			:project-id="projectId"
			:parent-task-id="taskId"
			:placeholder="$t('task.subtasks.addPlaceholder')"
			:autofocus="false"
		/>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import dayjs from 'dayjs'

import AddTask from '@/components/tasks/AddTask.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import ProgressBar from '@/components/misc/ProgressBar.vue'
import PercentDoneSelect from '@/components/tasks/partials/PercentDoneSelect.vue'

import {taskQuery, type TaskResponse} from '@/client/queries/tasks'
import {useUpdateTaskMutation} from '@/client/queries/taskMutations'
import {computeParentProgress} from '@/helpers/subtaskProgress'
import {PRIORITIES, getPriorityLevel} from '@/constants/priorities'
import {isInProgress, isPaused} from '@/helpers/taskStatus'
import {useAuthStore} from '@/stores/auth'
import {isSetDate} from '@/components/calendar/calendarHelpers'

const props = defineProps<{
	taskId: number,
	projectId: number,
	canWrite: boolean,
	// Keeps the drawer open over the same page when a subtask is opened.
	backdropView?: string,
}>()

const query = useQuery(computed(() => taskQuery(props.taskId)))

const subtasks = computed<TaskResponse[]>(() => query.data.value?.related_tasks.subtask ?? [])
const doneCount = computed(() => subtasks.value.filter(subtask => subtask.done).length)
const progress = computed(() => computeParentProgress(subtasks.value))

const updateTask = useUpdateTaskMutation(true)
const authStore = useAuthStore()

function priorityLevel(subtask: TaskResponse) {
	return getPriorityLevel(
		subtask.priority,
		subtask.done,
		authStore.settings.frontend_settings.minimum_priority || PRIORITIES.MEDIUM,
	)
}

async function setDone(subtask: TaskResponse, done: boolean) {
	// A finished subtask records full progress. A reopened one must not keep it, or it would still count as
	// finished in the progress of its parent.
	await updateTask.mutateAsync({
		id: subtask.id,
		done,
		...(done ? {percent_done: 1} : subtask.percent_done >= 1 ? {percent_done: 0} : {}),
	})
}

async function setPercent(subtask: TaskResponse, percent: number) {
	await updateTask.mutateAsync({id: subtask.id, percent_done: percent, done: percent >= 1})
}

function dueDateValue(subtask: TaskResponse) {
	return isSetDate(subtask.due_date) ? dayjs(subtask.due_date).format('YYYY-MM-DD') : ''
}

async function setDueDate(subtask: TaskResponse, value: string) {
	// Noon keeps the date stable across timezone offsets, same as dropping a task on the calendar.
	await updateTask.mutateAsync({
		id: subtask.id,
		due_date: value === '' ? '' : dayjs(value).hour(12).toISOString(),
	})
}

</script>

<style scoped lang="scss">
// The task card paints inputs inside .details opaque on hover and focus, which would hide the
// highlights that AddTask draws behind its textarea.
:deep(.add-task-textarea) {
	background: transparent !important;
}

.subtask-header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: .5rem;
	margin-block-end: .5rem;

	.task-section-title {
		margin: 0;
	}
}

.subtask-summary,
.subtask-percent {
	font-size: .8rem;
	color: var(--grey-500);
}

.subtask-progress {
	display: flex;
	align-items: center;
	gap: .75rem;
	margin-block-end: .75rem;

	:deep(.progress-bar) {
		flex: 1 1 auto;

		--progress-height: .5rem;
	}
}

.subtask-rows {
	list-style: none;
	margin: 0 0 .75rem;
	padding: 0;
}

.subtask-row {
	display: flex;
	align-items: center;
	gap: .5rem;
	padding: .35rem .5rem;
	border-radius: 8px;

	& + & {
		margin-block-start: 2px;
	}

	// The priority is shown as a tinted background, same levels as the list and calendar.
	&[data-priority-level] {
		background: color-mix(in srgb, var(--priority-color) var(--priority-tint), transparent);
	}

	&[data-priority-level='low'] {
		--priority-color: var(--info);
		--priority-tint: 15%;
	}

	&[data-priority-level='medium'] {
		--priority-color: var(--warning);
		--priority-tint: 20%;
	}

	&[data-priority-level='high'] {
		--priority-color: var(--danger);
		--priority-tint: 20%;
	}

	&[data-priority-level='urgent'] {
		--priority-color: var(--danger);
		--priority-tint: 42%;
	}

	// A subtask being worked on is yellow; urgent keeps its red.
	&.is-progress:not([data-priority-level='urgent']) {
		background: color-mix(in srgb, var(--status-doing) 24%, transparent);
	}

	// A paused subtask is a calm blue-grey; urgent keeps its red.
	&.is-paused:not([data-priority-level='urgent']) {
		background: color-mix(in srgb, var(--status-paused) 18%, transparent);
	}

	// A finished subtask has a light green background instead of a strike-through.
	&.is-done {
		background: color-mix(in srgb, var(--success) 16%, transparent);
	}
}

.subtask-title {
	flex: 1 1 auto;
	min-inline-size: 0;
	color: var(--text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.subtask-date {
	flex: none;
	border: 1px solid var(--grey-200);
	border-radius: 7px;
	padding: .15rem .35rem;
	background: var(--white);
	color: var(--text);
	font-size: .8rem;
}

.subtask-percent-select {
	flex: none;
	font-size: .8rem;
}

.subtask-empty {
	margin: 0 0 .75rem;
	font-size: .85rem;
	color: var(--grey-500);
}
</style>
