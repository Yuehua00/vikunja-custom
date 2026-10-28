<template>
	<div
		:data-task-id="task.id"
		:data-project-id="task.project_id"
	>
		<div
			ref="taskRoot"
			:class="{'is-loading': isLoading, 'print-task-row': printRow, 'project-print-row': projectRow, 'project-row-important': projectRow && (task.importance ?? 0) >= 4}"
			class="task loader-container single-task"
			tabindex="-1"
			:data-is-overdue="isOverdue || undefined"
			:data-priority-level="priorityLevel"
			:data-done="task.done || undefined"
			:data-progress="inProgress || undefined"
			:data-paused="paused || undefined"
			@click="openTaskDetail"
			@keyup.enter="openTaskDetail"
		>
			<template v-if="printRow">
				<div class="print-row-time">
					<span
						v-if="!hidePrintTime"
						:class="{'is-overdue': printOverdueDays > 0}"
					>{{ task.done ? '完成' : printTimeLabel }}</span>
					<button
						class="print-row-check"
						type="button"
						:disabled="isArchived || disabled || !canMarkAsDone"
						:aria-label="$t('task.detail.markAsDone', {task: task.title})"
						:aria-pressed="task.done ?? false"
						@click.stop="markAsDone(!task.done)"
					>
						<Icon
							v-if="task.done"
							icon="check"
						/><span
							v-else
							class="print-row-checkbox-outline"
						/>
					</button>
				</div>
				<div class="print-row-main">
					<RouterLink
						:to="taskDetailRoute"
						class="print-row-title"
					>
						{{ task.title }}
					</RouterLink>
					<div class="print-row-meta">
						<RouterLink
							v-if="project"
							:to="{name: 'project.index', params: {projectId: task.project_id}}"
							@click.stop
						>
							{{ project.title }}
						</RouterLink>
						<span
							v-if="task.done"
							class="print-row-meta-state"
						>・已完成</span><span
							v-else-if="inProgress"
							class="print-row-meta-state"
						>・處理中</span><span
							v-else-if="paused"
							class="print-row-meta-state"
						>・暫停中</span>
					</div>
				</div>
				<div class="print-row-end">
					<div class="print-row-markers">
						<progress
							v-if="!task.done && (task.percent_done ?? 0) > 0"
							class="print-row-progress"
							:value="(task.percent_done ?? 0) * 100"
							max="100"
							:aria-label="`${Math.round((task.percent_done ?? 0) * 100)}%`"
						/>
						<Labels
							v-if="(task.labels?.length ?? 0) > 0"
							class="print-row-labels"
							:labels="task.labels ?? []"
						/>
					</div>
					<span
						v-if="!task.done && priorityLevel === 'urgent'"
						class="print-row-urgent"
					><Icon icon="exclamation-circle" /> 緊急</span>
					<span
						v-if="!task.done && printOverdueDays > 0"
						class="print-row-late"
					>逾期 {{ printOverdueDays }} 天</span>
					<span
						v-else-if="!task.done && !(task.percent_done ?? 0)"
						class="print-row-status"
					>尚未開始</span>
					<div class="print-row-actions">
						<BaseButton
							:aria-label="task.is_favorite ? $t('task.detail.actions.unfavorite') : $t('task.detail.actions.favorite')"
							@click.stop="toggleFavorite"
						>
							<Icon icon="star" />
						</BaseButton>
						<BaseButton
							v-if="!task.done && !disabled && !authStore.isLinkShareAuth"
							:aria-label="$t('focus.startFocus')"
							@click.stop="showFocusCard = true"
						>
							<Icon icon="stopwatch" />
						</BaseButton>
						<BaseButton
							v-if="canDelete && !disabled"
							:aria-label="$t('task.detail.actions.delete')"
							@click.stop="showDeleteModal = true"
						>
							<Icon icon="trash-alt" />
						</BaseButton>
					</div>
				</div>
			</template>
			<template v-else-if="projectRow">
				<div
					class="project-row-check"
					@click.stop
				>
					<FancyCheckbox
						:key="checkboxKey"
						:model-value="task.done ?? false"
						:disabled="isArchived || disabled || !canMarkAsDone"
						:aria-label="$t('task.detail.markAsDone', {task: task.title})"
						@update:modelValue="markAsDone"
					/>
				</div>
				<div class="project-row-main">
					<TaskGlanceTooltip :task="task">
						<RouterLink
							:to="taskDetailRoute"
							class="project-row-title"
						>
							{{ task.title }}
						</RouterLink>
					</TaskGlanceTooltip>
					<div class="project-row-meta">
						<span>{{ task.identifier || `#${task.index || task.id}` }}</span>
						<span v-if="(task.related_tasks?.subtask?.length ?? 0) > 0">・{{ task.related_tasks?.subtask?.length }} 個子任務</span>
						<span v-if="(task.comment_count ?? 0) > 0">・{{ task.comment_count }} 則評論</span>
						<Icon
							v-if="!isEditorContentEmpty(task.description ?? '')"
							icon="align-left"
							:title="$t('task.attributes.description')"
						/>
					</div>
				</div>
				<div class="project-row-state">
					<span
						v-if="task.done"
						class="project-state-chip is-done"
					>已完成</span>
					<span
						v-else-if="paused"
						class="project-state-chip is-paused"
					>暫停中</span>
					<span
						v-else-if="inProgress"
						class="project-state-chip is-doing"
					>處理中</span>
					<span
						v-else
						class="project-state-chip is-todo"
					>未開始</span>
					<span
						v-if="(task.importance ?? 0) >= 4"
						class="project-state-chip is-important"
						:title="`重要度 ${task.importance} / 5`"
					>重要</span>
					<Labels
						v-if="(task.labels?.length ?? 0) > 0"
						:labels="task.labels ?? []"
					/>
					<progress
						v-if="!task.done && (task.percent_done ?? 0) > 0"
						class="project-row-progress"
						:value="(task.percent_done ?? 0) * 100"
						max="100"
						:aria-label="`${Math.round((task.percent_done ?? 0) * 100)}%`"
					/>
				</div>
				<div class="project-row-due">
					<span
						v-if="!task.done && priorityLevel === 'urgent'"
						class="print-row-urgent project-row-urgent"
					><Icon icon="exclamation-circle" /> 緊急</span>
					<span
						v-if="!task.done && printOverdueDays > 0"
						class="project-overdue"
					>逾期 {{ printOverdueDays }} 天</span>
					<time
						v-else-if="printDate"
						:datetime="printDate.toISOString()"
						:title="formatDateLong(printDate.toISOString())"
					>{{ projectDateLabel }}</time>
					<span
						v-else
						class="project-no-date"
					>—</span>
					<div class="project-row-actions">
						<BaseButton
							:class="{'is-favorite': task.is_favorite}"
							:aria-label="task.is_favorite ? $t('task.detail.actions.unfavorite') : $t('task.detail.actions.favorite')"
							@click.stop="toggleFavorite"
						>
							<Icon :icon="task.is_favorite ? 'star' : ['far', 'star']" />
						</BaseButton>
						<BaseButton
							v-if="!task.done && !disabled && !authStore.isLinkShareAuth"
							:aria-label="$t('focus.startFocus')"
							@click.stop="showFocusCard = true"
						>
							<Icon icon="stopwatch" />
						</BaseButton>
						<BaseButton
							v-if="canDelete && !disabled"
							:aria-label="$t('task.detail.actions.delete')"
							@click.stop="showDeleteModal = true"
						>
							<Icon icon="trash-alt" />
						</BaseButton>
					</div>
				</div>
			</template>
			<template v-else>
				<span
					v-tooltip="!canMarkAsDone ? $t('task.readOnlyCheckbox') : ''"
					class="is-inline-flex is-align-items-center"
				>
					<FancyCheckbox
						:key="checkboxKey"
						:model-value="task.done ?? false"
						:disabled="isArchived || disabled || !canMarkAsDone"
						:aria-label="$t('task.detail.markAsDone', {task: task.title})"
						@update:modelValue="markAsDone"
						@click.stop
					/>
				</span>

				<ColorBubble
					v-if="!showProjectSeparately && projectColor !== '' && currentProject?.id !== task.project_id"
					:color="projectColor"
					class="mie-1"
				/>

				<div
					:class="{ 'done': task.done, 'show-project': showProject && project}"
					class="tasktext"
				>
					<span>
						<RouterLink
							v-if="showProject && typeof project !== 'undefined'"
							v-tooltip="$t('task.detail.belongsToProject', {project: project.title})"
							:to="{ name: 'project.index', params: { projectId: task.project_id } }"
							class="task-project mie-1"
							:class="{'mie-2': task.hex_color !== ''}"
							@click.stop
						>
							{{ project.title }}
						</RouterLink>

						<ColorBubble
							v-if="task.hex_color !== ''"
							:color="getHexColor(task.hex_color)"
							class="mie-1"
						/>

						<TaskGlanceTooltip :task="task">
							<RouterLink
								ref="taskLinkRef"
								:to="taskDetailRoute"
								class="task-link"
							>
								{{ task.title }}
							</RouterLink>
						</TaskGlanceTooltip>
					</span>

					<span
						v-if="inProgress"
						class="status-chip mis-2"
					>
						{{ $t('task.status.inProgress') }}
					</span>
					<span
						v-else-if="paused"
						class="status-chip status-chip--paused mis-2"
					>
						{{ $t('task.status.paused') }}
					</span>

					<Labels
						v-if="(task.labels?.length ?? 0) > 0"
						class="labels mis-2 mie-1"
						:labels="task.labels ?? []"
					/>

					<AssigneeList
						v-if="(task.assignees?.length ?? 0) > 0"
						:assignees="task.assignees ?? []"
						:avatar-size="25"
						class="mis-1"
						:inline="true"
					/>

					<Popup
						v-if="task.due_date && +new Date(task.due_date) > 0"
						placement="bottom-start"
						:anchor="dueDateTriggerEl"
						sheet-on-mobile
						:sheet-title="$t('task.deferDueDate.title')"
					>
						<template #trigger="{toggle, isOpen}">
							<BaseButton
								ref="dueDateTrigger"
								v-tooltip="formatDateLong(task.due_date)"
								class="dueDate"
								@click.prevent.stop="toggle()"
							>
								<time
									:datetime="formatISO(task.due_date)"
									class="is-italic"
									:aria-expanded="isOpen ? 'true' : 'false'"
								>
									– {{ $t('task.detail.due', {at: dueDateFormatted}) }}
								</time>
							</BaseButton>
						</template>
						<template #content="{isOpen}">
							<DeferTask
								v-if="isOpen"
								:model-value="task"
							/>
						</template>
					</Popup>

					<span>
						<span
							v-if="(task.attachments?.length ?? 0) > 0"
							class="project-task-icon"
							role="img"
							:aria-label="$t('task.attributes.attachment', (task.attachments?.length ?? 0))"
						>
							<Icon icon="paperclip" />
						</span>
						<span
							v-if="!isEditorContentEmpty((task.description ?? ''))"
							class="project-task-icon is-mirrored-rtl"
						>
							<Icon icon="align-left" />
						</span>
						<span
							v-if="isRepeating"
							class="project-task-icon"
						>
							<Icon icon="history" />
						</span>
						<CommentCount
							:task="task"
							class="project-task-icon"
						/>
					</span>

					<ChecklistSummary :task="task" />
				</div>

				<ProgressBar
					v-if="!task.done && (task.percent_done ?? 0) > 0"
					:value="(task.percent_done ?? 0) * 100"
					is-small
				/>

				<ColorBubble
					v-if="showProjectSeparately && projectColor !== '' && currentProject?.id !== task.project_id"
					:color="projectColor"
					class="mie-1"
				/>

				<RouterLink
					v-if="showProjectSeparately"
					v-tooltip="$t('task.detail.belongsToProject', {project: project.title})"
					:to="{ name: 'project.index', params: { projectId: task.project_id } }"
					class="task-project"
					@click.stop
				>
					{{ project.title }}
				</RouterLink>

				<!-- Fixed width, so a row missing a button still keeps the progress bars of all rows in one column. -->
				<div class="task-actions">
					<BaseButton
						:class="{'is-favorite': task.is_favorite}"
						class="favorite"
						@click.stop="toggleFavorite"
					>
						<span class="is-sr-only">{{
							task.is_favorite ? $t('task.detail.actions.unfavorite') : $t('task.detail.actions.favorite')
						}}</span>
						<Icon
							v-if="task.is_favorite"
							icon="star"
						/>
						<Icon
							v-else
							:icon="['far', 'star']"
						/>
					</BaseButton>
					<BaseButton
						v-if="!task.done && !disabled && !authStore.isLinkShareAuth"
						v-tooltip="$t('focus.startFocus')"
						class="focus-task"
						@click.stop="showFocusCard = true"
					>
						<span class="is-sr-only">{{ $t('focus.startFocus') }}</span>
						<Icon icon="stopwatch" />
					</BaseButton>
					<BaseButton
						v-if="canDelete && !disabled"
						class="delete-task"
						@click.stop="showDeleteModal = true"
					>
						<span class="is-sr-only">{{ $t('task.detail.actions.delete') }}</span>
						<Icon icon="trash-alt" />
					</BaseButton>
				</div>
			</template>
			<slot />
		</div>
		<template v-if="typeof task.related_tasks?.subtask !== 'undefined'">
			<template v-for="subtask in task.related_tasks.subtask">
				<template v-if="getTaskById(subtask.id)">
					<single-task-in-project
						:key="subtask.id"
						:the-task="getTaskById(subtask.id)!"
						:disabled="disabled"
						:can-mark-as-done="canMarkAsDone"
						:all-tasks="allTasks"
						:project-row="projectRow"
						:can-delete="canDelete"
						class="subtask-nested"
					/>
				</template>
			</template>
		</template>

		<FocusStartCard
			v-if="showFocusCard"
			:task-id="task.id!"
			:task-title="task.title ?? ''"
			:project-id="task.project_id"
			@close="showFocusCard = false"
		/>
		<Modal
			v-if="showDeleteModal"
			@close="showDeleteModal = false"
			@submit="deleteTask()"
		>
			<template #header>
				<span>{{ $t('task.detail.delete.header') }}</span>
			</template>

			<template #text>
				<p class="tw:text-balance">
					{{ task.title }}
				</p>
				<p class="tw:text-balance">
					{{ $t('task.detail.delete.text1') }}
				</p>
				<p class="tw:text-balance">
					{{ $t('task.detail.delete.text2') }}
				</p>
			</template>
		</Modal>
	</div>
