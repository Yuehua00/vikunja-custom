<template>
	<div class="home-print content">
		<header class="home-hero">
			<p class="home-date">
				{{ dateLabel }}
			</p>
			<h1
				v-if="salutation"
				class="home-hello"
			>
				<template
					v-for="(part, index) in salutationParts"
					:key="index"
				>
					<span
						v-if="part.isName"
						class="home-name"
					>{{ part.text }}</span>
					<template v-else>
						{{ part.text }}
					</template>
				</template>
			</h1>
		</header>

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

		<div class="home-grid">
			<div class="home-main">
				<section class="home-panel home-today">
					<h2 class="home-bar">
						{{ $t('habits.title') }}
					</h2>
					<AddTask
						class="home-add"
						@tasksAdded="updateTaskKey"
					/>
					<ImportHint v-if="tasksLoaded" />
					<ShowTasks
						v-if="projectList.hasProjects"
						:key="showTasksKey"
						:label-ids="labelIds"
						class="home-tasks"
						@tasksLoaded="tasksLoaded = true"
						@clearLabelFilter="handleClearLabelFilter"
					/>
				</section>

				<section
					v-if="projectList.hasProjects"
					class="home-panel"
				>
					<h2 class="home-bar">
						{{ $t('calendar.title') }}
					</h2>
					<div class="home-calendar">
						<CalendarView />
					</div>
				</section>
			</div>

			<aside class="home-side">
				<section class="home-panel home-focus">
					<div class="home-side-head">
						<h2 class="home-sec">
							{{ $t('focus.title') }}
						</h2>
						<span class="home-muted">{{ $t('focus.todayDuration') }}</span>
					</div>
					<p class="home-focus-time">
						{{ formatDuration(focusStats.todaySeconds) }}
						<small>· {{ focusStats.todayPomos }} × {{ $t('focus.pomo') }}</small>
					</p>
					<RouterLink
						:to="{name: 'focus'}"
						class="home-outline-button"
					>
						{{ $t('focus.start') }}
					</RouterLink>
				</section>
				<TodayOverview class="home-panel" />
				<MoodJar class="home-panel" />
			</aside>
		</div>
	</div>
</template>

<script lang="ts" setup>
import {ref, computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'

import Message from '@/components/misc/Message.vue'
import ShowTasks from '@/views/tasks/ShowTasks.vue'
import TodayOverview from '@/components/home/TodayOverview.vue'
import AddTask from '@/components/tasks/AddTask.vue'
import ImportHint from '@/components/home/ImportHint.vue'
import CalendarView from '@/components/calendar/CalendarView.vue'
import MoodJar from '@/components/home/MoodJar.vue'

import {useFocusTimer} from '@/composables/useFocusTimer'
import {computeStats, formatDuration} from '@/helpers/focus'

import {parseDateOrNull} from '@/helpers/parseDateOrNull'
import {formatDateSince, formatDisplayDate} from '@/helpers/time/formatDate'
import {useDaytimeSalutation} from '@/composables/useDaytimeSalutation'

import {useProjects} from '@/composables/useProjects'
import {useAuthStore} from '@/stores/auth'

const salutation = useDaytimeSalutation()
const authStore = useAuthStore()
const {locale} = useI18n({useScope: 'global'})

// The greeting with the user's name picked out, so the name can be printed in orange.
const salutationParts = computed(() => {
	const text = salutation.value ?? ''
	const name = authStore.userDisplayName
	const at = name ? text.indexOf(name) : -1
	if (at === -1) {
		return [{text, isName: false}]
	}
	return [
		{text: text.slice(0, at), isName: false},
		{text: name, isName: true},
		{text: text.slice(at + name.length), isName: false},
	].filter(part => part.text !== '')
})

// "FRI · 10.24" above the greeting.
const dateLabel = computed(() => {
	const now = new Date()
	const weekday = new Intl.DateTimeFormat(locale.value, {weekday: 'short'}).format(now)
	return `${weekday} · ${now.getMonth() + 1}.${String(now.getDate()).padStart(2, '0')}`
})

const {records: focusRecords} = useFocusTimer()
const focusStats = computed(() => computeStats(focusRecords.value, new Date()))

const projectList = useProjects()
const route = useRoute()
const router = useRouter()

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
// Print style home: greeting on top, today and the calendar on the left, focus, habits and the mood jar on the right.
.home-print {
	max-inline-size: 76rem;
	margin-inline: auto;
	text-align: start;
}

.home-hero {
	padding-block-end: 1rem;
	margin-block-end: 1.5rem;
	border-block-end: 3px solid var(--primary);
}

.home-date {
	margin: 0 0 .2rem;
	font-family: $display-font;
	font-weight: 700;
	letter-spacing: .16em;
	font-size: .9rem;
	color: var(--print-blue);
	text-transform: uppercase;
}

.home-hello,
.content .home-hello {
	margin: 0;
	font-size: 2.6rem;
	font-weight: 900 !important;
	line-height: 1.15;
	color: var(--text-strong);
}

.home-name {
	color: var(--print-orange-text);
	font-family: $display-font;
	letter-spacing: .01em;
}

.home-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 19rem;
	gap: 1.5rem;
	align-items: start;

	@media screen and (max-width: $desktop) {
		grid-template-columns: minmax(0, 1fr);
	}
}

.home-main,
.home-side {
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
	min-inline-size: 0;
}

.home-panel {
	background: var(--white);
	border-radius: $radius;
}

// The deep green bar a big panel starts with.
.home-bar,
.content .home-bar {
	margin: 0;
	padding: .7rem 1.25rem;
	background: var(--primary);
	color: #ffffff;
	font-family: $display-font;
	font-size: .95rem;
	font-weight: 700 !important;
	letter-spacing: .14em;
	border-radius: $radius $radius 0 0;
}

.home-add {
	padding: .9rem 1.25rem;
	background: var(--print-orange-tint);
}

// The task list on the home page lives inside the panel: no own title or card around it.
.home-tasks {
	:deep(.page-title) {
		display: none;
	}

	:deep(.card) {
		margin: 0;
		background: transparent;
	}
}

.home-calendar {
	padding: 1rem 1.25rem 1.25rem;
}

.home-side .home-panel {
	padding: 1rem 1.25rem;
}

.home-side-head {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
}

// Small spaced-out green headings of the side panels.
.home-sec,
.home-side :deep(h2) {
	margin: 0;
	font-family: $display-font;
	font-size: .95rem;
	font-weight: 700 !important;
	letter-spacing: .14em;
	color: var(--primary);
}

.home-muted {
	font-size: .8rem;
	color: var(--text-muted);
}

.home-focus-time {
	margin: .4rem 0 .8rem;
	font-family: $display-font;
	font-weight: 700;
	font-size: 2.4rem;
	line-height: 1;
	color: var(--primary);

	small {
		font-size: 1rem;
		color: var(--text-muted);
	}
}

.home-outline-button {
	display: flex;
	justify-content: center;
	align-items: center;
	min-block-size: 38px;
	border: 2px solid var(--primary);
	border-radius: $radius;
	color: var(--primary);
	font-weight: 800;
	font-size: .88rem;

	&:hover {
		background: var(--print-orange-tint);
		color: var(--primary);
	}
}
</style>
