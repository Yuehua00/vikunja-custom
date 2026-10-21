<template>
	<ProjectWrapper
		class="project-draw"
		:is-loading-project="isLoadingProject"
		:project-id
		:view-id
	>
		<template #default>
			<div
				v-cy="'drawView'"
				class="draw-view"
			>
				<div class="draw-toolbar">
					<span class="draw-next">{{ nextChangeLabel }}</span>
					<div
						ref="settingsRoot"
						class="draw-settings"
					>
						<BaseButton
							class="draw-settings-trigger"
							:aria-expanded="showSettings"
							@click="showSettings = !showSettings"
						>
							<Icon icon="cog" />
							{{ intervalLabel }}
						</BaseButton>

						<div
							v-if="showSettings"
							class="draw-settings-panel"
							@keydown.esc="showSettings = false"
						>
							<div class="draw-settings-title">
								{{ $t('project.draw.interval.title') }}
							</div>
							<label
								v-for="option in INTERVAL_OPTIONS"
								:key="option"
								class="draw-interval-option"
							>
								<input
									type="radio"
									name="draw-interval"
									:checked="drawState.interval === option"
									@change="changeInterval(option)"
								>
								{{ $t(`project.draw.interval.${option}`) }}
							</label>
							<label class="draw-interval-option">
								<input
									type="radio"
									name="draw-interval"
									:checked="drawState.interval === 'custom'"
									@change="changeInterval('custom')"
								>
								{{ $t('project.draw.interval.customBefore') }}
								<input
									type="number"
									min="1"
									max="365"
									class="draw-custom-days"
									:value="drawState.custom_days ?? DEFAULT_CUSTOM_DAYS"
									:aria-label="$t('project.draw.interval.customAfter')"
									@change="event => setCustomDays((event.target as HTMLInputElement).value)"
								>
								{{ $t('project.draw.interval.customAfter') }}
							</label>
							<p class="draw-settings-hint">
								{{ $t('project.draw.interval.hint') }}
							</p>
						</div>
					</div>
				</div>

				<p
					v-if="!isFetching && tasks.length === 0"
					class="draw-message"
				>
					{{ $t('project.draw.empty') }}
				</p>
				<p
					v-else-if="!isFetching && !card"
					class="draw-message"
				>
					{{ $t('project.draw.nothingToDraw') }}
				</p>

				<article
					v-else-if="card"
					class="draw-card"
				>
					<div class="draw-card-top">
						<span
							v-if="typeLabel"
							class="draw-type"
							:style="typeStyle"
						>
							{{ typeLabel.title }}
						</span>
						<span class="draw-age">{{ ageLabel }}</span>
					</div>

					<h2 class="draw-title">
						<RouterLink
							:to="{name: 'task.detail', params: {id: card.id}, state: {backdropView: route.fullPath}}"
							draggable="false"
						>
							{{ card.title }}
						</RouterLink>
					</h2>

					<ImportanceStars
						:model-value="card.importance"
						@update:modelValue="setImportance"
					/>
					<span
						v-if="card.importance === 0"
						class="draw-importance-hint"
					>
						{{ $t('project.draw.importanceNotSet') }}
					</span>

					<div class="draw-section">
						<div class="draw-section-title">
							{{ $t('project.draw.summary') }}
						</div>
						<p
							class="draw-summary"
							:class="{'is-empty': summary === ''}"
						>
							{{ summary === '' ? $t('project.draw.noSummary') : summary }}
						</p>
					</div>

					<a
						v-if="link"
						class="draw-link"
						:href="link"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Icon icon="link" />
						{{ link }}
					</a>

					<div class="draw-progress">
						<ProgressBar
							:value="Math.round(card.percent_done * 100)"
							is-primary
						/>
						<span class="draw-progress-label">
							{{ card.percent_done > 0 ? $t('project.draw.progress', {percent: Math.round(card.percent_done * 100)}) : $t('project.draw.notStarted') }}
						</span>
						<PercentDoneSelect
							v-if="card.percent_done > 0"
							:model-value="card.percent_done"
							@update:modelValue="setPercent"
						/>
					</div>

					<div class="draw-actions">
						<XButton
							v-if="card.percent_done === 0"
							variant="primary"
							@click="start"
						>
							{{ $t('project.draw.start') }}
						</XButton>
						<XButton
							variant="secondary"
							@click="finish"
						>
							{{ $t('project.draw.finish') }}
						</XButton>
						<XButton
							variant="secondary"
							@click="skip"
						>
							{{ $t('project.draw.skip') }}
						</XButton>
						<span class="draw-actions-spacer" />
						<XButton
							variant="tertiary"
							@click="drawNew(card.id)"
						>
							{{ $t('project.draw.redraw') }}
						</XButton>
					</div>
				</article>

				<div
					v-if="tasks.length > 0"
					class="draw-footer"
				>
					<span>{{ $t('project.draw.stats', {pool: pool.length, reading: readingCount, done: doneCount}) }}</span>
					<span>{{ $t('project.draw.rule') }}</span>
				</div>
			</div>
		</template>
	</ProjectWrapper>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {onClickOutside} from '@vueuse/core'