</template>

<script setup lang="ts">
import {ref, watch, onMounted, computed} from 'vue'
import {useI18n} from 'vue-i18n'

import {getHexColor} from '@/helpers/task'
import type {Task as ITask} from '@/client/generated'

import Labels from '@/components/tasks/partials/Labels.vue'
import TaskGlanceTooltip from '@/components/tasks/partials/TaskGlanceTooltip.vue'
import DeferTask from '@/components/tasks/partials/DeferTask.vue'
import ChecklistSummary from '@/components/tasks/partials/ChecklistSummary.vue'
import CommentCount from '@/components/tasks/partials/CommentCount.vue'

import ProgressBar from '@/components/misc/ProgressBar.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import ColorBubble from '@/components/misc/ColorBubble.vue'
import Popup from '@/components/misc/Popup.vue'
import Modal from '@/components/misc/Modal.vue'
import FocusStartCard from '@/components/focus/FocusStartCard.vue'
import {isInProgress, isPaused} from '@/helpers/taskStatus'
import {confirmFinishingSubtasks} from '@/composables/useFinishConfirm'


import {formatDisplayDate, formatISO, formatDateLong} from '@/helpers/time/formatDate'
import {success} from '@/message'

import {useProjects} from '@/composables/useProjects'
import {useCurrentProject} from '@/composables/useCurrentProject'
import {useUpdateTaskMutation, useFavoriteTaskMutation, useDeleteTaskMutation} from '@/client/queries/taskMutations'
import {taskKeys} from '@/client/queries/tasks'
import {useQueryClient} from '@tanstack/vue-query'
import AssigneeList from '@/components/tasks/partials/AssigneeList.vue'
import {useIntervalFn} from '@vueuse/core'
import {playPopSound} from '@/helpers/playPop'
import {isEditorContentEmpty} from '@/helpers/editorContentEmpty'
import {TASK_REPEAT_MODES} from '@/types/IRepeatMode'
import {useGlobalNow} from '@/composables/useGlobalNow'
import {useDelayedLoading} from '@/composables/useDelayedLoading'
import {PRIORITIES, getPriorityLevel} from '@/constants/priorities'
import {useAuthStore} from '@/stores/auth'
import {useRouter} from 'vue-router'

