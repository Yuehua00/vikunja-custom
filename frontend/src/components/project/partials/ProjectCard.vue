<template>
	<div
		class="project-card print-overview-card"
		:class="{
			'has-light-text': Boolean(background),
			'has-background': Boolean(blurHashUrl || background),
			'is-saved-filter': project.id < -1,
			'is-favorite-project': project.id === -1,
		}"
		:style="{
			'--project-accent': project.hex_color || (project.id < 0 ? 'var(--primary)' : 'var(--print-blue)'),
		}"
	>
		<svg
			class="project-card-paper"
			viewBox="0 0 340 250"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<path d="M24 5 Q170 -2 316 6 Q336 6 336 28 Q342 125 335 224 Q335 244 313 244 Q170 251 25 244 Q5 244 5 222 Q-1 125 5 28 Q5 5 24 5Z" />
		</svg>
		<div
			class="project-background background-fade-in"
			:class="{'is-visible': background}"
			:style="{'background-image': (background || blurHashUrl) ? `url(${background || blurHashUrl})` : undefined}"
		/>
		<div class="project-card-heading">
			<h3
				class="project-title"
			>
				<span
					v-if="project.id < -1"
					class="saved-filter-icon icon"
				>
					<Icon icon="filter" />
				</span>
				{{ getProjectTitle(project) }}
			</h3>
			<span
				v-if="project.is_archived"
				class="project-kind"
			>{{ $t('project.archived') }}</span>
			<span
				v-else-if="project.id < -1"
				class="project-kind"
			>篩選</span>
		</div>
		<p
			v-if="textOnlyDescription && project.id !== -1"
			class="project-card-description"
		>
			{{ textOnlyDescription }}
		</p>
		<div
			v-if="project.id > 0"
			class="project-card-metrics"
			:aria-busy="taskQuery.isPending.value"
		>
			<svg
				viewBox="0 0 64 64"
				class="project-progress-ring"
				role="img"
				:aria-label="statsReady ? `完成 ${stats.percent}%` : taskQuery.isError.value ? '完成比例讀取失敗' : '完成比例載入中'"
			>
				<circle
					class="ring-track"
					cx="32"
					cy="32"
					r="25"
					fill="none"
					stroke-width="7"
				/>
				<circle
					class="ring-value"
					cx="32"
					cy="32"
					r="25"
					fill="none"
					stroke-width="7"
					pathLength="100"
					:stroke-dasharray="`${statsReady ? stats.percent : 0} 100`"
					transform="rotate(-90 32 32)"
				/>
				<text
					x="32"
					y="37"
					text-anchor="middle"
				>{{ statsReady ? `${stats.percent}%` : '—' }}</text>
			</svg>
			<div class="project-completion-count">
				<template v-if="statsReady">
					<strong>{{ stats.done }}</strong> / {{ stats.total }}<span>件完成</span>
				</template>
				<span v-else>{{ taskQuery.isError.value ? '暫時無法讀取統計' : '載入進度…' }}</span>
			</div>
		</div>
		<p
			v-else
			class="project-filter-summary"
		>
			{{ project.id === -1 ? '收藏的任務，集中在這裡。' : '依儲存的篩選條件，查看相關任務。' }}
		</p>
		<div class="project-card-next">
			<span class="project-next-label">{{ project.is_archived ? 'ARCHIVED' : project.id > 0 ? 'NEXT' : 'VIEW' }}</span>
			<span v-if="project.is_archived">檢視已封存專案</span>
			<span v-else-if="project.id < 0">{{ project.id === -1 ? '開啟收藏任務' : '開啟篩選結果' }}</span>
			<template v-else-if="statsReady">
				<span
					v-if="nextTask"
					class="project-next-task"
				>{{ nextTask.title }}<span class="project-next-date">・{{ nextDate }}</span></span>
				<span v-else>{{ stats.total ? '所有任務已完成' : '新增第一個任務' }}</span>
			</template>
			<span v-else>{{ taskQuery.isError.value ? '開啟專案查看任務' : '載入任務…' }}</span>
		</div>
		<BaseButton
			class="project-button"
			:aria-label="getProjectTitle(project)"
			:title="textOnlyDescription"
			:to="{
				name: 'project.index',
				params: { projectId: project.id}
			}"
		/>
		<BaseButton
			v-if="!project.is_archived && project.id > -1"
			class="favorite"
			:aria-label="project.is_favorite ? $t('project.unfavorite') : $t('project.favorite')"
			:class="{'is-favorite': project.is_favorite}"
			:aria-pressed="project.is_favorite"
			@click.prevent.stop="toggleProjectFavorite"
		>
			<Icon :icon="project.is_favorite ? 'star' : ['far', 'star']" />
		</BaseButton>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue'
