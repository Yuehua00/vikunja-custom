<template>
	<Transition name="fade">
		<div
			v-if="visible"
			class="night-reminder"
			role="status"
		>
			<p class="night-reminder-title">
				{{ $t('nightMode.reminderTitle') }}
			</p>
			<p class="night-reminder-text">
				{{ $t('nightMode.reminderText') }}
			</p>
			<div class="night-reminder-actions">
				<XButton
					v-if="!hasTodayEntry"
					@click="writeDiary"
				>
					{{ $t('nightMode.writeDiary') }}
				</XButton>
				<XButton
					:variant="hasTodayEntry ? 'primary' : 'secondary'"
					@click="dismissTonight"
				>
					{{ $t('nightMode.done') }}
				</XButton>
				<XButton
					variant="secondary"
					@click="snooze"
				>
					{{ $t('nightMode.snooze') }}
				</XButton>
			</div>
		</div>
	</Transition>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRouter} from 'vue-router'

import {useDiary} from '@/client/queries/diary'
import {useFocusTimer} from '@/composables/useFocusTimer'
import {useNightMode} from '@/composables/useNightMode'
import {diaryDateKey} from '@/helpers/diary'

const {shouldRemind, dismissTonight, snooze} = useNightMode()
const {active} = useFocusTimer()
const {entryByDate} = useDiary()
const router = useRouter()

const hasTodayEntry = computed(() => entryByDate.value.has(diaryDateKey(new Date())))

function writeDiary() {
	dismissTonight()
	void router.push({name: 'diary'})
}

// A running timer is not interrupted, the reminder shows once it is over.
const visible = computed(() => shouldRemind.value && !active.value)
</script>

<style lang="scss" scoped>
.night-reminder {
	position: fixed;
	inset-block-start: 4.5rem;
	inset-inline-start: 50%;
	transform: translateX(-50%);
	z-index: 95;
	inline-size: min(24rem, calc(100vw - 2rem));
	padding: 1.25rem 1.5rem;
	background: var(--white);
	color: var(--text);
	border: 1px solid var(--grey-200);
	border-radius: 16px;
	box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
	text-align: center;
}

.night-reminder-title {
	margin-block-end: .35rem;
	font-size: 1.15rem;
	font-weight: 700;
}

.night-reminder-text {
	margin-block-end: 1rem;
	color: var(--grey-600);
}

.night-reminder-actions {
	display: flex;
	justify-content: center;
	gap: .75rem;
}
</style>
