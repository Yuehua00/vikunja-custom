<template>
	<div
		v-cy="'diaryView'"
		class="diary-view"
	>
		<h1 class="page-title">
			{{ $t('diary.title') }}
		</h1>

		<section class="diary-main">
			<div class="diary-date-row">
				<XButton
					variant="tertiary"
					:aria-label="$t('diary.previousDay')"
					@click="shiftDay(-1)"
				>
					&lsaquo;
				</XButton>
				<div class="diary-date">
					<strong>{{ dateTitle }}</strong>
					<span
						v-if="date === today"
						class="diary-today"
					>
						{{ $t('diary.today') }}
					</span>
				</div>
				<XButton
					variant="tertiary"
					:disabled="date >= today"
					:aria-label="$t('diary.nextDay')"
					@click="shiftDay(1)"
				>
					&rsaquo;
				</XButton>
			</div>

			<div
				class="diary-moods"
				role="group"
				:aria-label="$t('diary.mood')"
			>
				<span class="diary-moods-label">{{ $t('diary.mood') }}</span>
				<button
					v-for="mood in MOODS"
					:key="mood"
					type="button"
					class="diary-mood"
					:class="{'is-active': currentMood === mood}"
					:style="{'--mood-color': MOOD_COLORS[mood]}"
					:aria-pressed="currentMood === mood"
					@click="pickMood(mood)"
				>
					<span class="diary-mood-dot" />
					{{ $t(`diary.moods.${mood}`) }}
				</button>
			</div>

			<Editor
				:key="date"
				:model-value="text"
				:placeholder="$t('diary.placeholder')"
				@update:modelValue="onInput"
				@save="flush"
			/>

			<p class="diary-status">
				{{ status === 'saving' ? $t('diary.saving') : status === 'saved' ? $t('diary.saved') : '' }}
			</p>
		</section>

		<section
			v-if="months.length > 0"
			class="diary-past"
		>
			<h2 class="diary-past-title">
				{{ $t('diary.past') }}
			</h2>
			<div
				v-for="month in months"
				:key="month.key"
				class="diary-month"
			>
				<h3 class="diary-month-title">
					{{ month.key }}
				</h3>
				<ul class="diary-list">
					<li
						v-for="item in month.items"
						:key="item.date"
					>
						<button
							type="button"
							class="diary-item"
							:class="{'is-current': item.date === date}"
							@click="goTo(item.date)"
						>
							<span
								class="diary-item-dot"
								:style="{background: item.mood ? MOOD_COLORS[item.mood] : 'var(--grey-300)'}"
							/>
							<span class="diary-item-date">{{ item.date.slice(8) }}</span>
							<span class="diary-item-text">{{ item.preview }}</span>
						</button>
					</li>
				</ul>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {useDebounceFn} from '@vueuse/core'
import dayjs from 'dayjs'

import XButton from '@/components/input/Button.vue'
import Editor from '@/components/input/AsyncEditor'

import {useDiary} from '@/client/queries/diary'
import {useTitle} from '@/composables/useTitle'
import {isEditorContentEmpty} from '@/helpers/editorContentEmpty'
import {MOODS, MOOD_COLORS, diaryDateKey, diaryPreview, isDiaryTitle, moodOf, type Mood} from '@/helpers/diary'
import {error} from '@/message'

const AUTOSAVE_DELAY = 1000

const {t, locale} = useI18n({useScope: 'global'})
useTitle(() => t('diary.title'))

const route = useRoute()
const router = useRouter()
const {entryByDate, saveText, setMood} = useDiary()

const today = computed(() => diaryDateKey(new Date()))

// The day comes from the address, so the calendar on the home page can link to it.
const date = computed(() => {
	const requested = route.query.date
	return typeof requested === 'string' && isDiaryTitle(requested) && requested <= today.value ? requested : today.value
})

const dateTitle = computed(() => new Intl.DateTimeFormat(locale.value, {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
	weekday: 'long',
}).format(dayjs(date.value).toDate()))

const entry = computed(() => entryByDate.value.get(date.value))
const currentMood = computed(() => moodOf(entry.value?.labels))
const saved = computed(() => entry.value?.description ?? '')

const text = ref(saved.value)
// Once the user has typed, a reload of the entry must not replace what is in the editor.
const dirty = ref(false)
const status = ref<'idle' | 'saving' | 'saved'>('idle')

watch(saved, value => {
	if (!dirty.value) text.value = value
})