const props = withDefaults(defineProps<{
	theTask: ITask,
	printRow?: boolean,
	projectRow?: boolean,
	hidePrintTime?: boolean,
	isArchived?: boolean,
	showProject?: boolean,
	disabled?: boolean,
	canMarkAsDone?: boolean,
	canDelete?: boolean,
	allTasks?: ITask[],
}>(), {
	printRow: false,
	projectRow: false,
	hidePrintTime: false,
	isArchived: false,
	showProject: false,
	disabled: false,
	canMarkAsDone: true,
	canDelete: false,
	allTasks: () => [],
})

const emit = defineEmits<{
	'taskUpdated': [task: ITask],
}>()

function getTaskById(taskId: number | undefined): ITask | undefined {
	if (typeof props.allTasks === 'undefined' || props.allTasks.length === 0) {
		return undefined
	}

	return props.allTasks.find(t => t.id === taskId)
}

const {t} = useI18n({useScope: 'global'})

const task = computed(() => props.theTask)

const router = useRouter()
const queryClient = useQueryClient()
const authStore = useAuthStore()
const inProgress = computed(() => isInProgress(task.value))
const paused = computed(() => isPaused(task.value))
const priorityLevel = computed(() => getPriorityLevel(
	task.value.priority,
	task.value.done,
	authStore.settings.frontend_settings.minimum_priority || PRIORITIES.MEDIUM,
))

