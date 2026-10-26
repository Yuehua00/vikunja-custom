<template>
	<div
		v-cy="'projects-list'"
		class="content loader-container print-projects-overview"
		:class="{'is-loading': loading}"
	>
		<header class="project-header projects-overview-header">
			<div class="projects-overview-heading">
				<p class="print-label">
					PROJECTS・{{ activeProjectCount }} 個進行中
				</p>
				<h1 class="projects-overview-title">
					{{ $t('project.projects') }}
				</h1>
			</div>
			<div class="projects-overview-controls">
				<FancyCheckbox
					v-model="showArchived"
					v-cy="'show-archived-check'"
				>
					{{ $t('project.showArchived') }}
				</FancyCheckbox>

				<div class="action-buttons">
					<XButton
						:to="{name: 'filters.create'}"
						icon="filter"
						variant="secondary"
					>
						{{ $t('filters.create.title') }}
					</XButton>
					<XButton
						v-cy="'new-project'"
						:to="{name: 'project.create'}"
						icon="plus"
					>
						{{ $t('project.create.header') }}
					</XButton>
				</div>
			</div>
		</header>

		<section
			v-if="favoriteProjects.length"
			aria-labelledby="projects-favorites-heading"
			class="projects-overview-section"
		>
			<h2
				id="projects-favorites-heading"
				class="projects-section-title"
			>
				<Icon :icon="['far', 'star']" /> 收藏
			</h2>
			<ProjectCardGrid
				:projects="favoriteProjects"
				:show-archived="showArchived"
			/>
		</section>
		<section
			aria-labelledby="projects-all-heading"
			class="projects-overview-section"
		>
			<h2
				id="projects-all-heading"
				class="projects-section-title"
			>
				全部專案
			</h2>
			<ProjectCardGrid
				:projects="allProjects"
				:show-archived="showArchived"
				add-project
			/>
		</section>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'

import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import ProjectCardGrid from '@/components/project/partials/ProjectCardGrid.vue'

import {useTitle} from '@/composables/useTitle'
import {useStorage} from '@vueuse/core'

import {useProjects} from '@/composables/useProjects'
import {useDelayedLoading} from '@/composables/useDelayedLoading'

const {t} = useI18n()
const projectList = useProjects()

useTitle(() => t('project.projects'))
const showArchived = useStorage('showArchived', false)

const loading = useDelayedLoading(() => projectList.isLoading)
const projects = computed(() => {
	return showArchived.value
		? projectList.visibleProjects
		: projectList.visibleProjects.filter(({is_archived}) => !is_archived)
})
const activeProjectCount = computed(() => projectList.visibleProjects.filter(project => project.id > 0 && !project.is_archived).length)
const favoriteProjects = computed(() => projects.value.filter(project => !project.is_archived && (project.id === -1 || project.is_favorite)))
const allProjects = computed(() => projects.value.filter(project => project.id !== -1))
</script>

<style lang="scss" scoped>
.project-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 1rem;
	margin-block-end: 1rem;

	@media screen and (max-width: $tablet) {
		flex-direction: column;
	}
}

.action-buttons {
	display: flex;
	justify-content: space-between;
	gap: 1rem;

	@media screen and (max-width: $tablet) {
		inline-size: 100%;
		flex-direction: column;
		align-items: stretch;
	}
}

.project:not(:first-child) {
	margin-block-start: 1rem;
}

.project-title {
	display: flex;
	align-items: center;
}

.is-archived {
	font-size: 0.75rem;
	border: 1px solid var(--grey-500);
	color: $grey !important;
	padding: 2px 4px;
	border-radius: 3px;
	font-family: $vikunja-font;
	background: var(--white-translucent);
	margin-inline-start: .5rem;
}
</style>