// Saves the text of one day. It is a no-op when nothing was typed, and an empty day is never created.
async function persist(forDate: string, html: string) {
	if (!dirty.value) return
	if (isEditorContentEmpty(html) && !entryByDate.value.has(forDate)) return
	status.value = 'saving'
	try {
		await saveText(forDate, html)
		status.value = 'saved'
	} catch {
		status.value = 'idle'
		error({message: t('diary.saveFailed')})
	}
}

const autosave = useDebounceFn(() => persist(date.value, text.value), AUTOSAVE_DELAY)

function onInput(html: string) {
	text.value = html
	dirty.value = true
	status.value = 'idle'
	void autosave()
}

function flush() {
	return persist(date.value, text.value)
}

// Leaving a day saves it first, then the editor shows the next one.
watch(date, (_next, previous) => {
	void persist(previous, text.value)
	dirty.value = false
	status.value = 'idle'
	text.value = saved.value
})

onBeforeUnmount(() => {
	void flush()
})

function goTo(target: string) {
	return router.push({name: 'diary', query: {date: target}})
}

function shiftDay(days: number) {
	const target = diaryDateKey(dayjs(date.value).add(days, 'day').toDate())
	if (target <= today.value) void goTo(target)
}

async function pickMood(mood: Mood) {
	try {
		await setMood(date.value, mood)
	} catch {
		error({message: t('diary.saveFailed')})
	}
}

const months = computed(() => {
	const groups = new Map<string, {date: string, mood: Mood | undefined, preview: string}[]>()
	const dates = [...entryByDate.value.keys()].sort().reverse()
	for (const key of dates) {
		const task = entryByDate.value.get(key)
		const month = key.slice(0, 7)
		groups.set(month, [...(groups.get(month) ?? []), {
			date: key,
			mood: moodOf(task?.labels),
			preview: diaryPreview(task?.description),
		}])
	}
	return [...groups.entries()].map(([key, items]) => ({key, items}))
})
</script>

<style lang="scss" scoped>
.diary-view {
	max-inline-size: 48rem;
	margin-inline: auto;
	padding: 1rem;
}

.diary-main {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	padding: 1.5rem 1.75rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: 20px;
}

.diary-date-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: .5rem;
}

.diary-date {
	display: flex;
	align-items: baseline;
	gap: .6rem;
	font-size: 1.1rem;
}

.diary-today {
	font-size: .8rem;
	color: var(--primary);
}

.diary-moods {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .5rem;
}

.diary-moods-label {
	font-size: .85rem;
	color: var(--grey-500);
}

.diary-mood {
	display: inline-flex;
	align-items: center;
	gap: .4rem;
	padding: .35rem .9rem;
	background: var(--grey-100);
	color: var(--text);
	border: 1px solid transparent;
	border-radius: 999px;
	cursor: pointer;
	transition: background $transition, border-color $transition;

	&:hover {
		background: color-mix(in srgb, var(--mood-color) 18%, var(--grey-100));
	}

	&.is-active {
		background: color-mix(in srgb, var(--mood-color) 28%, var(--white));
		border-color: var(--mood-color);
	}
}

.diary-mood-dot {
	inline-size: .7rem;
	block-size: .7rem;
	background: var(--mood-color);
	border-radius: 50%;
}

.diary-status {
	min-block-size: 1.2em;
	font-size: .8rem;
	color: var(--grey-500);
	text-align: end;
}

.diary-past {
	margin-block-start: 2rem;
}

.diary-past-title {
	margin-block-end: .5rem;
	font-size: 1.1rem;
}

.diary-month-title {
	margin-block: .75rem .35rem;
	font-size: .85rem;
	color: var(--grey-500);
}

.diary-list {
	display: flex;
	flex-direction: column;
	gap: .25rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.diary-item {
	display: flex;
	align-items: center;
	gap: .7rem;
	inline-size: 100%;
	padding: .5rem .8rem;
	background: transparent;
	color: var(--text);
	text-align: start;
	border: 0;
	border-radius: 10px;
	cursor: pointer;

	&:hover,
	&.is-current {
		background: var(--grey-100);
	}
}

.diary-item-dot {
	flex: 0 0 .7rem;
	block-size: .7rem;
	border-radius: 50%;
}

.diary-item-date {
	flex: 0 0 1.6rem;
	font-variant-numeric: tabular-nums;
	color: var(--grey-500);
}

.diary-item-text {
	min-inline-size: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