const isRepeating = computed(() => (task.value.repeat_after ?? 0) > 0
	|| ((task.value.repeat_after ?? 0) === 0
		&& task.value.repeat_mode === TASK_REPEAT_MODES.REPEAT_MODE_MONTH))

const projectList = useProjects()
const updateTask = useUpdateTaskMutation(true)
const favoriteTask = useFavoriteTaskMutation()
const deleteTaskMutation = useDeleteTaskMutation()
const isLoading = useDelayedLoading(() => updateTask.isPending.value || favoriteTask.isPending.value || deleteTaskMutation.isPending.value)

const project = computed(() => projectList.projects[task.value.project_id ?? 0])
const projectColor = computed(() => project.value?.hex_color ?? '')

const showProjectSeparately = computed(() => !props.showProject
	&& currentProject.value?.id !== task.value.project_id
	&& project.value)

const {currentProject} = useCurrentProject()

const taskDetailRoute = computed(() => ({
	name: 'task.detail',
	params: {id: task.value.id},
	state: { backdropView: router.currentRoute.value.fullPath },
}))

function updateDueDate() {
	if (!task.value.due_date) {
		return
	}

	dueDateFormatted.value = formatDisplayDate(task.value.due_date)
}

const dueDateFormatted = ref('')
useIntervalFn(updateDueDate, 60_000, {
	immediateCallback: true,
})
onMounted(updateDueDate)

