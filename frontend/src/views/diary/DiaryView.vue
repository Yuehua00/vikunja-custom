<template>
	<div
		v-cy="'diaryView'"
		class="diary-view print-diary-page"
	>
		<p class="print-page-kicker">
			DIARY
		</p><h1 class="page-title">
			{{ $t('diary.title') }}
		</h1>
		<div class="print-diary-layout">
			<div class="print-diary-writing">
				<section
					class="diary-main print-sheet"
					:aria-busy="isDeleting"
				>
					<header class="diary-date-row">
						<div class="diary-date">
							<b>{{ dayjs(date).format('DD') }}</b><span>{{ dayjs(date).format('YYYY 年 M 月') }}<small>{{ dateTitle }}{{ date === today ? '・今天' : '' }}</small></span>
						</div><div>
							<XButton
								variant="tertiary"
								:disabled="isDeleting"
								:aria-label="$t('diary.previousDay')"
								@click="shiftDay(-1)"
							>
								‹
							</XButton><XButton
								variant="tertiary"
								:disabled="date >= today || isDeleting"
								:aria-label="$t('diary.nextDay')"
								@click="shiftDay(1)"
							>
								›
							</XButton>
						</div>
					</header>
					<div class="diary-question">
						<div><small>TODAY'S QUESTION</small><p>{{ diaryQuestions[questionIndex] }}</p></div><button
							type="button"
							@click="questionIndex = (questionIndex + 1) % diaryQuestions.length"
						>
							換一題
						</button>
					</div>
					<div
						class="diary-moods"
						role="group"
						:aria-label="$t('diary.mood')"
					>
						<span class="diary-moods-label">{{ $t('diary.mood') }}</span><button
							v-for="mood in MOODS"
							:key="mood"
							type="button"
							class="diary-mood"
							:class="{'is-active':currentMood === mood}"
							:style="{'--mood-color':MOOD_COLORS[mood]}"
							:aria-label="$t(`diary.moods.${mood}`)"
							:title="$t(`diary.moods.${mood}`)"
							:aria-pressed="currentMood === mood"
							:disabled="isDeleting"
							@click="pickMood(mood)"
						>
							<svg
								viewBox="0 0 40 40"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							><circle
								cx="20"
								cy="20"
								r="17.5"
							/><path d="M14 14v4 M26 14v4" /><path :d="mood === 'good' ? 'M12 24q8 10 16 0' : mood === 'ok' ? 'M13 26h14' : 'M12 28q8-7 16 0'" /></svg><span>{{ $t(`diary.moods.${mood}`) }}</span>
						</button>
					</div>
					<div
						class="diary-editor"
						:inert="isDeleting"
					>
						<Editor
							:key="`${date}-${editorVersion}`"
							:model-value="text"
							:placeholder="$t('diary.placeholder')"
							@update:modelValue="onInput"
							@save="flush"
						/>
					</div><p
						class="diary-status"
						role="status"
					>
						{{ status === 'saving' ? $t('diary.saving') : status === 'saved' ? $t('diary.saved') : '自動儲存' }}
					</p>
					<div
						v-if="entry"
						class="diary-delete-controls"
					>
						<button
							v-if="!confirmingDelete"
							type="button"
							@click="confirmingDelete = true"
						>
							刪除這天的日記
						</button>
						<template v-else>
							<p role="alert">
								確定刪除 {{ date }} 的日記與心情？刪除後無法復原。
							</p>
							<button
								type="button"
								:disabled="isDeleting"
								@click="removeEntry"
							>
								{{ isDeleting ? '刪除中…' : '確認刪除' }}
							</button>
							<button
								type="button"
								:disabled="isDeleting"
								@click="confirmingDelete = false"
							>
								取消
							</button>
						</template>
					</div>
				</section>
			</div>
			<aside class="print-diary-aside">
				<section class="print-sheet diary-trace">
					<header class="print-plain-heading">
						<h2>TRACE {{ date === today ? '今天' : '當天' }}的足跡</h2><span>自動帶入</span>
					</header>
					<p
						v-if="traceQuery.isFetching.value"
						class="print-empty"
					>
						完成任務載入中…
					</p>
					<p
						v-else-if="traceQuery.isError.value"
						class="print-empty"
					>
						完成任務暫時無法載入，請稍後再試。
					</p>
					<dl>
						<div>
							<dt>DONE 完成</dt><dd>
								<b>{{ traceQuery.isFetching.value ? '…' : traceQuery.isError.value ? '—' : completedTasks.length }}</b> 件任務<ul>
									<li
										v-for="task in completedTasks"
										:key="task.id"
									>
										<RouterLink :to="{name:'task.detail',params:{id:task.id},state:{backdropView:$route.fullPath}}">
											{{ task.title }}
										</RouterLink>
									</li>
								</ul>
							</dd>
						</div><div><dt>FOCUS 專注</dt><dd><b>{{ focusMinutes }}</b> 分鐘・{{ focusPomodoros }} 個番茄</dd></div><div>
							<dt>HABITS 習慣</dt><dd>
								<span
									v-for="habit in dayHabits"
									:key="habit.id"
									:class="{'is-done':habit.done}"
								>{{ habit.done ? '已完成' : '未完成' }} {{ habit.name }}</span>
							</dd>
						</div>
					</dl><XButton
						variant="secondary"
						:disabled="traceQuery.isFetching.value || traceQuery.isError.value"
						@click="insertTrace"
					>
						放進{{ date === today ? '今天' : '當天' }}的日記
					</XButton>
				</section>
				<section class="diary-past print-sheet">
					<header class="print-plain-heading">
						<h2>PAST 過往日記</h2><span>{{ entryByDate.size }} 篇</span>
					</header><p
						v-if="!months.length"
						class="print-empty"
					>
						還沒有過往日記
					</p><div
						v-for="month in months"
						:key="month.key"
						class="diary-month"
					>
						<h3 class="diary-month-title">
							{{ month.key.replace('-','・') }}
						</h3><ul class="diary-list">
							<li
								v-for="item in month.items"
								:key="item.date"
							>
								<button
									type="button"
									class="diary-item"
									:class="{'is-current':item.date === date}"
									@click="goTo(item.date)"
								>
									<span
										class="diary-item-dot"
										:style="{background:item.mood ? MOOD_COLORS[item.mood] : 'var(--grey-300)'}"
									/><span class="diary-item-date">{{ item.date.slice(8) }}</span><span class="diary-item-text">{{ item.preview || '未填寫內容' }}</span><small>{{ dayjs(item.date).format('ddd').toUpperCase() }}</small>
								</button>
							</li>
						</ul>
					</div>
				</section>
			</aside>
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {useDebounceFn} from '@vueuse/core'
import dayjs from 'dayjs'
import {useQuery} from '@tanstack/vue-query'
import {allTasksQuery} from '@/client/queries/tasks'
import {useAuthStore} from '@/stores/auth'
import {flattenRecords} from '@/helpers/focus'
import {DEFAULT_HABITS} from '@/helpers/habits'

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
const {entryByDate, saveText, setMood, deleteEntry} = useDiary()