import dayjs from 'dayjs'

import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import ProgressBar from '@/components/misc/ProgressBar.vue'
import ImportanceStars from '@/components/tasks/partials/ImportanceStars.vue'
import PercentDoneSelect from '@/components/tasks/partials/PercentDoneSelect.vue'

import {allTasksQuery} from '@/client/queries/tasks'
import {useUpdateTaskMutation} from '@/client/queries/taskMutations'
import {useUpdateFrontendSettingsMutation} from '@/client/queries/account'
import {useAuthStore} from '@/stores/auth'
import {
	DEFAULT_CARD_DRAW_STATE,
	SKIP_DAYS,
	extractLink,
	isDrawDue,
	isDrawable,
	nextChangeAt,
	pickCard,
	summaryOf,
	type CardDrawInterval,
	type CardDrawState,
} from '@/helpers/cardDraw'

const props = defineProps<{
	isLoadingProject: boolean,
	projectId: number,
	viewId: number,
}>()

const INTERVAL_OPTIONS = ['open', 'day', 'days3', 'week'] as const
const DEFAULT_CUSTOM_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

const {t, locale} = useI18n({useScope: 'global'})
const route = useRoute()
const authStore = useAuthStore()
const updateTask = useUpdateTaskMutation(true)
const updateFrontendSettings = useUpdateFrontendSettingsMutation()

const query = useQuery(computed(() => allTasksQuery({
	project: props.projectId,
	view: props.viewId,
	params: {
		sort_by: ['id'],
		order_by: ['asc'],
		filter_timezone: authStore.settings.timezone,
	},
})))
const isFetching = query.isFetching
const tasks = computed(() => query.data.value ?? [])

const pool = computed(() => tasks.value.filter(task => isDrawable(task, new Date())))
const readingCount = computed(() => tasks.value.filter(task => !task.done && task.percent_done > 0).length)
const doneCount = computed(() => tasks.value.filter(task => task.done).length)

const viewKey = computed(() => String(props.viewId))
const drawState = computed<CardDrawState>(() => ({
	...DEFAULT_CARD_DRAW_STATE,
	...authStore.settings.frontend_settings.card_draw?.[viewKey.value],
}))

async function saveDrawState(patch: Partial<CardDrawState>) {
	const session = authStore.session
	if (!session) {
		return
	}
	const all = authStore.settings.frontend_settings.card_draw ?? {}
	await updateFrontendSettings.mutateAsync({
		id: session.id,
		type: session.type,
		frontendSettings: {card_draw: {...all, [viewKey.value]: {...drawState.value, ...patch}}},
	})
}