watch(() => task.value.due_date, updateDueDate)

const {now} = useGlobalNow()
const isOverdue = computed(() => (
	!task.value.done &&
	task.value.due_date !== null &&
	new Date(task.value.due_date ?? 0).getTime() > 0 &&
	new Date(task.value.due_date ?? 0).getTime() <= now.value.getTime()
))

let oldTask: ITask

// Changing the key puts the checkbox back to what the task says, after a tick that was not carried out.
const checkboxKey = ref(0)

// Printed rows use whole calendar days for overdue labels and the scheduled time otherwise.
const printDate = computed(() => {
	const due = task.value.due_date ? new Date(task.value.due_date) : null
	const raw = due && due.getFullYear() > 1 ? task.value.due_date : task.value.start_date
	const date = raw ? new Date(raw) : null
	return date && date.getFullYear() > 1 ? date : null
})
const printOverdueDays = computed(() => {
	if (!printDate.value || task.value.done) return 0
	const start = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
	return Math.max(0, Math.round((start(now.value) - start(printDate.value)) / 86_400_000))
})
const printTimeLabel = computed(() => {
	if (!printDate.value) return '未排程'
	if (printOverdueDays.value === 1) return '昨天'
	if (printDate.value.toDateString() !== now.value.toDateString()) return `${printDate.value.getMonth() + 1}/${printDate.value.getDate()}`
	if (printDate.value.getHours() === 0 && printDate.value.getMinutes() === 0) return '全天'
	return printDate.value.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})
})

