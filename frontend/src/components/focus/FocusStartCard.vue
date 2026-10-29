<template>
	<Modal @close="close">
		<section
			v-cy="'focusStartCard'"
			class="focus-start-card"
			aria-label="開始專注"
		>
			<header class="focus-start-heading">
				<h2>FOCUS <span>開始專注</span></h2>
				<button
					type="button"
					aria-label="關閉"
					:disabled="saving"
					@click="close"
				>
					×
				</button>
			</header>
			<div class="focus-start-body">
				<p class="focus-start-caption">
					這次專注在
				</p>
				<h3 class="focus-start-title">
					{{ taskTitle }}
				</h3>
				<template v-if="active">
					<p class="focus-start-note">
						{{ $t('focus.alreadyRunning', {task: active.task_title || $t('focus.noTask')}) }}
					</p>
					<XButton
						class="focus-start-button"
						@click="openFocusPage"
					>
						{{ $t('focus.openFocusPage') }}
					</XButton>
				</template>
				<form
					v-else
					:aria-busy="saving"
					@submit.prevent="start"
				>
					<fieldset :disabled="saving">
						<legend class="focus-start-caption">
							選擇計時方式
						</legend>
						<div
							class="focus-start-modes"
							role="group"
							:aria-label="$t('focus.chooseMode')"
						>
							<button
								type="button"
								:class="{'is-selected': mode === 'pomo'}"
								:aria-pressed="mode === 'pomo'"
								@click="mode = 'pomo'"
							>
								<Icon icon="stopwatch" /> {{ $t('focus.countdown') }}
							</button>
							<button
								type="button"
								:class="{'is-selected': mode === 'stopwatch'}"
								:aria-pressed="mode === 'stopwatch'"
								@click="mode = 'stopwatch'"
							>
								<Icon :icon="['far', 'clock']" /> {{ $t('focus.stopwatch') }}
							</button>
						</div>
						<template v-if="mode === 'pomo'">
							<div
								class="focus-start-presets"
								role="group"
								aria-label="快捷分鐘"
							>
								<button
									v-for="preset in [15, 25, 45, 60]"
									:key="preset"
									type="button"
									:aria-pressed="minutes === preset"
									:class="{'is-selected': minutes === preset}"
									@click="minutes = preset"
								>
									{{ preset }} 分
								</button>
							</div>
							<label class="focus-start-minutes">自訂時間 <span><input
								v-model.number="minutes"
								type="number"
								required
								:min="MIN_POMO_MINUTES"
								:max="MAX_POMO_MINUTES"
								step="1"
							> 分鐘</span></label>
						</template>
						<p
							v-else
							class="focus-start-note"
						>
							從 00:00 開始累計，完成後再停止計時。
						</p>
					</fieldset>
					<p
						v-if="errorMessage"
						role="alert"
						class="focus-start-error"
					>
						{{ errorMessage }}
					</p>
					<XButton
						type="submit"
						class="focus-start-button"
						:disabled="saving"
						:loading="saving"
					>
						{{ saving ? '正在開始…' : '開始專注' }}
					</XButton>
				</form>
			</div>
		</section>
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

const props = defineProps<{taskId: number, taskTitle: string, projectId?: number}>()
const emit = defineEmits<{close: []}>()
const {t} = useI18n({useScope: 'global'})
const router = useRouter()
const {active, pomoMinutes, start: startTimer, setPomoMinutes} = useFocusTimer()
const mode = ref<FocusMode>('pomo')
const minutes = ref(pomoMinutes.value)
const saving = ref(false)
const errorMessage = ref('')

function close() {
	if (!saving.value) emit('close')
}

async function start() {
	if (saving.value || active.value) return
	saving.value = true
	errorMessage.value = ''
	const length = clampPomoMinutes(minutes.value)
	try {
		// Save the preference first: a failed preference save must not leave a running timer behind.
		if (mode.value === 'pomo' && length !== pomoMinutes.value) await setPomoMinutes(length)
		await startTimer({taskId: props.taskId, taskTitle: props.taskTitle, projectId: props.projectId, mode: mode.value, minutes: length})
		success({message: t('focus.started')})
		emit('close')
	} catch {
		errorMessage.value = '無法開始專注，請確認連線後再試一次。'
	} finally {
		saving.value = false
	}
}

function openFocusPage() {
	emit('close')
	return router.push({name: 'focus'})
}
</script>

<style lang="scss" scoped>
.focus-start-card {
	inline-size: 100%;
	max-inline-size: 28rem;
	margin-inline: auto;
	background: var(--white);
	color: var(--text);
	border: 1px solid var(--grey-200);
	text-align: start;
}

.focus-start-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: .85rem 1.25rem;
	background: var(--print-green, #205640);
	color: #ffffff;

	h2 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: .05em;
	}

	span {
		font-size: .9rem;
	}

	button {
		border: 0;
		background: transparent;
		color: inherit;
		font-size: 1.65rem;
		cursor: pointer;
		min-inline-size: 2.5rem;
		min-block-size: 2.5rem;
	}
}

.focus-start-body {
	padding: 1.5rem;

	fieldset {
		padding: 0;
		margin: 0 0 1.5rem;
		border: 0;
		min-inline-size: 0;
	}

	button:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 3px;
	}
}

.focus-start-caption {
	margin: 0 0 .5rem;
	color: var(--grey-500);
	font-size: .85rem;
}

.focus-start-title {
	margin: 0 0 1.5rem;
	padding-block-end: 1.25rem;
	border-block-end: 1px solid var(--grey-200);
	font-size: 1.35rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.focus-start-modes,
.focus-start-presets {
	display: flex;
	gap: .5rem;
	margin-block-end: 1rem;

	button {
		flex: 1;
		padding: .7rem .25rem;
		border: 1px solid var(--grey-300);
		background: transparent;
		color: var(--text);
		cursor: pointer;
		font: inherit;

		&.is-selected {
			border-color: var(--print-green, #205640);
			background: color-mix(in srgb, var(--primary) 12%, var(--white));
			font-weight: 700;
		}
	}
}

.focus-start-presets {
	font-size: .85rem;
}

.focus-start-minutes {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: .5rem;
	font-size: .9rem;

	input {
		inline-size: 5rem;
		padding: .5rem;
		border: 1px solid var(--grey-300);
		background: var(--white);
		color: var(--text);
		text-align: center;
	}
}

.focus-start-note {
	margin: 1rem 0;
	color: var(--grey-500);
}

.focus-start-error {
	color: var(--danger);
	font-size: .9rem;
}

.focus-start-body .focus-start-button {
	display: flex;
	inline-size: 100%;
	margin: 0;
	min-block-size: 2.75rem;
	background: var(--print-green, #205640);
	color: #ffffff;
}
</style>
