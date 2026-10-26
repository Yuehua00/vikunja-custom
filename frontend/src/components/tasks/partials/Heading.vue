<template>
	<div class="heading print-task-heading">
		<p class="print-task-eyebrow">
			{{ projectTitle || 'TASK' }}・<BaseButton @click="copyUrl">
				{{ textIdentifier }}
			</BaseButton>・{{ task.due_date ? formatDisplayDate(task.due_date) : '未排程' }}
		</p>
		<div class="print-task-header-tools">
			<BaseButton
				v-if="canWrite"
				v-shortcut="SHORTCUTS.taskDetail.favorite"
				:aria-label="task.is_favorite ? $t('task.detail.actions.unfavorite') : $t('task.detail.actions.favorite')"
				:aria-pressed="task.is_favorite ?? false"
				@click="$emit('favorite')"
			>
				<Icon :icon="task.is_favorite ? 'star' : ['far', 'star']" />
			</BaseButton>
			<BaseButton
				v-if="hasClose"
				:to="{name:'task.detail',params:{id:task.id}}"
				target="_blank"
				rel="noopener"
				aria-label="在新頁面開啟"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				><path d="M14 4h6v6 M20 4 12 12 M10 5H5v14h14v-5" /></svg>
			</BaseButton>
			<BaseButton
				v-if="hasClose"
				class="print-task-close d-print-none"
				:aria-label="$t('task.detail.closeTaskDetail')"
				@click="$emit('close')"
			>
				<Icon icon="times" />
			</BaseButton>
		</div>
		<div class="print-task-title-line">
			<h1
				class="title input"
				:class="{'disabled': !canWrite}"
				:contenteditable="canWrite ? true : undefined"
				:tabindex="canWrite ? 0 : undefined"
				:aria-label="canWrite ? $t('task.attributes.title') : undefined"
				:spellcheck="false"
				@input="handleTitleInput"
				@blur="save($event.target as HTMLElement)"
				@keydown.enter.prevent.stop="!$event.isComposing && ($event.target as HTMLInputElement).blur()"
				@keydown.esc.prevent.stop="!$event.isComposing && cancel($event.target as HTMLInputElement)"
			>
				{{ (task.title ?? '').trim() }}
			</h1>
			<div class="print-task-heading-chips">
				<span
					v-for="label in task.labels"
					:key="label.id"
					class="print-task-label-chip"
				>{{ label.title }}</span>
				<span
					class="print-task-state-chip"
					:class="{'is-done':task.done,'is-paused':task.paused}"
				>{{ task.done ? '已完成' : task.paused ? '暫停中' : (task.percent_done ?? 0) > 0 ? '處理中' : '未開始' }}</span>
			</div>
		</div>
		<CustomTransition name="fade">
			<span
				v-if="loading && saving"
				class="is-inline-flex is-align-items-center"
			>
				<span class="loader is-inline-block mie-2" />
				{{ $t('misc.saving') }}
			</span>
			<span
				v-else-if="!loading && showSavedMessage"
				class="has-text-success is-inline-flex is-align-content-center"
			>
				<Icon
					icon="check"
					class="mie-2"
				/>
				{{ $t('misc.saved') }}
			</span>
		</CustomTransition>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, watch} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'

import {error} from '@/message'
import BaseButton from '@/components/base/BaseButton.vue'
import CustomTransition from '@/components/misc/CustomTransition.vue'

import {useCopyToClipboard} from '@/composables/useCopyToClipboard'
import {useDelayedLoading} from '@/composables/useDelayedLoading'
import {useUpdateTaskMutation} from '@/client/queries/taskMutations'

import type {Task as ITask} from '@/client/generated'
import {getTaskIdentifier} from '@/helpers/task'
import {formatDisplayDate} from '@/helpers/time/formatDate'
import {SHORTCUTS} from '@/constants/shortcuts'

const props = defineProps<{
	task: ITask,
	canWrite: boolean,
	hasClose: boolean,
	projectTitle?: string,
}>()

const emit = defineEmits<{
	'update:task': [task: ITask],
	'close': [],
	'favorite': [],
}>()

const router = useRouter()
const copy = useCopyToClipboard()
const {t} = useI18n({useScope: 'global'})

async function copyUrl() {
	const route = router.resolve({name: 'task.detail', params: {id: props.task.id}})
	const absoluteURL = new URL(route.href, window.location.href).href

	await copy(absoluteURL)
}

const updateTask = useUpdateTaskMutation()
const loading = useDelayedLoading(updateTask.isPending)

const textIdentifier = computed(() => getTaskIdentifier(props.task))

// Since loading is global state, this variable ensures we're only showing the saving icon when saving the description.
const saving = ref(false)

const showSavedMessage = ref(false)

// Track if title has unsaved changes
const titleHasChanges = ref(false)

function handleBeforeUnload(e: BeforeUnloadEvent) {
	if (titleHasChanges.value) {
		e.preventDefault()
		// Modern browsers ignore custom messages but this is still required
		e.returnValue = ''
		return ''
	}
}

onMounted(() => {
	window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
	window.removeEventListener('beforeunload', handleBeforeUnload)
})

// Reset titleHasChanges when the task changes
watch(() => props.task.id, () => {
	titleHasChanges.value = false
})

function handleTitleInput(event: Event) {
	const target = event.target as HTMLInputElement
	titleHasChanges.value = target.textContent !== (props.task.title ?? '')
}

async function save(element: HTMLElement) {
	const title = element.textContent ?? ''

	// An empty title would be discarded by the api, so revert and tell the user instead of failing silently.
	if (title.trim() === '') {
		element.textContent = props.task.title ?? ''
		titleHasChanges.value = false
		error({message: t('task.detail.titleRequired')})
		return
	}

	// We only want to save if the title was actually changed.
	// so we only continue if the task title changed.
	if (title === props.task.title) {
		return
	}

	try {
		saving.value = true
		const newTask = await updateTask.mutateAsync({
			...props.task,
			id: props.task.id!,
			title,
		})
		emit('update:task', newTask)
		titleHasChanges.value = false
		showSavedMessage.value = true
		setTimeout(() => {
			showSavedMessage.value = false
		}, 2000)
	} finally {
		saving.value = false
	}
}

async function cancel(element: HTMLInputElement) {
	element.textContent = props.task.title ?? ''
	titleHasChanges.value = false
	element.blur()
}
</script>

<style lang="scss" scoped>
.heading {
	display: flex;
	justify-content: flex-start;
	text-transform: none;
	align-items: center;

	@media screen and (max-width: $tablet) {
		flex-direction: column;
		align-items: start;
	}
}

.title {
	margin-block-end: 0;
}

.title.input {
	// 1.8rem is the font-size, 1.125 is the line-height, .3rem padding everywhere, 1px border around the whole thing.
	min-block-size: calc(1.8rem * 1.125 + .6rem + 2px);
	margin-inline-end: 0;

	@media screen and (max-width: $tablet) {
		margin: 0 -.3rem .5rem; // the title has 0.3rem padding - this make the text inside of it align with the rest
	}
}

.title.task-id {
	color: var(--grey-400);
	white-space: nowrap;
}

.color-bubble {
	block-size: .75rem;
	inline-size: .75rem;
}

// Modal renders its own fixed close button from $tablet up
.close {
	display: none;
	font-size: 2rem;
	line-height: 1;
	position: absolute;
	inset-inline-end: 1.25rem;
	inset-block-start: 1.1rem;

	@media screen and (max-width: $tablet) {
		display: block;
	}
}

.task-properties {
	@media screen and (max-width: $tablet) {
		flex-direction: row;
	}
}
</style>