const projectDateLabel = computed(() => {
	const date = printDate.value
	if (!date) return ''
	if (date.toDateString() === now.value.toDateString()) {
		return date.getHours() || date.getMinutes() ? `今天 ${date.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}` : '今天'
	}
	return `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, '0')}`
})

async function markAsDone(checked: boolean, wasReverted: boolean = false) {
	if (!wasReverted) oldTask = {...task.value}

	// Finishing a task finishes its unfinished subtasks, so ask first and leave everything as it is if not.
	if (checked && !wasReverted && !(await confirmFinishingSubtasks(task.value))) {
		checkboxKey.value++
		return
	}

	// Fire the request immediately and with the intended done value snapshotted, so a re-render or
	// teardown during the animation delay can neither drop the save nor make it send a stale state.
	const source = wasReverted && isRepeating.value ? oldTask : task.value
	const updatePromise = updateTask.mutateAsync({
		...source,
		id: source.id!,
		done: checked,
		// Finishing a task records full progress, which stays when the task is reopened or moved around.
		// Only undo takes it back to the progress the task had before.
		...(checked ? {percent_done: 1} : wasReverted ? {percent_done: oldTask.percent_done, paused: oldTask.paused} : {}),
	}).catch(() => undefined)

	const finish = async () => {
		const newTask = await updatePromise
		if (!newTask) return

		updateDueDate()

		// Workaround: after reopening, the list kept showing stale data (no priority tint) until a
		// reload. Refetch the lists so the task returns with the server's data. Not done when
		// completing, as the refetch would remove the task and leave nothing to undo.
		if (!checked) {
			await queryClient.invalidateQueries({queryKey: taskKeys.lists})
		}

		if (wasReverted) {
			return
		}

		if (checked) {
			playPopSound()
		}
		emit('taskUpdated', newTask)

		let message = t('task.doneSuccess')
		if (!task.value.done && !isRepeating.value) {
			message = t('task.undoneSuccess')
		}

		success({message}, [{
			title: t('task.undo'),
			callback: () => undoDone(checked),
		}])
	}

	if (checked) {
		setTimeout(finish, 300) // Delay only the follow-up to show the animation when marking a task as done
	} else {
		await finish() // Don't delay it when un-marking it as it doesn't have an animation the other way around
	}
}

function undoDone(checked: boolean) {
	markAsDone(!checked, true)
}

async function toggleFavorite() {
	const updated = await favoriteTask.mutateAsync({...task.value, id: task.value.id!})
	emit('taskUpdated', updated)
}