import {useQuery} from '@tanstack/vue-query'
import {allTasksQuery} from '@/client/queries/tasks'
import {usePatchProjectFavoriteMutation, type ProjectResponse} from '@/client/queries/projects'

import BaseButton from '@/components/base/BaseButton.vue'

import {useProjectBackground} from '@/composables/useProjectBackground'
import {getProjectTitle} from '@/helpers/getProjectTitle'
import {parseDateOrNull} from '@/helpers/parseDateOrNull'
import {formatDate} from '@/helpers/time/formatDate'

const props = defineProps<{
	project: ProjectResponse,
}>()

const {background, blurHashUrl} = useProjectBackground(() => props.project)

const favoriteMutation = usePatchProjectFavoriteMutation()
const taskQuery = useQuery(computed(() => ({
	...allTasksQuery({project: props.project.id, params: {filter: 'done = true || done = false'}}),
	enabled: props.project.id > 0,
	staleTime: 60_000,
})))
const statsReady = computed(() => props.project.id > 0 && taskQuery.isSuccess.value)
const stats = computed(() => {
	const items = taskQuery.data.value ?? []
	const done = items.filter(task => task.done).length
	return {total: items.length, done, percent: items.length ? Math.round(done / items.length * 100) : 0}
})
const nextTask = computed(() => {
	return (taskQuery.data.value ?? []).filter(task => !task.done).sort((a, b) => {
		const aDate = parseDateOrNull(a.due_date)?.getTime() ?? Infinity
		const bDate = parseDateOrNull(b.due_date)?.getTime() ?? Infinity
		if (aDate !== bDate) return aDate < bDate ? -1 : 1
		return a.position - b.position || a.id - b.id
	})[0] ?? null
})
const nextDate = computed(() => {
	const date = parseDateOrNull(nextTask.value?.due_date)
	return date ? formatDate(date, date.getHours() || date.getMinutes() ? 'M/D HH:mm' : 'M/D') : '未排日期'
})

async function toggleProjectFavorite() {
	if (props.project.id <= 0 || props.project.is_archived) {
		return
	}
	await favoriteMutation.mutateAsync({id: props.project.id, isFavorite: !props.project.is_favorite})
}

const textOnlyDescription = computed(() => {
	return props.project.description ? props.project.description.replace(/<[^>]*>/g, '') : ''
})
</script>

<style lang="scss" scoped>
.project-card {
	--project-card-padding: 1rem;
	background: var(--white);
	padding: var(--project-card-padding);
	border-radius: $radius;
	box-shadow: var(--shadow-sm);
	transition: box-shadow $transition;
	position: relative;
	overflow: hidden; // hide background

	display: flex;
	justify-content: space-between;
	flex-wrap: wrap;

	&:hover {
		box-shadow: var(--shadow-md);
	}

	&:active,
	&:focus {
		box-shadow: var(--shadow-xs) !important;
	}

	> * {
		// so the elements are on top of the background
		position: relative;
	}
}

.has-background,
.project-background {
	background-size: cover;
	background-repeat: no-repeat;
	background-position: center;
}

.project-background,
.project-button {
	position: absolute;
	inset-block-start: 0;
	inset-inline-end: 0;
	inset-block-end: 0;
	inset-inline-start: 0;
}

.is-archived {
	font-size: .75rem;
	float: inline-start;
}

.project-title {
	align-self: flex-end;
	font-family: $vikunja-font;
	font-weight: 400;
	font-size: 1.5rem;
	line-height: var(--title-line-height);
	color: var(--text);
	inline-size: 100%;
	margin-block-end: 0;
	max-block-size: calc(100% - (var(--project-card-padding) + 1rem)); // padding & height of the "is archived" badge
	overflow: hidden;
	text-overflow: ellipsis;
	word-break: break-word;

	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
}

.has-light-text .project-title {
	color: var(--grey-100);
}

.has-background .project-title {
	text-shadow:
		0 0 10px var(--black),
		1px 1px 5px var(--grey-700),
		-1px -1px 5px var(--grey-700);
	color: var(--white);
}

.favorite {
	position: absolute;
	inset-block-start: var(--project-card-padding);
	inset-inline-end: var(--project-card-padding);
	transition: opacity $transition, color $transition;
	opacity: 1;

	&:hover {
		color: var(--warning);
	}

	&.is-favorite {
		display: inline-block;
		opacity: 1;
		color: var(--warning);
	}
}

@media(hover: hover) and (pointer: fine) {
	.project-card .favorite {
		opacity: 0;
	}

	.project-card:hover .favorite {
		opacity: 1;
	}
}

.background-fade-in {
  opacity: 0;
  transition: opacity $transition;
  transition-delay: $transition-duration * 2; // To fake an appearing background

  &.is-visible {
    opacity: 1;
  }
}

.saved-filter-icon {
	color: var(--grey-300);
	font-size: .75em;
}
</style>