const card = computed(() => tasks.value.find(task => task.id === drawState.value.task_id && !task.done))

async function drawNew(excludeId?: number) {
	const next = pickCard(pool.value, new Date(), excludeId)
	await saveDrawState({
		task_id: next?.id,
		drawn_at: next ? new Date().toISOString() : undefined,
	})
}

// Runs once per visit, when the tasks are first available: keep the current card until its period is
// over, otherwise draw. An every-open interval always draws.
const initialized = ref(false)
watch(() => query.data.value, data => {
	if (!data || initialized.value) {
		return
	}
	initialized.value = true

	const state = drawState.value
	const current = pool.value.find(task => task.id === state.task_id)
	if (!current || state.interval === 'open' || isDrawDue(state, new Date())) {
		void drawNew(current?.id)
	}
}, {immediate: true})

const showSettings = ref(false)
const settingsRoot = ref<HTMLElement | null>(null)
onClickOutside(settingsRoot, () => {
	showSettings.value = false
})

function changeInterval(interval: CardDrawInterval) {
	return saveDrawState({
		interval,
		...(interval === 'custom' ? {custom_days: drawState.value.custom_days ?? DEFAULT_CUSTOM_DAYS} : {}),
	})
}

function setCustomDays(value: string) {
	const days = Math.min(365, Math.max(1, Math.round(Number(value)) || DEFAULT_CUSTOM_DAYS))
	return saveDrawState({interval: 'custom', custom_days: days})
}

const intervalLabel = computed(() => {
	const state = drawState.value
	if (state.interval === 'custom') {
		return `${t('project.draw.interval.customBefore')} ${state.custom_days ?? DEFAULT_CUSTOM_DAYS} ${t('project.draw.interval.customAfter')}`
	}
	return t(`project.draw.interval.${state.interval}`)
})

