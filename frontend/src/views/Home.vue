<template>
	<div class="content home-page">
		<section
			v-if="salutation"
			class="home-greeting"
		>
			<p class="print-label home-date">
				{{ dateLabel }}
			</p>
			<h1 class="home-title">
				{{ salutationParts.before }}<span
					v-if="salutationParts.name"
					class="home-name"
				>{{ salutationParts.name }}</span>{{ salutationParts.after }}
			</h1>
		</section>

		<Message
			v-if="deletionScheduledAt !== null"
			variant="danger"
			class="mbe-4"
		>
			{{
				$t('user.deletion.scheduled', {
					date: formatDisplayDate(deletionScheduledAt),
					dateSince: formatDateSince(deletionScheduledAt),
				})
			}}
			<RouterLink :to="{name: 'user.settings.deletion'}">
				{{ $t('user.deletion.scheduledCancel') }}
			</RouterLink>
		</Message>
		<div class="home-columns">
			<div class="home-main">
				<section class="print-paper home-today">
					<header class="print-bar">
						<h2 class="print-bar-title">
							TODAY <span>今天</span>
						</h2>
						<span class="home-task-count">{{ taskCount }} 件待辦</span>
					</header>
					<div class="home-add">
						<AddTask @tasksAdded="updateTaskKey" />
					</div>
					<ImportHint v-if="tasksLoaded" />
					<ShowTasks
						v-if="projectList.hasProjects"
						:key="showTasksKey"
						:label-ids="labelIds"
						embedded
						class="show-tasks"
						@tasksLoaded="tasksLoaded = true"
						@summary="taskCount = $event"
						@clearLabelFilter="handleClearLabelFilter"
					/>
				</section>
				<section
					v-if="projectList.hasProjects"
					class="print-paper home-calendar-paper"
				>
					<div class="home-calendar">
						<CalendarView print-header />
					</div>
				</section>
			</div>
			<aside class="home-side">
				<HomeInsights section="focus" />
				<TodayOverview class="has-text-start" />
				<MoodJar class="has-text-start" />
				<HomeInsights section="next" />
			</aside>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {ref, computed} from 'vue'
import {useRoute, useRouter} from 'vue-router'

import Message from '@/components/misc/Message.vue'
import ShowTasks from '@/views/tasks/ShowTasks.vue'
import TodayOverview from '@/components/home/TodayOverview.vue'
import AddTask from '@/components/tasks/AddTask.vue'
import ImportHint from '@/components/home/ImportHint.vue'
import CalendarView from '@/components/calendar/CalendarView.vue'
import HomeInsights from '@/components/home/HomeInsights.vue'
import MoodJar from '@/components/home/MoodJar.vue'

import {parseDateOrNull} from '@/helpers/parseDateOrNull'
import {formatDateSince, formatDisplayDate} from '@/helpers/time/formatDate'
import {useDaytimeSalutation} from '@/composables/useDaytimeSalutation'

import {useProjects} from '@/composables/useProjects'
import {useAuthStore} from '@/stores/auth'

const salutation = useDaytimeSalutation()

const authStore = useAuthStore()
const projectList = useProjects()
const route = useRoute()
const router = useRouter()

// The salutation is one translated sentence with the name inside it; split it around the name so
// the name alone can be colored. Falls back to the plain sentence when the name is not found.
const salutationParts = computed(() => {
	const text = salutation.value ?? ''
	const name = authStore.userDisplayName
	const at = name ? text.indexOf(name) : -1
	if (!name || at === -1) {
		return {before: text, name: '', after: ''}
	}
	return {before: text.slice(0, at), name, after: text.slice(at + name.length)}
})

// Small label above the greeting, like "FRI・10.23".
const dateLabel = computed(() => {
	const now = new Date()
	const weekday = new Intl.DateTimeFormat('en-US', {weekday: 'short'}).format(now).toUpperCase()
	return `${weekday}・${now.getMonth() + 1}.${now.getDate()}`
})

const taskCount = ref(0)
const tasksLoaded = ref(false)

const deletionScheduledAt = computed(() => parseDateOrNull(authStore.info?.deletion_scheduled_at))

// Extract label IDs from query parameter
const labelIds = computed(() => {
	const labelsParam = route.query.labels
	if (!labelsParam) {
		return undefined
	}
	return Array.isArray(labelsParam) ? labelsParam.filter((id): id is string => id !== null) : [labelsParam]
})

// This is to reload the tasks list after adding a new task through the global task add.
// FIXME: Should use pinia (somehow?)
const showTasksKey = ref(0)

function updateTaskKey() {
	showTasksKey.value++
}

function handleClearLabelFilter() {
	const query = {...route.query}
	delete query.labels
	router.push({
		name: route.name as string,
		query,
	})
}
</script>

<style scoped lang="scss">
.home-page {
	max-inline-size: 68rem;
	margin-inline: auto;
	text-align: start;
}

// Greeting: small date label, big title, and a thick green rule underneath.
.home-greeting {
	padding-block: .5rem 1.1rem;
	margin-block-end: 1.5rem;
	border-block-end: 3px solid var(--primary);
}

.home-date {
	margin: 0 0 .2rem;
	font-size: .9rem;
}

.home-title {
	margin: 0 !important;
	font-size: 2.6rem;
	font-weight: 800;
	line-height: 1.1;
	color: var(--text-strong);
}

.home-name {
	color: var(--print-orange-text);
}

// Main column and a narrower side column; the side column drops below on narrow screens.
.home-columns {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	gap: 1.5rem;
}

.home-main {
	flex: 999 1 400px;
	min-inline-size: 0;
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
}

.home-side {
	flex: 1 1 260px;
	min-inline-size: 0;
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
}

.home-calendar {
	padding: 0;
}

.home-add {
	padding: 1rem 1.25rem;
	background: var(--print-orange-tint);
}

.show-tasks {
	padding: 0;
}

@media (width <= 600px) {
	.home-title {
	font-size: 2rem;
}
	.home-columns {
	gap: 1rem;
}
	.home-main, .home-side {
	flex-basis: 100%;
}
}
</style>
