<template>
	<Modal @close="emit('close')">
		<div
			v-cy="'focusStartCard'"
			class="focus-start-card"
		>
			<h2 class="focus-start-title">
				{{ taskTitle }}
			</h2>

			<template v-if="active">
				<p class="focus-start-note">
					{{ $t('focus.alreadyRunning', {task: active.task_title || $t('focus.noTask')}) }}
				</p>
				<XButton
					variant="primary"
					@click="openFocusPage"
				>
					{{ $t('focus.openFocusPage') }}
				</XButton>
			</template>

			<template v-else>
				<div
					class="focus-start-modes"
					role="group"
					:aria-label="$t('focus.chooseMode')"
				>
					<button
						type="button"
						class="focus-start-mode"
						:class="{'is-selected': mode === 'pomo'}"
						:aria-pressed="mode === 'pomo'"
						@click="mode = 'pomo'"
					>
						<Icon icon="stopwatch" />
						{{ $t('focus.countdown') }}
					</button>
					<button
						type="button"
						class="focus-start-mode"
						:class="{'is-selected': mode === 'stopwatch'}"
						:aria-pressed="mode === 'stopwatch'"
						@click="mode = 'stopwatch'"
					>
						<Icon :icon="['far', 'clock']" />
						{{ $t('focus.stopwatch') }}
					</button>
				</div>

				<label
					v-if="mode === 'pomo'"
					class="focus-start-minutes"
				>
					<input
						v-model.number="minutes"
						type="number"
						:min="MIN_POMO_MINUTES"
						:max="MAX_POMO_MINUTES"
					>
					{{ $t('focus.minutes') }}
				</label>

				<XButton
					variant="primary"
					class="focus-start-button"
					@click="start"
				>
					{{ $t('focus.start') }}
				</XButton>
			</template>
		</div>
	</Modal>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'

import Modal from '@/components/misc/Modal.vue'
import {useFocusTimer} from '@/composables/useFocusTimer'
import {MAX_POMO_MINUTES, MIN_POMO_MINUTES, clampPomoMinutes, type FocusMode} from '@/helpers/focus'
import {success} from '@/message'

const props = defineProps<{
	taskId: number,
	taskTitle: string,
	projectId?: number,
}>()

const emit = defineEmits<{
	close: [],
}>()

const {t} = useI18n({useScope: 'global'})
const router = useRouter()
const {active, pomoMinutes, start: startTimer, setPomoMinutes} = useFocusTimer()

const mode = ref<FocusMode>('pomo')
const minutes = ref(pomoMinutes.value)

// The timer shows in the top bar, so the user stays where they are.
async function start() {
	const length = clampPomoMinutes(minutes.value)
	await startTimer({
		taskId: props.taskId,
		taskTitle: props.taskTitle,
		projectId: props.projectId,
		mode: mode.value,
		minutes: length,
	})
	if (mode.value === 'pomo' && length !== pomoMinutes.value) {
		await setPomoMinutes(length)
	}
	success({message: t('focus.started')})
	emit('close')
}

function openFocusPage() {
	emit('close')
	return router.push({name: 'focus'})
}
</script>

<style lang="scss" scoped>
.focus-start-card {
	padding: 1.75rem 1.5rem;
	background: var(--white);
	color: var(--text);
	border-radius: 16px;
	text-align: center;
}

.focus-start-title {
	margin: 0 0 1.25rem;
	font-size: 1.25rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.focus-start-note {
	margin: 0 0 1.25rem;
	color: var(--grey-500);
}

.focus-start-modes {
	display: flex;
	gap: .75rem;
	margin-block-end: 1.25rem;
}

.focus-start-mode {
	flex: 1 1 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: .5rem;
	padding: 1rem .5rem;
	border: 2px solid var(--grey-200);
	border-radius: 14px;
	background: var(--white);
	color: var(--text);
	font-size: 1rem;
	cursor: pointer;
	transition: border-color $transition, background $transition;

	&.is-selected {
		border-color: var(--primary);
		background: color-mix(in srgb, var(--primary) 10%, var(--white));
	}
}

.focus-start-minutes {
	display: inline-flex;
	align-items: center;
	gap: .5rem;
	margin-block-end: 1.25rem;

	input {
		inline-size: 4.5rem;
		padding: .35rem .5rem;
		border: 1px solid var(--grey-300);
		border-radius: 8px;
		background: var(--white);
		color: var(--text);
		text-align: center;
	}
}

.focus-start-button {
	display: flex;
	margin: 0 auto;
}
</style>
