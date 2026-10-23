import {computed} from 'vue'
import {useQuery} from '@tanstack/vue-query'

import type {Label, Task} from '@/client/generated'
import {createProjectDraft, useCreateProjectMutation} from '@/client/queries/projects'
import {useCreateLabelMutation} from '@/client/queries/labels'
import {allTasksQuery} from '@/client/queries/tasks'
import {
	useAddTaskLabelMutation,
	useCreateTaskMutation,
	useRemoveTaskLabelMutation,
	useUpdateTaskMutation,
} from '@/client/queries/taskMutations'
import {useLabels} from '@/composables/useLabels'
import {useProjects} from '@/composables/useProjects'
import {createTaskDraft} from '@/helpers/task'
import {
	DIARY_PROJECT_TITLE,
	MOODS,
	MOOD_COLORS,
	isDiaryTitle,
	moodLabelTitle,
	moodOf,
	type Mood,
} from '@/helpers/diary'

type UpdatableTask = Task & Required<Pick<Task, 'id'>>

// The diary project holds one finished task per day, titled with the date. The tasks are finished so they
// stay out of the open task lists and the calendar. Everything the diary needs is created on first use.
export function useDiary() {
	// useProjects() is a reactive object, so its lists must be read off it rather than destructured as refs.
	const projectStore = useProjects()
	const {labels} = useLabels()
	const createProject = useCreateProjectMutation()
	const createLabel = useCreateLabelMutation()
	const createTask = useCreateTaskMutation()
	const updateTask = useUpdateTaskMutation()
	const addLabel = useAddTaskLabelMutation()
	const removeLabel = useRemoveTaskLabelMutation()

	const projectId = computed(() =>
		projectStore.projectsArray.find(project => project.title === DIARY_PROJECT_TITLE && !project.is_archived)?.id ?? 0,
	)

	const query = useQuery(computed(() => ({
		...allTasksQuery({
			project: projectId.value,
			params: {
				sort_by: ['id'],
				order_by: ['desc'],
				// Finished tasks are hidden unless asked for.
				filter: 'done = true || done = false',
			},
		}),
		enabled: projectId.value > 0,
	})))

	const entryByDate = computed(() => {
		const entries = new Map<string, Task>()
		for (const task of query.data.value ?? []) {
			if (isDiaryTitle(task.title)) entries.set(task.title, task)
		}
		return entries
	})

	const moodByDate = computed(() => {
		const moods = new Map<string, Mood>()
		for (const [date, task] of entryByDate.value) {
			const mood = moodOf(task.labels)
			if (mood) moods.set(date, mood)
		}
		return moods
	})

	// Typing and a mood click can both need the same missing item, so each one is only created once.
	const pending = new Map<string, Promise<unknown>>()

	function once<T>(key: string, create: () => Promise<T>): Promise<T> {
		let promise = pending.get(key) as Promise<T> | undefined
		if (!promise) {
			promise = create().finally(() => pending.delete(key))
			pending.set(key, promise)
		}
		return promise
	}

	function ensureProjectId(): Promise<number> {
		if (projectId.value > 0) return Promise.resolve(projectId.value)
		return once('project', async () => (await createProject.mutateAsync(createProjectDraft({title: DIARY_PROJECT_TITLE}))).id)
	}

	function ensureMoodLabel(mood: Mood): Promise<Label> {
		const title = moodLabelTitle(mood)
		const existing = labels.value.find(label => label.title === title)
		if (existing) return Promise.resolve(existing)
		return once(`label-${mood}`, () => createLabel.mutateAsync({title, hex_color: MOOD_COLORS[mood].slice(1)}))
	}

	function getOrCreateEntry(date: string): Promise<Task> {
		const existing = entryByDate.value.get(date)
		if (existing) return Promise.resolve(existing)
		return once(`entry-${date}`, async () => {
			const project = await ensureProjectId()
			const created = await createTask.mutateAsync({...createTaskDraft({title: date, done: true}), project_id: project})
			await query.refetch()
			return created
		})
	}

	async function saveText(date: string, description: string) {
		const entry = await getOrCreateEntry(date)
		const latest = entryByDate.value.get(date) ?? entry
		await updateTask.mutateAsync({...latest, description, done: true} as UpdatableTask)
	}

	// Picking the mood that is already set clears it.
	async function setMood(date: string, mood: Mood) {
		const entry = await getOrCreateEntry(date)
		const current = entryByDate.value.get(date) ?? entry
		const taskId = entry.id as number
		const wanted = moodOf(current.labels) === mood ? undefined : mood

		for (const old of MOODS.filter(item => item !== wanted)) {
			const label = (current.labels ?? []).find(item => item.title === moodLabelTitle(old))
			if (label?.id) await removeLabel.mutateAsync({taskId, label: {...label, id: label.id}})
		}
		if (wanted && moodOf(current.labels) !== wanted) {
			const label = await ensureMoodLabel(wanted)
			await addLabel.mutateAsync({taskId, label: {...label, id: label.id as number}})
		}
		await query.refetch()
	}

	return {
		projectId,
		isLoading: query.isFetching,
		entryByDate,
		moodByDate,
		saveText,
		setMood,
	}
}