const showFocusCard = ref(false)
const showDeleteModal = ref(false)

async function deleteTask() {
	showDeleteModal.value = false
	await deleteTaskMutation.mutateAsync(task.value.id!)
	success({message: t('task.detail.deleteSuccess')})
	emit('taskUpdated', task.value)
}

const taskRoot = ref<HTMLElement | null>(null)
const dueDateTrigger = ref<InstanceType<typeof BaseButton> | null>(null)
const dueDateTriggerEl = computed<HTMLElement | null>(() => dueDateTrigger.value?.$el ?? null)
const taskLinkRef = ref<InstanceType<typeof BaseButton> | null>(null)

function hasTextSelected() {
	const isTextSelected = window.getSelection()?.toString()
	return !(typeof isTextSelected === 'undefined' || isTextSelected === '' || isTextSelected === '\n')
}

function openTaskDetail(event: MouseEvent | KeyboardEvent) {
	if (event.target instanceof HTMLElement) {
		const isInteractiveElement = event.target.closest('a, button, label, input[type="checkbox"], .favorite, [role="button"]')
		if (isInteractiveElement || hasTextSelected()) {
			return
		}
	}

	void router.push(taskDetailRoute.value)
}

defineExpose({
	focus: () => taskRoot.value?.focus(),
	click: (e: MouseEvent | KeyboardEvent) => openTaskDetail(e),
})
</script>

