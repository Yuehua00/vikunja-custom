<template>
	<div
		class="loader-container print-project-page"
		:class="{
			'is-loading': isLoadingProject,
			'is-archived': currentProject.is_archived,
		}"
	>
		<h1 class="project-title-print">
			{{ getProjectTitle(currentProject) }}
		</h1>

		<div class="project-header-layout d-print-none">
			<div class="project-heading">
				<div class="project-heading-copy">
					<p class="print-label project-eyebrow">
						PROJECT・專案
					</p>
					<div class="project-heading-line">
						<h1 class="page-title project-heading-title">
							{{ currentProject.title === '' ? $t('misc.loading') : getProjectTitle(currentProject) }}
						</h1>
						<slot name="summary" />
					</div>
				</div>

				<BaseButton
					v-if="!isEditorContentEmpty(currentProject.description)"
					:to="{ name: 'project.info', params: { projectId: currentProject.id } }"
					class="project-heading-button"
				>
					<span class="is-sr-only">{{ $t('project.description') }}</span>
					<Icon icon="circle-info" />
				</BaseButton>

				<ProjectSettingsDropdown
					v-if="canWriteProject && currentProject.id !== -1"
					:project="currentProject"
				>
					<template #trigger="{ toggleOpen, open }">
						<BaseButton
							class="project-heading-button"
							:aria-expanded="open"
							@click="toggleOpen"
						>
							<span class="is-sr-only">{{ $t('project.openSettingsMenu') }}</span>
							<Icon icon="ellipsis-h" />
						</BaseButton>
					</template>
				</ProjectSettingsDropdown>
			</div>

			<div
				class="switch-view-container d-print-none"
			>
				<nav
					v-if="views.length"
					class="switch-view"
					aria-label="專案檢視"
				>
					<BaseButton
						v-for="view in views"
						:key="view.id"
						class="switch-view-button"
						:class="{'is-active': view.id === viewId}"
						:aria-current="view.id === viewId ? 'page' : undefined"
						:to="getViewRoute(view)"
					>
						{{ getViewTitle(view) }}
					</BaseButton>
				</nav>
				<slot name="header" />
			</div>
		</div>
		<CustomTransition name="fade">
			<Message
				v-if="currentProject.is_archived"
				variant="warning"
				class="mbe-4"
			>
				{{ $t('project.archivedMessage') }}
			</Message>
		</CustomTransition>

		<slot v-if="!isLoadingProject" />
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'

import BaseButton from '@/components/base/BaseButton.vue'
import ProjectSettingsDropdown from '@/components/project/ProjectSettingsDropdown.vue'
import Icon from '@/components/misc/Icon'
import Message from '@/components/misc/Message.vue'
import CustomTransition from '@/components/misc/CustomTransition.vue'

import {getProjectTitle} from '@/helpers/getProjectTitle'
import {isEditorContentEmpty} from '@/helpers/editorContentEmpty'
import {PERMISSIONS as Permissions} from '@/constants/permissions'
import {useTitle} from '@/composables/useTitle'

import {useViewFiltersStore} from '@/stores/viewFilters'
import {useCurrentProject} from '@/composables/useCurrentProject'

import type {ProjectView} from '@/client/generated'
import {normalizeProject} from '@/client/queries/projects'

const props = defineProps<{
	isLoadingProject: boolean,
	projectId: number,
	viewId: number,
}>()

const {t} = useI18n()

const viewFiltersStore = useViewFiltersStore()
const {currentProject: queriedProject} = useCurrentProject()

const currentProject = computed(() => queriedProject.value ?? normalizeProject({id: 0}))

const canWriteProject = computed(() =>
	currentProject.value.max_permission !== null &&
	currentProject.value.max_permission !== undefined &&
	currentProject.value.max_permission > Permissions.READ,
)
useTitle(() => currentProject.value?.id ? getProjectTitle(currentProject.value) : '')

const views = computed(() => currentProject.value.views)

function getViewTitle(view: ProjectView) {
	switch (view.title) {
		case 'List':
			return t('project.list.title')
		case 'Gantt':
			return t('project.gantt.title')
		case 'Table':
			return t('project.table.title')
		case 'Kanban':
			return t('project.kanban.title')
		case 'Calendar':
			return t('project.calendar.title')
		case 'Draw':
			return t('project.draw.title')
	}

	return view.title ?? ''
}

function getViewRoute(view: ProjectView) {
	const viewId = view.id ?? 0
	const storedQuery = viewFiltersStore.getViewQuery(viewId)
	return {
		name: 'project.view',
		params: {projectId: props.projectId, viewId},
		query: storedQuery,
	}
}
</script>

<style lang="scss" scoped>
.project-heading {
	display: flex;
	align-items: center;
	gap: .25rem;
	margin-block-end: 1rem;
}

.project-heading-title {
	margin: 0;
	min-inline-size: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.project-heading-button {
	display: flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 2.5rem;
	min-block-size: 2.5rem;
	color: var(--grey-400);
	font-size: 1.25rem;
}

.switch-view-container {
	position: relative;
	min-block-size: $switch-view-height;
	margin-block-end: 1rem;
	
	display: flex;
	justify-content: space-between;
	align-items: center;	
	gap: 1rem;
	
	@media screen and (max-width: $tablet) {
		justify-content: center;
		flex-direction: column;
	}
}

.switch-view {
	background: var(--white);
	display: inline-flex;
	border-radius: $radius;
	font-size: .75rem;
	box-shadow: var(--shadow-sm);
	padding: .5rem;
}

.switch-view-button {
	padding: .25rem .5rem;
	display: block;
	white-space: nowrap;
	border-radius: $radius;
	transition: all 100ms;

	&:not(:last-child) {
		margin-inline-end: .5rem;
	}

	&:hover {
		color: var(--switch-view-color);
		background: var(--switch-view-active-background);
	}

	&.is-active {
		color: var(--switch-view-color);
		background: var(--switch-view-active-background);
		font-weight: bold;
		box-shadow: var(--shadow-xs);
	}
}

// FIXME: this should be in notification and set via a prop
.is-archived .notification.is-warning {
	margin-block-end: 1rem;
}

.project-title-print {
	display: none;
	font-size: 1.75rem;
	text-align: center;
	margin-block-end: .5rem;

	@media print {
		display: block;
	}
}
</style>