const today = computed(() => diaryDateKey(new Date()))

// The day comes from the address, so the calendar on the home page can link to it.
const date = computed(() => {
	const requested = route.query.date
	return typeof requested === 'string' && isDiaryTitle(requested) && requested <= today.value ? requested : today.value
})

const dateTitle = computed(() => new Intl.DateTimeFormat(locale.value, {
	weekday: 'long',
}).format(dayjs(date.value).toDate()))

const authStore = useAuthStore()
const traceQuery = useQuery(computed(() => ({
	...allTasksQuery({params: {filter: 'done = true'}}),
	enabled: authStore.authenticated,
	staleTime: 60_000,
})))
const completedTasks = computed(() => (traceQuery.data.value ?? []).filter(task =>
	!isDiaryTitle(task.title) && task.done_at && diaryDateKey(new Date(task.done_at)) === date.value,
))
const dayFocus = computed(() => flattenRecords(Object.fromEntries(Object.entries(authStore.settings.frontend_settings.focus_records ?? {})
	.map(([month, records]) => [month, records.map(record => ({...record}))])))
	.filter(record => diaryDateKey(new Date(record.started_at)) === date.value))
const focusMinutes = computed(() => Math.floor(dayFocus.value.reduce((sum, record) => sum + record.seconds, 0) / 60))
const focusPomodoros = computed(() => dayFocus.value.filter(record => record.completed).length)
const dayHabits = computed(() => {
	const settings = authStore.settings.frontend_settings
	const done = settings.habit_logs?.[date.value] ?? []
	return (settings.habits ?? DEFAULT_HABITS)
		.filter(habit => habit.days.includes(dayjs(date.value).day()) || done.includes(habit.id))
		.map(habit => ({...habit, done: done.includes(habit.id)}))
})
const diaryQuestions = ['今天有什麼小事讓你開心？', '今天學到什麼新東西？', '今天最想感謝誰？', '有什麼事想留給明天的自己？']
const questionIndex = ref(0)
function insertTrace() {
	if (traceQuery.isFetching.value || traceQuery.isError.value) return
	const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	const completed = completedTasks.value.map(task => `<li>${escape(task.title ?? '')}</li>`).join('')
	onInput(`${text.value}<h3>當日足跡</h3><p>完成 ${completedTasks.value.length} 件任務；專注 ${focusMinutes.value} 分鐘，${focusPomodoros.value} 個番茄。</p>${completed ? `<ul>${completed}</ul>` : ''}<p>習慣：${dayHabits.value.map(habit => `${escape(habit.name)}（${habit.done ? '完成' : '未完成'}）`).join('、') || '沒有安排'}</p>`)
}

const entry = computed(() => entryByDate.value.get(date.value))
const currentMood = computed(() => moodOf(entry.value?.labels ?? undefined))
const saved = computed(() => entry.value?.description ?? '')

const text = ref('')
// Once the user has typed, a reload of the entry must not replace what is in the editor.
const dirty = ref(false)
const isDeleting = ref(false)
const confirmingDelete = ref(false)
const editorVersion = ref(0)
const status = ref<'idle' | 'saving' | 'saved'>('idle')

watch(saved, value => {
	if (!dirty.value) text.value = value
}, {immediate: true})

// Saves the text of one day. It is a no-op when nothing was typed, and an empty day is never created.
async function persist(forDate: string, html: string) {
	if (!dirty.value || isDeleting.value) return
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
	if (isDeleting.value) return
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
	if (isDeleting.value) return
	confirmingDelete.value = false
	return router.push({name: 'diary', query: {date: target}})
}

function shiftDay(days: number) {
	const target = diaryDateKey(dayjs(date.value).add(days, 'day').toDate())
	if (target <= today.value) void goTo(target)
}

async function pickMood(mood: Mood) {
	if (isDeleting.value) return
	try {
		await setMood(date.value, mood)
	} catch {
		error({message: t('diary.saveFailed')})
	}
}

async function removeEntry() {
	if (isDeleting.value) return
	isDeleting.value = true
	try {
		await deleteEntry(date.value)
		dirty.value = false
		text.value = ''
		status.value = 'idle'
		editorVersion.value++
		confirmingDelete.value = false
	} catch {
		error({message: '日記刪除失敗，請稍後再試。'})
	} finally {
		isDeleting.value = false
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
			mood: moodOf(task?.labels ?? undefined),
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
