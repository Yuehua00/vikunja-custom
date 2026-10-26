<template>
	<aside
		:class="{'is-active': baseStore.menuActive, 'is-resizing': isResizing}"
		class="menu-container print-design-sidebar"
		:style="{'--sidebar-width': sidebarWidthStyle}"
	>
		<nav
			class="menu top-menu"
			:aria-label="$t('navigation.main')"
		>
			<RouterLink
				:to="{name: 'home'}"
				class="logo"
				:aria-label="$t('navigation.home')"
			>
				<Logo
					width="164"
					height="48"
				/>
			</RouterLink>
			<menu class="menu-list other-menu-items">
				<li
					v-for="item in mainNavigation"
					:key="item.name"
				>
					<RouterLink
						v-shortcut="item.shortcut || ''"
						:to="{name: item.name}"
						:class="{'print-nav-active': (activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path))) && !(item.name === 'projects.index' && isFavoriteView)}"
					>
						<svg
							class="print-nav-outline"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						><path :d="item.icon" /></svg>
						{{ $t(item.label) }}
					</RouterLink>
				</li>
				<li>
					<RouterLink
						:to="{name: 'project.index', params: {projectId: -1}}"
						:class="{'print-nav-active': isFavoriteView}"
					>
						<svg
							class="print-nav-outline"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linejoin="round"
							aria-hidden="true"
						><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" /></svg>
						{{ $t('project.pseudo.favorites.title') }}
					</RouterLink>
				</li>
			</menu>
		</nav>
		<Loading
			v-if="projectList.isLoading"
			variant="small"
		/>
		<template v-else>
			<nav
				class="menu print-primary-projects"
				:aria-label="$t('project.projects')"
			>
				<p class="menu-label print-nav-section-label">
					PROJECTS 專案
				</p>
				<ProjectsNavigation
					:model-value="projects"
					:can-edit-order="true"
					:can-collapse="true"
				/>
			</nav>
			<details class="print-nav-more">
				<summary>更多功能</summary>
				<nav
					v-if="favoriteProjects.length"
					class="menu"
					:aria-label="$t('project.pseudo.favorites.title')"
				>
					<p class="menu-label print-nav-section-label">
						已收藏專案
					</p>
					<ProjectsNavigation
						:model-value="favoriteProjects"
						:can-edit-order="false"
						:can-collapse="false"
					/>
				</nav>

				<nav
					class="menu"
					aria-label="其他功能"
				>
					<menu class="menu-list">
						<li>
							<RouterLink
								v-shortcut="SHORTCUTS.navigation.labels"
								:to="{name:'labels.index'}"
							>
								<Icon icon="tags" />{{ $t('label.title') }}
							</RouterLink>
						</li>
						<li>
							<RouterLink
								v-shortcut="SHORTCUTS.navigation.teams"
								:to="{name:'teams.index'}"
							>
								<Icon icon="users" />{{ $t('team.title') }}
							</RouterLink>
						</li>
						<li v-if="timeTrackingEnabled">
							<RouterLink :to="{name:'time-tracking'}">
								<Icon :icon="['far','clock']" />{{ $t('timeTracking.title') }}
							</RouterLink>
						</li>
					</menu>
				</nav>

				<nav
					v-if="savedFilterProjects.length"
					class="menu"
					:aria-label="$t('navigation.savedFilters')"
				>
					<p class="menu-label print-nav-section-label">
						FILTERS 篩選
					</p>
					<ProjectsNavigation
						:model-value="savedFilterProjects"
						:can-edit-order="false"
						:can-collapse="false"
					/>
				</nav>
			</details>
		</template>
		<PoweredByLink
			class="mbs-auto"
			utm-medium="navigation"
		/>
		<div
			v-if="!isMobile"
			class="resize-handle"
			@mousedown="startResize"
			@touchstart="startResize"
		/>
	</aside>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'

import {SHORTCUTS} from '@/constants/shortcuts'
import PoweredByLink from '@/components/home/PoweredByLink.vue'
import Logo from '@/components/home/Logo.vue'
import Loading from '@/components/misc/Loading.vue'