const nextChangeLabel = computed(() => {
	const next = nextChangeAt(drawState.value)
	if (next === null) {
		return drawState.value.interval === 'open' ? t('project.draw.nextOnOpen') : ''
	}
	const date = new Intl.DateTimeFormat(locale.value, {
		month: 'numeric',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(next)
	return t('project.draw.nextChange', {date})
})

const typeLabel = computed(() => card.value?.labels?.[0])
const typeStyle = computed(() => {
	const hex = typeLabel.value?.hex_color?.replace('#', '')
	return hex ? {background: `color-mix(in srgb, #${hex} 22%, var(--white))`} : undefined
})

const ageLabel = computed(() => {
	if (!card.value?.created) {
		return ''
	}
	const days = Math.floor((Date.now() - new Date(card.value.created).getTime()) / DAY_MS)
	return days < 1 ? t('project.draw.addedToday') : t('project.draw.addedDaysAgo', {count: days})
})

const link = computed(() => extractLink(card.value?.description))
const summary = computed(() => summaryOf(card.value?.description))

function setImportance(importance: number) {
	if (!card.value) {
		return
	}
	return updateTask.mutateAsync({id: card.value.id, importance})
}

function start() {
	if (!card.value) {
		return
	}
	return updateTask.mutateAsync({id: card.value.id, percent_done: Math.max(card.value.percent_done, 0.1)})
}

async function setPercent(percent: number) {
	if (!card.value) {
		return
	}
	const id = card.value.id
	await updateTask.mutateAsync({id, percent_done: percent, done: percent >= 1})
	if (percent >= 1) {
		await drawNew(id)
	}
}

async function finish() {
	if (!card.value) {
		return
	}
	const id = card.value.id
	await updateTask.mutateAsync({id, done: true, percent_done: 1})
	await drawNew(id)
}

// The start date keeps a skipped card out of the draw until it has passed.
async function skip() {
	if (!card.value) {
		return
	}
	const id = card.value.id
	await updateTask.mutateAsync({id, start_date: dayjs().add(SKIP_DAYS, 'day').toISOString()})
	await drawNew(id)
}
</script>

<style scoped lang="scss">
.draw-toolbar {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: .75rem;
	margin-block-end: 1rem;
	font-size: .85rem;
	color: var(--grey-500);
}

.draw-settings {
	position: relative;
}

.draw-settings-trigger {
	display: inline-flex;
	align-items: center;
	gap: .5rem;
	padding: .4rem .8rem;
	border: 1px solid var(--grey-200);
	border-radius: 10px;
	background: var(--white);
	color: var(--text);
}

.draw-settings-panel {
	position: absolute;
	inset-block-start: calc(100% + .5rem);
	inset-inline-end: 0;
	z-index: 10;
	inline-size: 19rem;
	padding: 1rem 1.1rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: 14px;
	box-shadow: 0 12px 32px rgba(0, 0, 0, .14);
	color: var(--text);
}

.draw-settings-title {
	margin-block-end: .5rem;
	font-size: .75rem;
	font-weight: 700;
	letter-spacing: .06em;
	color: var(--grey-500);
}

.draw-interval-option {
	display: flex;
	align-items: center;
	gap: .6rem;
	padding: .4rem 0;
	cursor: pointer;
}

.draw-custom-days {
	inline-size: 4rem;
	padding: .15rem .4rem;
	border: 1px solid var(--grey-300);
	border-radius: 8px;
	background: var(--white);
	color: var(--text);
}

.draw-settings-hint {
	margin: .5rem 0 0;
	padding-block-start: .6rem;
	border-block-start: 1px solid var(--grey-100);
	font-size: .75rem;
	color: var(--grey-500);
}

.draw-message {
	margin: 3rem 0;
	text-align: center;
	color: var(--grey-500);
}

.draw-card {
	max-inline-size: 38rem;
	margin: 0 auto;
	padding: 2rem 2.25rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: 20px;
	box-shadow: 0 8px 28px rgba(0, 0, 0, .08);
	text-align: start;
}

.draw-card-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: .5rem;
}

.draw-type {
	padding: .15rem .75rem;
	border-radius: 999px;
	background: var(--grey-100);
	color: var(--text);
	font-size: .8rem;
	font-weight: 500;
}

.draw-age {
	font-size: .8rem;
	color: var(--grey-500);
}

.draw-title {
	margin: 1rem 0 .5rem;
	font-size: 1.75rem;
	line-height: 1.3;
	font-weight: 700;

	a {
		color: var(--text);

		&:hover {
			color: var(--primary);
			text-decoration: underline;
		}
	}
}

.draw-importance-hint {
	margin-inline-start: .5rem;
	font-size: .8rem;
	color: var(--grey-500);
}

.draw-section {
	margin-block-start: 1.4rem;
}

.draw-section-title {
	margin-block-end: .35rem;
	font-size: .75rem;
	font-weight: 700;
	letter-spacing: .06em;
	color: var(--grey-500);
}

.draw-summary {
	margin: 0;
	line-height: 1.75;
	white-space: pre-line;

	&.is-empty {
		color: var(--grey-500);
	}
}

.draw-link {
	display: inline-flex;
	align-items: center;
	gap: .5rem;
	margin-block-start: 1.1rem;
	max-inline-size: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	text-decoration: underline;
}

.draw-progress {
	display: flex;
	align-items: center;
	gap: .75rem;
	margin-block-start: 1.4rem;

	:deep(.progress-bar) {
		flex: 1 1 auto;
		--progress-height: .5rem;
	}
}

.draw-progress-label {
	font-size: .8rem;
	color: var(--grey-500);
	white-space: nowrap;
}

.draw-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: .6rem;
	margin-block-start: 1.75rem;
}

.draw-actions-spacer {
	flex: 1 1 auto;
}

.draw-footer {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: .5rem;
	max-inline-size: 38rem;
	margin: 1.25rem auto 0;
	font-size: .8rem;
	color: var(--grey-500);
}
</style>