<style lang="scss" scoped>
.task {
	display: flex;
	flex-wrap: wrap;
	padding: .4rem;
	transition: background-color $transition;
	align-items: center;
	cursor: pointer;
	border-radius: $radius;
	border: 2px solid transparent;

	&:hover {
		background-color: var(--grey-100);
	}

	// The progress bar has the same size and place in every row, whether a task or a subtask, so the bars line up.
	:deep(.progress-bar) {
		flex: 0 0 16rem;
		inline-size: 16rem;
		margin-inline: auto .75rem;

		@media screen and (max-width: $tablet) {
			flex-basis: 8rem;
			inline-size: 8rem;
		}
	}

	// The priority is shown as a tinted background instead of a label.
	&[data-priority-level] {
		background-color: color-mix(in srgb, var(--priority-color) var(--priority-tint), transparent);

		&:hover {
			background-color: color-mix(in srgb, var(--priority-color) calc(var(--priority-tint) + 8%), transparent);
		}
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

	// A task being worked on is yellow. Urgent keeps its red, so it is never missed.
	&[data-progress]:not([data-priority-level='urgent']) {
		background-color: color-mix(in srgb, var(--status-doing) 24%, transparent);

		&:hover {
			background-color: color-mix(in srgb, var(--status-doing) 32%, transparent);
		}
	}

	// A paused task is a calm blue-grey. Urgent keeps its red.
	&[data-paused]:not([data-priority-level='urgent']) {
		background-color: color-mix(in srgb, var(--status-paused) 18%, transparent);

		&:hover {
			background-color: color-mix(in srgb, var(--status-paused) 26%, transparent);
		}
	}

	// A finished task has a light green background instead of a strike-through.
	&[data-done] {
		background-color: color-mix(in srgb, var(--success) 16%, transparent);

		&:hover {
			background-color: color-mix(in srgb, var(--success) 24%, transparent);
		}
	}

	&:has(*:focus-visible), &:focus {
		box-shadow: 0 0 0 2px hsla(var(--primary-hsl), 0.5);

		a.task-link {
			box-shadow: none;
		}
	}

	@supports not selector(:focus-within) {
		:focus {
			box-shadow: 0 0 0 2px hsla(var(--primary-hsl), 0.5);

			a.task-link {
				box-shadow: none;
			}
		}
	}

	.tasktext,
	&.tasktext {
		text-overflow: ellipsis;
		word-wrap: break-word;
		word-break: break-word;
		display: -webkit-box;
		hyphens: auto;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;

		flex: 1 0 50%;

	}

	.dueDate {
		display: inline-block;
		margin-inline-start: 5px;

		&:focus-visible {
			box-shadow: none;

			time {
				box-shadow: 0 0 0 1px hsla(var(--primary-hsl), 0.5);
				border-radius: 3px;
			}
		}
	}

	&[data-is-overdue] .dueDate {
		color: var(--danger-text);
	}

	.task-project {
		inline-size: auto;
		color: var(--grey-400);
		font-size: .9rem;
		white-space: nowrap;
	}

	.tasktext :deep(.color-bubble),
	.tasktext :deep(.avatar-wrapper),
	.tasktext :deep(.labels .tag) {
		vertical-align: middle;
		transform: translateY(-2px);
	}

	.avatar {
		border-radius: 50%;
		vertical-align: bottom;
		margin-inline-start: 5px;
		block-size: 27px;
		inline-size: 27px;
	}

	.project-task-icon {
		margin-inline-start: 6px;

		&:not(:first-of-type) {
			margin-inline-start: 8px;
		}

	}

	a {
		color: var(--text);
		transition: color ease $transition-duration;

		&:hover {
			color: var(--grey-900);
		}
	}

	// Room for the three buttons (27px each) in every row.
	.task-actions {
		display: flex;
		flex: 0 0 auto;
		justify-content: flex-end;
		min-inline-size: calc(27px * 3);
	}

	.favorite {
		opacity: 1;
		text-align: center;
		inline-size: 27px;
		transition: opacity $transition, color $transition;
		border-radius: $radius;

		&:hover {
			color: var(--warning);
		}

		&.is-favorite {
			opacity: 1;
			color: var(--warning);
		}
	}

	.focus-task,
	.delete-task {
		opacity: 1;
		text-align: center;
		inline-size: 27px;
		transition: opacity $transition, color $transition;
		border-radius: $radius;
	}

	.focus-task:hover {
		color: var(--primary);
	}

	.delete-task:hover {
		color: var(--danger);
	}

	@media(hover: hover) and (pointer: fine) {
		& .favorite,
		& .focus-task,
		& .delete-task {
			opacity: 0;
		}

		&:hover .favorite,
		&:hover .focus-task,
		&:hover .delete-task {
			opacity: 1;
		}
	}

	.favorite:focus,
	.focus-task:focus,
	.delete-task:focus {
		opacity: 1;
	}

	:deep(.fancy-checkbox) {
		block-size: 18px;
		padding-block-start: 0;
		padding-inline-end: .5rem;

		span {
			display: none;
		}

		// Extend the hit target to >=44x44 without affecting layout (WCAG 2.5.5).
		.base-checkbox__label {
			position: relative;

			&::before {
				content: '';
				position: absolute;
				inset-block-start: 50%;
				inset-inline-start: 50%;
				min-block-size: 44px;
				min-inline-size: 44px;
				block-size: 100%;
				inline-size: 100%;
				transform: translate(-50%, -50%);
			}
		}
	}

	span.parent-tasks {
		color: var(--grey-500);
		inline-size: auto;
	}

	.show-project .parent-tasks {
		padding-inline-start: .25rem;
	}

	.remove {
		color: var(--danger);
	}

	input[type='checkbox'] {
		vertical-align: middle;
	}

	.settings {
		float: inline-end;
		inline-size: 24px;
		cursor: pointer;
	}

	&.loader-container.is-loading:after {
		inset-block-start: calc(50% - 1rem);
		inset-inline-start: calc(50% - 1rem);
		inline-size: 2rem;
		block-size: 2rem;
		border-inline-start-color: var(--grey-300);
		border-block-end-color: var(--grey-300);
	}
}

.subtask-nested {
	margin-inline-start: 1.75rem;
}

:deep(.popup) {
	border-radius: $radius;
	background-color: var(--white);
	box-shadow: var(--shadow-lg);
	color: var(--text);

	&.is-open {
		padding: 1rem;
		border: 1px solid var(--grey-200);
	}
}
</style>
