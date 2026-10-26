<template>
	<div
		v-cy="'showTasks'"
		class="is-max-width-desktop has-text-start"
		:class="{'print-upcoming-page': !embedded}"
	>
		<p
			v-if="!embedded"
			class="print-page-kicker"
		>
			UPCOMING
		</p>
		<h1
			v-if="!embedded"
			class="page-title"
		>
			{{ $t('navigation.upcoming') }}
		</h1>
		<Message
			v-if="filteredLabels.length > 0"
			class="label-filter-info mbe-2"
		>
			<i18n-t
				keypath="task.show.filterByLabel"
				tag="span"
				class="filter-label-text"
			>
				<template #label>
					<XLabel
						v-for="label in filteredLabels"
						:key="label.id"
						:label="label"
					/>
				</template>
			</i18n-t>
			<BaseButton
				v-tooltip="$t('task.show.clearLabelFilter')"
				class="clear-filter-button"
				:aria-label="$t('task.show.clearLabelFilter')"
				@click="clearLabelFilter"
			>
				<Icon icon="times" />
			</BaseButton>
		</Message>
		<Message
			v-if="savedFilterIgnored"
			class="mbe-2"
		>
			{{ $t('task.show.savedFilterIgnored') }}
		</Message>
		<template v-if="embedded && !loading && (!tasks || tasks.length === 0) && showNothingToDo">
			<h3 class="has-text-centered mbs-6">
				{{ $t('task.show.noTasks') }}
			</h3>
			<LlamaCool class="llama-cool" />
		</template>

		<div
			v-if="embedded && hasTasks"
			class="print-task-groups"
		>
			<template
				v-for="group in embeddedGroups"
				:key="group.title"
			>
				<template v-if="group.tasks.length">
					<div class="print-task-group-title">
						{{ group.title }}<span>{{ group.tasks.length }} 件</span>
					</div>
					<component
						:is="group.collapsed ? 'details' : 'div'"
						class="print-task-group"
					>
						<summary
							v-if="group.collapsed"
							class="print-task-more"
						>
							展開查看
						</summary>
						<ul class="tasks print-task-list">
							<li
								v-for="(task, index) in group.tasks"
								:key="task.id"
							>
								<SingleTaskInProject
									print-row
									:hide-print-time="hideRepeatedPrintDate(group.tasks, index)"
									:show-project="true"
									:the-task="task"
									:can-mark-as-done="(projectList.projects[task.project_id]?.max_permission ?? 0) > PERMISSIONS.READ"
									:can-delete="(projectList.projects[task.project_id]?.max_permission ?? 0) > PERMISSIONS.READ"
									@taskUpdated="updateTasks"
								/>
							</li>
						</ul>
					</component>
				</template>
			</template>
		</div>
		<div
			v-else-if="!embedded"
			class="print-upcoming-layout"
		>
			<section
				class="print-upcoming-days print-sheet"
				:aria-busy="loading"
			>
				<header class="print-section-bar">
					<h2>NEXT {{ upcomingDays.length }} DAYS 接下來 {{ upcomingDays.length }} 天</h2><span>{{ datedTaskCount }} 件・{{ overdueTasks.length }} 件逾期</span>
				</header>
				<section
					v-if="overdueTasks.length"
					class="upcoming-day is-overdue"
				>
					<div class="upcoming-date">
						<b>!</b><span>LATE</span><small>逾期</small>
					</div>
					<div class="upcoming-day-tasks">
						<SingleTaskInProject
							v-for="task in overdueTasks"
							:key="task.id"
							print-row
							hide-print-time
							:show-project="true"
							:the-task="task"
							:can-mark-as-done="(projectList.projects[task.project_id]?.max_permission ?? 0) > PERMISSIONS.READ"
							@taskUpdated="updateTasks"
						/>
					</div>
				</section>
				<section
					v-for="day in upcomingDays"
					:key="day.key"
					class="upcoming-day"
					:class="{'is-today': day.key === upcomingToday}"
				>
					<div class="upcoming-date">
						<b>{{ day.date.getDate() }}</b><span>{{ day.date.toLocaleDateString('en-US', {weekday:'short'}).toUpperCase() }}</span><small v-if="day.key === upcomingToday">今天</small>
					</div>
					<div class="upcoming-day-tasks">
						<SingleTaskInProject
							v-for="task in day.tasks"
							:key="task.id"
							print-row
							hide-print-time
							:show-project="true"
							:the-task="task"
							:can-mark-as-done="(projectList.projects[task.project_id]?.max_permission ?? 0) > PERMISSIONS.READ"
							@taskUpdated="updateTasks"
						/>
						<p
							v-if="!day.tasks.length"
							class="print-empty"
						>
							{{ loading ? '載入中…' : '這天沒有安排' }}
						</p>
					</div>
				</section>
			</section>
			<aside class="print-upcoming-aside">
				<section class="print-sheet">
					<header class="print-plain-heading">
						<h2>LOAD 這週的份量</h2><span>每天幾件</span>
					</header><div class="upcoming-load">
						<div
							v-for="day in upcomingDays.slice(0,7)"
							:key="day.key"
						>
							<b>{{ day.tasks.length }}</b><i :style="{height: `${Math.max(3, day.tasks.length / maxDayLoad * 90)}px`}" /><span>{{ day.date.toLocaleDateString('zh-TW',{weekday:'narrow'}) }}</span>
						</div>
					</div>
				</section>
				<section class="print-sheet">
					<header class="print-plain-heading">
						<h2>SOMEDAY 沒有日期</h2><span>{{ undatedTasks.length }} 件</span>
					</header><SingleTaskInProject
						v-for="task in undatedTasks"
						:key="task.id"
						print-row
						hide-print-time
						:show-project="true"
						:the-task="task"
						:can-mark-as-done="(projectList.projects[task.project_id]?.max_permission ?? 0) > PERMISSIONS.READ"
						@taskUpdated="updateTasks"
					/><p
						v-if="!undatedTasks.length"
						class="print-empty"
					>
						{{ showNulls ? '沒有未排程的任務' : '目前範圍未顯示未排程任務' }}
					</p>
				</section>
			</aside>
		</div>
		<Card
			v-else-if="hasTasks"
			:padding="false"
			class="has-overflow"
			:has-content="false"
			:loading="loading"
		>
			<ul class="p-2 tasks">
				<li
					v-for="task in tasks"
					:key="task.id"
				>
					<SingleTaskInProject
						:show-project="true"
						:the-task="task"
						:can-mark-as-done="(projectList.projects[task.project_id]?.max_permission ?? 0) > PERMISSIONS.READ"
						:can-delete="(projectList.projects[task.project_id]?.max_permission ?? 0) > PERMISSIONS.READ"
						@taskUpdated="updateTasks"
					/>
				</li>
			</ul>
		</Card>
		<div
			v-else
			:class="{ 'is-loading': showLoading}"
			class="spinner"
		/>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, watch, watchEffect} from 'vue'
