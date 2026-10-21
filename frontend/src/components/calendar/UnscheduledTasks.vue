<template>
	<aside
		v-cy="'calendarUnscheduled'"
		class="unscheduled"
	>
		<h4 class="unscheduled-title">
			{{ $t('calendar.unscheduled') }}
		</h4>
		<p class="unscheduled-hint">
			{{ $t('calendar.unscheduledHint') }}
		</p>

		<ul
			v-if="unscheduledTasks.length > 0"
			class="unscheduled-list"
		>
			<li
				v-for="task in unscheduledTasks"
				:key="task.id"
				class="unscheduled-task"
				:data-priority-level="priorityLevel(task)"
				draggable="true"
				@dragstart="onDragStart($event, task)"
			>
				<RouterLink
					:to="{name: 'task.detail', params: {id: task.id}, state: {backdropView: route.fullPath}}"
					draggable="false"
					class="unscheduled-link"
					:title="task.title"
				>
					{{ task.title }}
				</RouterLink>
			</li>
		</ul>
		<p
			v-else-if="!isFetching"
			class="unscheduled-empty"
		>
			{{ $t('calendar.unscheduledEmpty') }}
		</p>
	</aside>
</template>

<script lang="ts">
export const UNSCHEDULED_DRAG_TYPE = 'application/x-vikunja-task-id'
</script>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'

import {allTasksQuery} from '@/client/queries/tasks'
import {useAuthStore} from '@/stores/auth'
import type {Task} from '@/client/generated'
import {PRIORITIES, getPriorityLevel} from '@/constants/priorities'

import {getTaskSpan} from './calendarHelpers'

const props = defineProps<{
	projectId: number,
	viewId: number,
}>()

const route = useRoute()
const authStore = useAuthStore()

const query = useQuery(computed(() => allTasksQuery({
	project: props.projectId,
	view: props.viewId,
	params: {
		sort_by: ['priority', 'id'],
		order_by: ['desc', 'desc'],
		filter: 'done = false',
		filter_timezone: authStore.settings.timezone,
	},
})))

const isFetching = query.isFetching

// The calendar shows every task that has at least one date, so the rest are unscheduled.
const unscheduledTasks = computed(() => (query.data.value ?? []).filter(task => getTaskSpan(task) === null))

function priorityLevel(task: Task) {
	return getPriorityLevel(
		task.priority,
		task.done,
		authStore.settings.frontend_settings.minimum_priority || PRIORITIES.MEDIUM,
	)
}

function onDragStart(event: DragEvent, task: Task) {
	if (!event.dataTransfer) {
		return
	}
	event.dataTransfer.setData(UNSCHEDULED_DRAG_TYPE, String(task.id))
	event.dataTransfer.effectAllowed = 'move'
}
</script>

<style scoped lang="scss">
.unscheduled {
	flex: 0 0 14rem;
	align-self: flex-start;
	padding: .5rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: $radius;
}

.unscheduled-title {
	margin: 0 0 .25rem;
	font-size: .95rem;
}

.unscheduled-hint,
.unscheduled-empty {
	margin: 0 0 .5rem;
	font-size: .75rem;
	color: var(--grey-500);
}

.unscheduled-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
	max-block-size: 32rem;
	overflow-y: auto;
}

.unscheduled-task {
	background: var(--grey-100);
	border-inline-start: 3px solid var(--primary);
	border-radius: 3px;
	cursor: grab;

	&:active {
		cursor: grabbing;
	}

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
}

.unscheduled-link {
	display: block;
	padding: 2px .35rem;
	font-size: .75rem;
	line-height: 1.4;
	color: var(--text);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

@media screen and (max-width: $tablet) {
	.unscheduled {
		flex-basis: auto;
		inline-size: 100%;
	}

	.unscheduled-list {
		max-block-size: 10rem;
	}
}
</style>