import {useBaseStore} from '@/stores/base'
import {useProjects} from '@/composables/useProjects'
import {useConfigStore} from '@/stores/config'
import {PRO_FEATURE} from '@/constants/proFeatures'
import ProjectsNavigation from '@/components/home/ProjectsNavigation.vue'
import {useSidebarResize} from '@/composables/useSidebarResize'

const baseStore = useBaseStore()
const route = useRoute()
const activePath = computed(() => route.fullPath && (window.history.state?.backdropView || route.path))
const isFavoriteView = computed(() => /^\/projects\/-1(?:\/|$)/.test(activePath.value))
const mainNavigation = [
	{name: 'home', path: '/', label: 'navigation.overview', shortcut: SHORTCUTS.navigation.overview, icon: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4'},
	{name: 'tasks.range', path: '/tasks/by/', label: 'navigation.upcoming', shortcut: SHORTCUTS.navigation.upcoming, icon: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4 M8 14h2 M14 14h2 M8 17h2'},
	{name: 'projects.index', path: '/projects', label: 'project.projects', shortcut: SHORTCUTS.navigation.projects, icon: 'M12 3 3 8l9 5 9-5-9-5 M3 13l9 5 9-5'},
	{name: 'focus', path: '/focus', label: 'focus.title', shortcut: '', icon: 'M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M12 9v4l2.5 2.5 M9 2h6'},
	{name: 'collect', path: '/collect', label: 'collect.title', shortcut: '', icon: 'M5 4h14v18H5z M9 2h6v4H9z'},
	{name: 'diary', path: '/diary', label: 'diary.title', shortcut: '', icon: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4'},
]
const projectList = useProjects()
const configStore = useConfigStore()

const timeTrackingEnabled = computed(() => configStore.isProFeatureEnabled(PRO_FEATURE.TIME_TRACKING))

const {sidebarWidthStyle, isResizing, startResize, isMobile} = useSidebarResize()

const projects = computed(() => projectList.notArchivedRootProjects)
const favoriteProjects = computed(() => projectList.favoriteProjects.filter(project => project.id > 0))
const savedFilterProjects = computed(() => projectList.savedFilterProjects)
</script>

<style lang="scss" scoped>
.logo {
	display: block;

	padding-inline-start: 1rem;
	margin-inline-end: 1rem;
	margin-block-end: 1rem;

	@media screen and (min-width: $tablet) {
		display: none;
	}
}

.menu-container {
	--sidebar-width: #{$navbar-width};

	display: flex;
	flex-direction: column;
	background: var(--site-background);
	color: $vikunja-nav-color;
	padding: 1rem 0;
	transition: transform $transition-duration ease-in;
	position: fixed;
	inset-block-start: $navbar-height;
	inset-block-end: 0;
	inset-inline-start: 0;
	transform: translateX(-100%);
	inline-size: var(--sidebar-width);
	overflow-y: auto;
	// Print style: a pale green rule between the sidebar and the page
	border-inline-end: 2px solid var(--print-green-soft);

	[dir="rtl"] & {
		transform: translateX(100%);
	}

	@media screen and (max-width: $tablet) {
		inset-block-start: 0;
		inline-size: 70vw;
		z-index: 20;
	}

	&.is-active {
		transform: translateX(0);
		transition: transform $transition-duration ease-out;
	}

	&.is-resizing {
		transition: none;
	}
}

.resize-handle {
	position: absolute;
	inset-block-start: 0;
	inset-block-end: 0;
	inset-inline-end: 0;
	inline-size: 4px;
	cursor: ew-resize;
	background: transparent;
	transition: background-color $transition-duration ease;
	touch-action: none;

	&:hover,
	&:active {
		background-color: var(--primary);
	}
}

.top-menu .menu-list {
	li {
		font-weight: 600;
		font-family: $vikunja-font;
		// Inset the rows so the hover and the active block sit off the edges, like the design
		margin-inline: 1rem;
		border-radius: $radius;
	}

	.list-menu-link,
	li > a {
		padding-inline-start: 1rem;
		display: flex;
		align-items: center;
		inline-size: 100%;
		block-size: 100%;

		.icon {
			padding-block-end: .25rem;
		}
	}
}

.menu + .menu {
	padding-block-start: math.div($navbar-padding, 2);
}
</style>
