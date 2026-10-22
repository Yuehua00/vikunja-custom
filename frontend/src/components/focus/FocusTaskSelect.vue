<template>
	<div
		ref="root"
		class="focus-task-select"
	>
		<button
			type="button"
			class="focus-task-trigger"
			aria-haspopup="listbox"
			:aria-expanded="open"
			:disabled="disabled"
			@click="open = !open"
		>
			<ColorBubble
				v-if="selectedColor"
				:color="selectedColor"
			/>
			<span class="focus-task-name">{{ selected?.title ?? $t('focus.noTask') }}</span>
			<span
				v-if="selected && countdownOf(selected)"
				class="focus-task-due"
				:class="{'is-soon': countdownOf(selected)!.isSoon}"
			>
				{{ dueText(countdownOf(selected)!.days) }}
			</span>
			<Icon icon="chevron-down" />
		</button>

		<ul
			v-if="open"
			class="focus-task-list"
			role="listbox"
			@keydown.esc="open = false"
		>
			<li role="presentation">
				<button
					type="button"
					class="focus-task-option"
					role="option"
					:aria-selected="modelValue === 0"
					@click="choose(0)"
				>
					<span class="focus-task-name">{{ $t('focus.noTask') }}</span>
				</button>
			</li>
			<li
				v-for="task in tasks"
				:key="task.id"
				role="presentation"
			>
				<button
					type="button"
					class="focus-task-option"
					:class="{'is-selected': task.id === modelValue}"
					role="option"
					:aria-selected="task.id === modelValue"
					@click="choose(task.id)"
				>
					<ColorBubble
						v-if="colorOf(task)"
						:color="colorOf(task)"
					/>
					<span class="focus-task-name">
						{{ task.title }}
						<span
							v-if="projectTitleOf(task)"
							class="focus-task-project"
						>
							{{ projectTitleOf(task) }}
						</span>
					</span>
					<span
						v-if="countdownOf(task)"
						class="focus-task-due"
						:class="{'is-soon': countdownOf(task)!.isSoon}"
					>
						{{ dueText(countdownOf(task)!.days) }}
					</span>
				</button>
			</li>
			<li
				v-if="tasks.length === 0"
				class="focus-task-empty"
			>
				{{ $t('focus.noTasksToPick') }}
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {onClickOutside} from '@vueuse/core'

import ColorBubble from '@/components/misc/ColorBubble.vue'
import {useProjects} from '@/composables/useProjects'
import {dueCountdown, projectColorOf} from '@/helpers/focus'
import type {TaskResponse} from '@/client/queries/tasks'

const props = defineProps<{
	tasks: readonly TaskResponse[],
	disabled?: boolean,
}>()

// The id of the chosen task, 0 for none.
const modelValue = defineModel<number>({required: true})

const {t} = useI18n({useScope: 'global'})
const projectList = useProjects()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => {
	open.value = false
})

const selected = computed(() => props.tasks.find(task => task.id === modelValue.value))

function colorOf(task: TaskResponse) {
	return projectColorOf(projectList.projects[task.project_id]?.hex_color)
}

function projectTitleOf(task: TaskResponse) {
	return projectList.projects[task.project_id]?.title
}

const selectedColor = computed(() => selected.value ? colorOf(selected.value) : undefined)

function countdownOf(task: TaskResponse) {
	return dueCountdown(task, new Date())
}

function dueText(days: number) {
	if (days < 0) {
		return t('focus.dueOverdue', {count: -days})
	}
	if (days === 0) {
		return t('focus.dueToday')
	}
	if (days === 1) {
		return t('focus.dueTomorrow')
	}
	return t('focus.dueInDays', {count: days})
}

function choose(id: number) {
	modelValue.value = id
	open.value = false
}
</script>

<style lang="scss" scoped>
.focus-task-select {
	position: relative;
	flex: 1 1 14rem;
	min-inline-size: 0;
}

.focus-task-trigger,
.focus-task-option {
	display: flex;
	align-items: center;
	gap: .6rem;
	inline-size: 100%;
	padding: .5rem .75rem;
	border: 0;
	background: transparent;
	color: var(--text);
	font-size: .95rem;
	text-align: start;
	cursor: pointer;
}

.focus-task-trigger {
	border: 1px solid var(--grey-200);
	border-radius: 10px;
	background: var(--white);

	&:disabled {
		cursor: default;
		opacity: .7;
	}
}

.focus-task-name {
	flex: 1 1 auto;
	min-inline-size: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.focus-task-project {
	margin-inline-start: .5rem;
	font-size: .8rem;
	color: var(--grey-500);
}

.focus-task-due {
	flex: none;
	padding: .1rem .5rem;
	border-radius: 999px;
	background: var(--grey-100);
	color: var(--grey-600);
	font-size: .75rem;

	// Overdue or due within two days.
	&.is-soon {
		background: color-mix(in srgb, var(--danger) 18%, var(--white));
		color: var(--danger-text, var(--danger));
		font-weight: 500;
	}
}

.focus-task-list {
	position: absolute;
	inset-block-start: calc(100% + .35rem);
	inset-inline: 0;
	z-index: 20;
	max-block-size: 20rem;
	margin: 0;
	padding: .35rem;
	overflow-y: auto;
	list-style: none;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: 12px;
	box-shadow: 0 12px 32px rgba(0, 0, 0, .14);
}

.focus-task-option {
	border-radius: 8px;

	&:hover,
	&.is-selected {
		background: var(--grey-100);
	}
}

.focus-task-empty {
	padding: .6rem .75rem;
	font-size: .85rem;
	color: var(--grey-500);
}
</style>
