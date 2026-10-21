<template>
	<ProjectWrapper
		class="project-calendar"
		:is-loading-project="isLoadingProject"
		:project-id
		:view-id
	>
		<template #default>
			<AddTask />
			<CalendarView
				:project-id
				:view-id
				show-unscheduled
			/>
		</template>
	</ProjectWrapper>
</template>

<script setup lang="ts">
import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import CalendarView from '@/components/calendar/CalendarView.vue'
import AddTask from '@/components/tasks/AddTask.vue'

defineProps<{
	isLoadingProject: boolean,
	projectId: number,
	viewId: number,
}>()
</script>