import {useI18n} from 'vue-i18n'
import dayjs from 'dayjs'

import {formatDate} from '@/helpers/time/formatDate'
import {setTitle} from '@/helpers/setTitle'

import BaseButton from '@/components/base/BaseButton.vue'
import Icon from '@/components/misc/Icon'
import Message from '@/components/misc/Message.vue'
import SingleTaskInProject from '@/components/tasks/partials/SingleTaskInProject.vue'
import XLabel from '@/components/tasks/partials/Label.vue'
import {DATE_RANGES} from '@/components/date/dateRanges'
import LlamaCool from '@/assets/llama-cool.svg?component'
import {useAuthStore} from '@/stores/auth'
import {useProjects} from '@/composables/useProjects'
import {useLabels} from '@/composables/useLabels'
import type {TaskFilterParams} from '@/client/queries/tasks'
import {useTasks} from '@/composables/useTasks'
import {useDelayedLoading} from '@/composables/useDelayedLoading'
import type {TaskScope} from '@/client/queries/tasks'
import {PERMISSIONS} from '@/constants/permissions'

const props = withDefaults(defineProps<{
	dateFrom?: Date | string,
	dateTo?: Date | string,
	showNulls?: boolean,
	showOverdue?: boolean,
	labelIds?: string[],
	embedded?: boolean,
}>(), {
	showNulls: false,
	showOverdue: false,
	dateFrom: undefined,
	dateTo: undefined,
	labelIds: undefined,
	embedded: false,
})

const emit = defineEmits<{
	'tasksLoaded': [loaded: true],
	'clearLabelFilter': [],
	'summary': [count: number],
}>()

const authStore = useAuthStore()
const projectList = useProjects()
const {getLabelById} = useLabels()

const {t} = useI18n({useScope: 'global'})

const taskScope = ref<TaskScope | null>(null)
const taskQuery = useTasks(
	() => taskScope.value ?? {},
	{enabled: () => authStore.authenticated && taskScope.value !== null},
)
const tasks = taskQuery.tasks
function localDay(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const upcomingToday = computed(() => localDay(new Date()))
function upcomingRangeDate(value: Date | string | undefined, fallback: Date): Date {
	if (value instanceof Date) return new Date(value.getTime())
	if (!value) return fallback
	if (!value.startsWith('now')) {
		const parsed = new Date(value)
		return Number.isNaN(parsed.getTime()) ? fallback : parsed
	}
	const suffix = value.slice(3)
	const operations = [...suffix.matchAll(/([+-]\d+)([smhdwMy])|\/([smhdwMy])/g)]
	if (operations.map(operation => operation[0]).join('') !== suffix) return fallback
	const units = {s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week', M: 'month', y: 'year'} as const
	let parsed = dayjs()
	for (const operation of operations) {
		const unit = (operation[2] || operation[3]) as keyof typeof units
		parsed = operation[1] ? parsed.add(Number(operation[1]), units[unit])
			: unit === 'w' ? parsed.startOf('day').subtract((parsed.day() + 6) % 7, 'day') : parsed.startOf(units[unit])
	}
	return parsed.toDate()
}
const undatedTasks = computed(() => (tasks.value ?? []).filter(task => !task.due_date || new Date(task.due_date).getFullYear() <= 1))
const overdueTasks = computed(() => (tasks.value ?? []).filter(task => task.due_date && new Date(task.due_date).getFullYear() > 1 && localDay(new Date(task.due_date)) < upcomingToday.value))
const upcomingDays = computed(() => {
	const start = upcomingRangeDate(props.dateFrom, new Date())
	start.setHours(0, 0, 0, 0)
	const fallbackEnd = new Date(start)
	fallbackEnd.setDate(fallbackEnd.getDate() + 7)
	const parsedEnd = upcomingRangeDate(props.dateTo, fallbackEnd)
	const length = Math.max(1, Math.min(365, dayjs(parsedEnd).startOf('day').diff(dayjs(start), 'day')))
	const days = new Map<string, {key: string, date: Date, tasks: typeof tasks.value}>()
	for (let i = 0; i < length; i++) {
		const date = new Date(start)
		date.setDate(date.getDate() + i)
		days.set(localDay(date), {key: localDay(date), date, tasks: []})
	}
	for (const task of tasks.value ?? []) {
		const date = task.due_date ? new Date(task.due_date) : null
		if (!date || date.getFullYear() <= 1 || localDay(date) < upcomingToday.value) continue
		const key = localDay(date)
		if (!days.has(key)) days.set(key, {key, date, tasks: []})
		days.get(key)!.tasks.push(task)
	}
	return [...days.values()].sort((a, b) => a.key.localeCompare(b.key))
})
const datedTaskCount = computed(() => upcomingDays.value.reduce((total, day) => total + day.tasks.length, overdueTasks.value.length))
const maxDayLoad = computed(() => Math.max(1, ...upcomingDays.value.slice(0, 7).map(day => day.tasks.length)))
const embeddedGroups = computed(() => {
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const tomorrow = new Date(today)
	tomorrow.setDate(tomorrow.getDate() + 1)
	const groups = [
		{title: '已逾期', tasks: [] as typeof tasks.value, collapsed: false},
		{title: '今天', tasks: [] as typeof tasks.value, collapsed: false},
		{title: '接下來', tasks: [] as typeof tasks.value, collapsed: true},
		{title: '未排程', tasks: [] as typeof tasks.value, collapsed: true},
	]
	for (const task of tasks.value ?? []) {
		const date = task.due_date ? new Date(task.due_date) : null
		const index = !date || date.getFullYear() <= 1 ? 3 : date < today ? 0 : date < tomorrow ? 1 : 2
		groups[index].tasks.push(task)
	}
	for (const group of groups) {
		group.tasks.sort((a, b) => printDayKey(a).localeCompare(printDayKey(b)))
	}
	return groups
})
// Keep dates together while retaining the API order (and individual times) within each day.
function printDayKey(task: (typeof tasks.value)[number]): string {
	const due = task.due_date ? new Date(task.due_date) : null
	const date = due && due.getFullYear() > 1 ? due : task.start_date ? new Date(task.start_date) : null
	if (!date || date.getFullYear() <= 1) return ''
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function hideRepeatedPrintDate(items: typeof tasks.value, index: number): boolean {
	if (index === 0) return false
	const key = printDayKey(items[index])
	const today = new Date()
	const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
	return key !== todayKey && key === printDayKey(items[index - 1])
}
watch(tasks, items => emit('summary', items?.length ?? 0), {immediate: true})
const showNothingToDo = ref<boolean>(false)


setTimeout(() => showNothingToDo.value = true, 100)

const showAll = computed(() => typeof props.dateFrom === 'undefined' || typeof props.dateTo === 'undefined')

const filteredLabels = computed(() => {
	if (!props.labelIds || props.labelIds.length === 0) {
		return []
	}
	return props.labelIds
		.map(id => getLabelById(Number(id)))
		.filter(label => label !== null && label !== undefined)
})

const savedFilterIgnored = computed(() => {
	return filteredLabels.value.length > 0
		&& filterIdUsedOnOverview.value
		&& typeof projectList.projects[filterIdUsedOnOverview.value] !== 'undefined'
})

const pageTitle = computed(() => {
	// We need to define "key" because it is the first parameter in the array and we need the second
	const predefinedRange = Object.entries(DATE_RANGES)
		.find(([, value]) => props.dateFrom === value[0] && props.dateTo === value[1])
		?.[0]
	if (typeof predefinedRange !== 'undefined') {
		return t(`input.datepickerRange.ranges.${predefinedRange}`)
	}

	return showAll.value
		? t('task.show.titleCurrent')
		: t('task.show.fromuntil', {
			from: formatDate(props.dateFrom, 'LL'),
			until: formatDate(props.dateTo, 'LL'),
		})
})
const hasTasks = computed(() => tasks.value && tasks.value.length > 0)
const userAuthenticated = computed(() => authStore.authenticated)
const loading = taskQuery.isFetching
const showLoading = useDelayedLoading(loading)
const filterIdUsedOnOverview = computed(() => authStore.settings?.frontend_settings?.filter_id_used_on_overview)

function clearLabelFilter() {
	emit('clearLabelFilter')
}

async function loadPendingTasks(from: Date|string|undefined, to: Date|string|undefined, filterId: number | null | undefined) {
	// FIXME: HACK! This should never happen.
	// Since this route is authentication only, users would get an error message if they access the page unauthenticated.
	// Since this component is mounted as the home page before unauthenticated users get redirected
	// to the login page, they will almost always see the error message.
	if (!userAuthenticated.value) {
		return
	}

	const params: TaskFilterParams = {
		sort_by: ['due_date', 'id'],
		order_by: ['asc', 'desc'],
		filter: 'done = false',
		filter_include_nulls: props.showNulls,
		q: '',
		expand: ['comment_count', 'is_unread'],
	}

	if (!showAll.value) {

		params.filter += ` && due_date < '${to instanceof Date ? to.toISOString() : to}'`

		// NOTE: Ideally we could also show tasks with a start or end date in the specified range, but the api
		//       is not capable (yet) of combining multiple filters with 'and' and 'or'.

		if (!props.showOverdue) {
			params.filter += ` && due_date > '${from instanceof Date ? from.toISOString() : from}'`
		}
	}

	// Add label filtering
	if (props.labelIds && props.labelIds.length > 0) {
		const labelFilter = `labels in ${props.labelIds.join(', ')}`
		params.filter += params.filter ? ` && ${labelFilter}` : labelFilter
	}

	let projectId = null
	if (showAll.value && filterId && typeof projectList.projects[filterId] !== 'undefined'
		&& (!props.labelIds || props.labelIds.length === 0)) {
		projectId = filterId
	}

	taskScope.value = {project: projectId, params: {...params, filter_timezone: authStore.settings.timezone}}
}

watch(taskQuery.data, data => { if (data) emit('tasksLoaded', true) })

function updateTasks() { return taskQuery.refetch() }

// Keep sidebar setting changes from reloading tasks.
watch(
	[
		() => props.dateFrom,
		() => props.dateTo,
		filterIdUsedOnOverview,
		() => props.showOverdue,
		() => props.showNulls,
		() => props.labelIds,
	],
	([from, to, filterId]) => loadPendingTasks(from, to, filterId),
	{immediate: true},
)
watchEffect(() => setTitle(pageTitle.value))
</script>

<style lang="scss" scoped>
.tasks {
	list-style: none;
	margin: 0;
}


.llama-cool {
	margin: 3rem auto 0;
	display: block;
}

.label-filter-info {
	margin-block-end: 1rem;
	
	.clear-filter-button {
		margin-inline-start: auto;
		padding: 0.25rem 0.5rem;
		
		&:hover {
			color: var(--danger);
		}
	}

	:deep(.message.info) {
		inline-size: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
}
</style>
