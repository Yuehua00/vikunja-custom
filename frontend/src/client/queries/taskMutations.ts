import {announceTaskCompletion} from '@/components/pet/petEffects'
import {useMutation, type QueryClient} from '@tanstack/vue-query'
import {
	tasksCreate,
	patchTasksRead,
	tasksDelete,
	tasksBulkCreate,
	tasksDuplicate,
	tasksMarkRead,
	taskAssigneesCreate,
	taskAssigneesDelete,
	taskLabelsCreate,
	taskLabelsDelete,
	tasksRelationsCreate,
	tasksRelationsDelete,
	tasksPositionUpdate,
	taskBucketUpdate,
	type Task,
	type TaskWritable,
	type User,
	type Label,
	type TaskRelationWritable,
	type TasksRelationsDeleteData,
	type TaskPositionWritable,
	type JsonPatchOp,
	type Bucket,
	type ProjectView,
} from '@/client/generated'
import {assertClientRequestContext, captureClientRequestContext} from '@/client/requestContext'
import {contextMutationOptions} from './contextMutation'
import {normalizeTask, taskKeys, taskQuery, type PaginatedTaskResponse, type TaskResponse} from './tasks'
import {bucketKeys, bucketsQuery, kanbanKeys, normalizeBucket, type BoardData, type BucketResponse} from './kanban'
import {
	invalidateTaskMembership,
	mapTaskEverywhere,
	removeTaskEverywhere,
	replaceTaskEverywhere,
	taskQueryKeys,
} from './taskCache'
import {getCachedProject, projectKeys} from './projects'
import {colorFromHex} from '@/helpers/color/colorFromHex'
import {getDefaultBucketId, moveTaskToBucket} from '@/helpers/task'
import {computeParentProgress} from '@/helpers/subtaskProgress'
import {isInProgress, isPaused} from '@/helpers/taskStatus'
import {TASK_REPEAT_MODES} from '@/types/IRepeatMode'
import {success, translatedError} from '@/message'
import {i18n} from '@/i18n'
import {queryClient} from '@/client/queryClient'

const API_ZERO_DATE = '0001-01-01T00:00:00Z'

const writableFields = [
	'title',
	'description',
	'done',
	'due_date',
	'start_date',
	'end_date',
	'priority',
	'hex_color',
	'percent_done',
	'importance',
	'paused',
	'repeat_after',
	'repeat_mode',
	'is_favorite',
	'bucket_id',
	'project_id',
	'reminders',
	'cover_image_attachment_id',
] as const satisfies readonly (keyof TaskWritable)[]

export function taskWriteBody(task: Task): TaskWritable {
	const body: TaskWritable = Object.fromEntries(
		writableFields
			.filter(field => task[field] !== undefined)
			.map(field => [field, task[field]]),
	)
	if (body.title !== undefined) body.title = body.title.trim()
	if (body.hex_color !== undefined) body.hex_color = colorFromHex(body.hex_color)
	for (const field of ['due_date', 'start_date', 'end_date'] as const) {
		if (body[field] === '') body[field] = API_ZERO_DATE
	}
	if (body.reminders) body.reminders = body.reminders.map(reminder => ({
		...reminder,
		reminder: reminder.reminder === '' ? API_ZERO_DATE : reminder.reminder,
	}))
	return body
}

function taskPatchBody(task: Task): JsonPatchOp[] {
	return Object.entries(taskWriteBody(task)).map(([field, value]) => ({op: 'add', path: `/${field}`, value}))
}

function reconcileDoneBuckets(client: QueryClient, task: TaskResponse) {
	const handled = new Set<number>()
	for (const [key, board] of client.getQueriesData<BoardData>({queryKey: kanbanKeys.all})) {
		const project = kanbanKeys.projectOf(key)
		const viewId = kanbanKeys.viewOf(key)
		if (!board || project === undefined || viewId === undefined) continue
		const view = getCachedProject(project, client)?.views?.find(item => item.id === viewId)
		if (!view?.done_bucket_id) continue
		const source = board.buckets.find(bucket => bucket.tasks.some(item => item.id === task.id))
		if (!source) continue
		handled.add(viewId)
		const target = task.done
			? view.done_bucket_id
			: source.id === view.done_bucket_id
				? getDefaultBucketId(view, board.buckets)
				: source.id
		if (target === undefined) continue
		const buckets = moveTaskToBucket(board.buckets, task, target)
		if (buckets === board.buckets) continue
		client.setQueryData(key, {...board, buckets: buckets.map(normalizeBucket)})
		reconcileTaskBuckets(client, {project, view: viewId, bucket: target, task: task.id})
	}
	reconcileDoneBucketsWithoutBoard(client, task, handled)
}

// Without a board holding the card, the detail's own buckets array is the only record of where it sits.
function reconcileDoneBucketsWithoutBoard(client: QueryClient, task: TaskResponse, handled: Set<number>) {
	for (const view of getCachedProject(task.project_id, client)?.views ?? []) {
		if (view.id === undefined || handled.has(view.id) || !view.done_bucket_id) continue
		const source = cachedTaskBucketId(client, task.id, view.id)
		if (source === undefined) continue
		const target = task.done
			? view.done_bucket_id
			: source === view.done_bucket_id
				? getDefaultBucketId(view, cachedViewBuckets(client, task.project_id, view.id) ?? [])
				: undefined
		if (target === undefined || target === source) continue
		reconcileTaskBuckets(client, {
			project: task.project_id,
			view: view.id,
			bucket: target,
			task: task.id,
		})
	}
}

function cachedTaskBucketId(client: QueryClient, task: number, view: number): number | undefined {
	for (const [, detail] of client.getQueriesData<TaskResponse>({queryKey: taskKeys.details})) {
		if (detail?.id !== task) continue
		const bucket = detail.buckets?.find(item => item.project_view_id === view)
		if (bucket?.id !== undefined) return bucket.id
	}
	return undefined
}

function cachedViewBuckets(client: QueryClient, project: number, view: number) {
	const board = client.getQueriesData<BoardData>({queryKey: kanbanKeys.view(project, view)})
		.find(([, data]) => data)?.[1]
	return board?.buckets ?? client.getQueryData<Bucket[]>(bucketKeys.list(project, view))
}

function insertTaskIntoBoards(client: QueryClient, created: Task) {
	const task = normalizeTask(created)
	for (const [key, board] of client.getQueriesData<BoardData>({queryKey: kanbanKeys.all})) {
		const project = kanbanKeys.projectOf(key)
		const viewId = kanbanKeys.viewOf(key)
		if (!board || project === undefined || project !== task.project_id || viewId === undefined) continue
		const view = getCachedProject(project, client)?.views?.find(item => item.id === viewId)
		// The response only echoes the requested bucket, which belongs to the one view it was requested for.
		const target = board.buckets.some(bucket => bucket.id === task.bucket_id)
			? task.bucket_id
			: view && view.bucket_configuration_mode !== 'filter'
				? getDefaultBucketId(view, board.buckets)
				: undefined
		if (target === undefined) continue
		client.setQueryData(key, {
			...board,
			buckets: board.buckets.map(bucket => bucket.id === target
				? {...bucket, count: bucket.count + 1, tasks: [{...task, bucket_id: target}, ...bucket.tasks]}
				: bucket),
		})
	}
}

// Changes to these fields can add/remove membership in date ranges, saved filters and favorites.
function changesTaskMembership(input: Task) {
	return ['done', 'due_date', 'start_date', 'end_date', 'project_id', 'is_favorite', 'priority', 'paused', 'percent_done'].some(field => field in input)
}

type TaskMutationOptions<TData, TInput, TOptimistic = undefined> = ReturnType<typeof contextMutationOptions<TData, TInput, TOptimistic>>

function withTaskReadBarrier<TData, TInput, TOptimistic = undefined>(
	options: ReturnType<typeof contextMutationOptions<TData, TInput, TOptimistic>>,
	keysFor: (input: TInput, client: QueryClient) => readonly (readonly unknown[])[],
) {
	return {
		...options,
		onSuccess: async (...args: Parameters<NonNullable<typeof options.onSuccess>>) => {
			const [, input, context, {client}] = args
			assertClientRequestContext(context.request)
			// Cancellation can restore a previous snapshot. Finish it before applying the response.
			await Promise.all(keysFor(input, client).map(queryKey => client.cancelQueries({queryKey})))
			return options.onSuccess?.(...args)
		},
	}
}
const allTaskReadKeys = () => [taskKeys.all, kanbanKeys.all]

export function createTaskMutationOptions(): TaskMutationOptions<Task, Task & Required<Pick<Task, 'project_id'>>> {
	return withTaskReadBarrier(contextMutationOptions({
		mutationFn: async (task: Task & Required<Pick<Task, 'project_id'>>) => (await tasksCreate({
			path: {project: task.project_id},
			body: taskWriteBody(task),
		})).data,
		onSuccess: (task, _input, client) => insertTaskIntoBoards(client, task),
		onSettled: (_task, client) => invalidateTaskMembership(client, undefined, 'active'),
	}), allTaskReadKeys)
}

// A task in progress belongs in the "Doing" bucket of the kanban boards of its project, a paused one back in
// the default bucket. Only a task that sits in the opposite one of the two is moved, so a bucket the user
// picked is left alone.
async function syncKanbanBucket(client: QueryClient, task: TaskResponse) {
	const inProgress = isInProgress(task)
	if (!inProgress && !isPaused(task)) return
	const views = (getCachedProject(task.project_id, client)?.views ?? [])
		.filter((view): view is ProjectView & {id: number} => typeof view.id === 'number' && view.view_kind === 'kanban' && view.bucket_configuration_mode === 'manual')
	if (views.length === 0) return

	const detail = await client.fetchQuery({...taskQuery(task.id, ['buckets']), staleTime: 0})
	for (const view of views) {
		const buckets = await client.fetchQuery(bucketsQuery(task.project_id, view.id))
		const doing = buckets.find(bucket => bucket.title?.trim().toLowerCase() === 'doing')
		const defaultBucket = getDefaultBucketId(view, buckets)
		const current = detail.buckets?.find(bucket => bucket.project_view_id === view.id)?.id
		if (!doing?.id) continue

		const target = inProgress
			? (current === defaultBucket ? doing.id : undefined)
			: (current === doing.id ? defaultBucket : undefined)
		if (!target || target === current) continue

		await taskBucketUpdate({
			path: {project: task.project_id, view: view.id, bucket: target},
			body: {task_id: task.id},
		})
		await client.invalidateQueries({queryKey: kanbanKeys.view(task.project_id, view.id)})
		await client.invalidateQueries({queryKey: [...taskKeys.details, task.id]})
	}
}

// Brings a board in line with its tasks: the ones in progress that still sit in the default bucket go to
// "Doing", the paused ones in "Doing" go back to the default bucket. Covers tasks that were started or paused
// before they were moved automatically.
export async function reconcileDoingBucket(
	client: QueryClient,
	project: number,
	view: ProjectView,
	buckets: readonly BucketResponse[],
) {
	if (view.id === undefined || view.bucket_configuration_mode !== 'manual') return
	const doing = buckets.find(bucket => bucket.title.trim().toLowerCase() === 'doing')
	const defaultId = getDefaultBucketId(view, buckets)
	if (!doing || defaultId === undefined) return

	const moves = [
		...(buckets.find(bucket => bucket.id === defaultId)?.tasks.filter(isInProgress) ?? [])
			.map(task => ({task, bucket: doing.id})),
		...doing.tasks.filter(isPaused).map(task => ({task, bucket: defaultId})),
	]
	if (moves.length === 0) return

	// One at a time, because the database takes a single write at a time.
	for (const {task, bucket} of moves) {
		await taskBucketUpdate({path: {project, view: view.id, bucket}, body: {task_id: task.id}})
	}
	await client.invalidateQueries({queryKey: kanbanKeys.view(project, view.id)})
}

// The progress a task gets when it is dragged into "Doing", so it counts as being worked on.
const DOING_START_PERCENT = 0.1

// What a task needs after a move into a bucket: `show` is applied on screen at once, `save` is what is
// written to the server afterwards (the server already handles the done state of a move itself, and writing
// it again would reschedule a repeating task twice).
interface BucketStatus {
	show: Partial<Task>
	save: Partial<Task>
}

// The bucket and the status of a task go together: "Done" means finished with its progress recorded as 100%,
// "Doing" means in progress, the default bucket means not started, or paused when there is progress. Undefined
// when the task can stay as is. Progress is never taken away: a task that was finished keeps its 100% when it
// is dragged out of "Done" again.
function statusForBucket(
	client: QueryClient,
	project: number,
	viewId: number,
	bucketId: number,
	task: Pick<Task, 'done' | 'percent_done' | 'paused'>,
): BucketStatus | undefined {
	const buckets = cachedViewBuckets(client, project, viewId)
	const target = buckets?.find(item => item.id === bucketId)
	if (!buckets || !target) return undefined

	const percent = task.percent_done ?? 0
	const view = getCachedProject(project, client)?.views?.find(item => item.id === viewId)

	if (view?.done_bucket_id && target.id === view.done_bucket_id) {
		return task.done && percent >= 1
			? undefined
			: {show: {done: true, percent_done: 1}, save: {percent_done: 1}}
	}
	if (target.title?.trim().toLowerCase() === 'doing') {
		// A task that never had progress gets a first bit, one that has some (also a finished one) keeps it.
		const next = percent === 0 ? DOING_START_PERCENT : percent
		if (task.done) {
			return {show: {done: false, paused: false, percent_done: next}, save: {paused: false, percent_done: next}}
		}
		return task.paused || percent === 0
			? {show: {paused: false, percent_done: next}, save: {paused: false, percent_done: next}}
			: undefined
	}
	if (view && target.id === getDefaultBucketId(view, buckets)) {
		// With progress the task counts as paused, otherwise the board would put it back into "Doing".
		if (percent > 0 && (task.done || !task.paused)) {
			return {show: {done: false, paused: true}, save: {paused: true}}
		}
	}
	return undefined
}

const MAX_PARENT_DEPTH = 10

function isRepeatingTask(task: Task) {
	return (task.repeat_after ?? 0) > 0 || task.repeat_mode === TASK_REPEAT_MODES.REPEAT_MODE_MONTH
}

// Recomputes a task's percentage and done state from its subtasks, then walks up to its own parents.
export async function refreshTaskProgress(client: QueryClient, id: number, depth = 0) {
	if (depth > MAX_PARENT_DEPTH) return
	const task = await client.fetchQuery({...taskQuery(id), staleTime: 0})
	const progress = computeParentProgress(task.related_tasks.subtask ?? [])
	if (!progress) return

	const changes: Task = {}
	if (Math.abs(task.percent_done - progress.percent) > 0.001) {
		changes.percent_done = progress.percent
	}
	// A repeating task reschedules itself when done, which does not fit being closed by its subtasks.
	if (!isRepeatingTask(task) && task.done !== progress.allDone) {
		changes.done = progress.allDone
	}
	if (Object.keys(changes).length === 0) return

	const updated = (await patchTasksRead({path: {task: id}, body: taskPatchBody(changes)})).data
	replaceTaskEverywhere(client, updated)
	reconcileDoneBuckets(client, normalizeTask({...updated, id}))
	await syncKanbanBucket(client, normalizeTask({...updated, id}))
	await syncParentProgress(client, id, depth)
}

// To be called after a task changed: its parents follow the new state of their subtasks.
export async function syncParentProgress(client: QueryClient, id: number, depth = 0) {
	const task = await client.fetchQuery({...taskQuery(id), staleTime: 0})
	for (const parent of task.related_tasks.parenttask ?? []) {
		await refreshTaskProgress(client, parent.id, depth + 1)
	}
}

// ---- Finishing a task finishes its subtasks, reopening it brings them back as they were ----

// What is needed to put a task back: whether it was done, how far it was and whether it was paused.
interface TaskState {
	id: number
	done: boolean
	percent_done: number
	paused: boolean
}

// The state of a task before it was finished, with the states of the subtasks that were finished with it.
interface Cascade {
	parent: TaskState
	subtasks: TaskState[]
}

const CASCADE_STORAGE_KEY = 'subtaskCascades'

function loadCascades(): Record<string, Cascade> {
	try {
		return JSON.parse(localStorage.getItem(CASCADE_STORAGE_KEY) ?? '{}')
	} catch {
		return {}
	}
}

function saveCascades(cascades: Record<string, Cascade>) {
	try {
		localStorage.setItem(CASCADE_STORAGE_KEY, JSON.stringify(cascades))
	} catch {
		// Without it a reopened task just cannot bring its subtasks back, which is not worth an error.
	}
}

const stateOf = (task: Pick<Task, 'id' | 'done' | 'percent_done' | 'paused'>): TaskState => ({
	id: task.id!,
	done: Boolean(task.done),
	percent_done: task.percent_done ?? 0,
	paused: Boolean(task.paused),
})

function findCachedTask(client: QueryClient, id: number): TaskResponse | undefined {
	for (const [, task] of client.getQueriesData<TaskResponse>({queryKey: taskKeys.details})) {
		if (task?.id === id) return task
	}
	for (const [, tasks] of client.getQueriesData<TaskResponse[]>({queryKey: taskKeys.allLists})) {
		const found = tasks?.find(item => item.id === id)
		if (found) return found
	}
	for (const [, list] of client.getQueriesData<PaginatedTaskResponse>({queryKey: taskKeys.lists})) {
		const found = list?.items.find(item => item.id === id)
		if (found) return found
	}
	return undefined
}

// The state a task had right before the update that is being made, so that undoing what finishing it did to
// its subtasks can put the task itself back too.
const previousStates = new Map<number, TaskState>()

function rememberPreviousState(client: QueryClient, id: number) {
	const cached = findCachedTask(client, id)
	if (cached) previousStates.set(id, stateOf(cached))
}

// Writes some fields of a task and brings the caches up to date. A write that changes nothing is answered with
// 304 and no body. That is not an error here, there is just nothing to bring up to date, but the client treats
// every status outside 200 to 299 as a failure unless it is told not to throw.
async function patchTaskFields(client: QueryClient, id: number, fields: Partial<Task>): Promise<TaskResponse | undefined> {
	const {data, error, response} = await patchTasksRead({
		path: {task: id},
		body: taskPatchBody(fields),
		throwOnError: false,
	})
	if (response?.status === 304) return undefined
	if (error !== undefined || !data) throw error ?? new Error('The task could not be saved')
	replaceTaskEverywhere(client, data)
	return normalizeTask({...data, id})
}

async function applyTaskState(client: QueryClient, state: TaskState) {
	const updated = await patchTaskFields(client, state.id, {
		done: state.done,
		percent_done: state.percent_done,
		paused: state.paused,
	})
	if (updated) reconcileDoneBuckets(client, updated)
}

// Puts the subtasks that were finished with a task back as they were, unless one of them was changed since,
// and optionally the task itself too. Does the same for the subtasks of those subtasks.
async function restoreCascade(client: QueryClient, parentId: number, includeParent: boolean, depth = 0) {
	const cascades = loadCascades()
	const cascade = cascades[parentId]
	if (!cascade || depth > MAX_PARENT_DEPTH) return
	delete cascades[parentId]
	saveCascades(cascades)

	const fresh = await client.fetchQuery({...taskQuery(parentId), staleTime: 0})
	const current = new Map((fresh.related_tasks.subtask ?? []).map(subtask => [subtask.id, subtask]))
	for (const state of cascade.subtasks) {
		if (!current.get(state.id)?.done) continue
		await applyTaskState(client, state)
		await restoreCascade(client, state.id, false, depth + 1)
	}
	if (includeParent) await applyTaskState(client, cascade.parent)
}

// A task that was finished takes its unfinished subtasks with it, and a pop-up lists them. Undoing it in the
// pop-up puts everything back.
async function finishSubtasks(client: QueryClient, parent: TaskResponse, previous: TaskState | undefined, depth = 0) {
	if (!parent.done || depth > MAX_PARENT_DEPTH) return
	const fresh = await client.fetchQuery({...taskQuery(parent.id), staleTime: 0})
	const open = (fresh.related_tasks.subtask ?? []).filter(subtask => !subtask.done)
	if (open.length === 0) return

	const cascades = loadCascades()
	cascades[parent.id] = {parent: previous ?? stateOf(parent), subtasks: open.map(stateOf)}
	saveCascades(cascades)

	for (const subtask of open) {
		const updated = await patchTaskFields(client, subtask.id, {done: true, percent_done: 1})
			?? normalizeTask({...subtask, done: true, percent_done: 1})
		reconcileDoneBuckets(client, updated)
		await finishSubtasks(client, updated, undefined, depth + 1)
	}

	const shown = open.slice(0, 5).map(subtask => subtask.title).join('、') + (open.length > 5 ? '...' : '')
	success({
		message: i18n.global.t('task.subtasks.finishedWithParent', {parent: parent.title, count: open.length, tasks: shown}),
	}, [{
		title: i18n.global.t('task.undo'),
		callback: () => { void restoreCascade(client, parent.id, true).catch(() => undefined) },
	}])
}

export function updateTaskMutationOptions(optimistic = false): TaskMutationOptions<Task, Task & Required<Pick<Task, 'id'>>, void> {
	const completionStates = new WeakMap<Task, boolean | undefined>()
	return withTaskReadBarrier(contextMutationOptions({
		mutationFn: async (task: Task & Required<Pick<Task, 'id'>>) => {
			// An optimistic update has already changed the cache by now, and remembered the state before that.
			if (!optimistic) {
				completionStates.set(task, findCachedTask(queryClient, task.id)?.done)
				rememberPreviousState(queryClient, task.id)
			}
			return (await patchTasksRead({
				path: {task: task.id},
				body: taskPatchBody(task),
			})).data
		},
		optimistic: optimistic ? {
			queryKeys: ({id}, client) => taskQueryKeys(client, id),
			update: (task, client) => {
				completionStates.set(task, findCachedTask(client, task.id)?.done)
				rememberPreviousState(client, task.id)
				replaceTaskEverywhere(client, task)
			},
		} : undefined,
		onSuccess: (task, input, client) => {
			announceTaskCompletion(completionStates.get(input), {...task, id: input.id})
			completionStates.delete(input)
			replaceTaskEverywhere(client, task)
			reconcileDoneBuckets(client, normalizeTask({...task, id: input.id}))
			// Background work, one step after the other because the database takes a single write at a
			// time. A failure only leaves the parent's progress, the kanban bucket or the subtasks for the
			// next update.
			void (async () => {
				await syncKanbanBucket(client, normalizeTask({...task, id: input.id}))
				await syncParentProgress(client, input.id)
				// Finishing a task finishes its subtasks. Reopening it leaves them as they are.
				if (task.done) {
					await finishSubtasks(client, normalizeTask({...task, id: input.id}), previousStates.get(input.id))
				}
			})().catch(() => undefined)
		},
		onSettled: async (input, client) => {
			await invalidateTaskMembership(client, input.id)
			if (changesTaskMembership(input)) await invalidateTaskMembership(client, undefined, 'active')
		},
	}), (input, client) => changesTaskMembership(input) ? allTaskReadKeys() : taskQueryKeys(client, input.id))
}

export function deleteTaskMutationOptions(): TaskMutationOptions<void, number> {
	return withTaskReadBarrier(contextMutationOptions({
		mutationFn: async (id: number) => { await tasksDelete({path: {task: id}}) },
		onSuccess: (_data, id, client) => removeTaskEverywhere(client, id),
		onSettled: (_id, client) => invalidateTaskMembership(client, undefined, 'active'),
	}), allTaskReadKeys)
}

export function bulkCreateTasksMutationOptions() {
	return contextMutationOptions({
		mutationFn: async (input: Task[]) => {
			const context = captureClientRequestContext()
			const tasks: (Task | null)[] = Array(input.length).fill(null)
			let error: unknown = null
			const groups = new Map<number, {task: Task, index: number}[]>()
			input.forEach((task, index) => {
				const project = task.project_id ?? 0
				groups.set(project, [...(groups.get(project) ?? []), {task, index}])
			})
			for (const [project, entries] of groups) {
				const batches = []
				for (let index = 0; index < entries.length; index += 100) batches.push(entries.slice(index, index + 100))
				// The API inserts batches at the top, so submit the last batch first.
				for (const batch of batches.reverse()) {
					assertClientRequestContext(context)
					try {
						const {data} = await tasksBulkCreate({
							path: {project},
							body: {tasks: batch.map(({task}) => taskWriteBody(task))},
						})
						if (data.tasks?.length !== batch.length) throw translatedError('task.bulkCreateUnexpectedResponse')
						data.tasks!.forEach((task, index) => { tasks[batch[index].index] = task })
					} catch (cause) {
						error ??= cause
						break
					}
				}
			}
			return {tasks, error}
		},
		// The backend keeps the input order top to bottom, so insert back to front.
		onSuccess: ({tasks}, _input, client) => [...tasks].reverse().forEach(task => {
			if (task) insertTaskIntoBoards(client, task)
		}),
		onSettled: (_input, client) => invalidateTaskMembership(client, undefined, 'active'),
	})
}

export function duplicateTaskMutationOptions() {
	return contextMutationOptions({
		mutationFn: async (id: number) => (await tasksDuplicate({path: {task: id}})).data.duplicated_task!,
		onSuccess: (task, _id, client) => insertTaskIntoBoards(client, task),
		onSettled: (_id, client) => invalidateTaskMembership(client, undefined, 'active'),
	})
}

export function favoriteTaskMutationOptions() {
	return contextMutationOptions({
		mutationFn: async (task: Task & Required<Pick<Task, 'id'>>) => (await patchTasksRead({
			path: {task: task.id},
			body: taskPatchBody({is_favorite: !task.is_favorite}),
		})).data,
		optimistic: {
			queryKeys: ({id}, client) => taskQueryKeys(client, id),
			update: (task, client) => mapTaskEverywhere(client, task.id, current => ({
				...current,
				is_favorite: !task.is_favorite,
			})),
		},
		onSuccess: (task, _input, client) => replaceTaskEverywhere(client, task),
		onSettled: async ({id}, client) => {
			await invalidateTaskMembership(client, id)
			await client.invalidateQueries({queryKey: projectKeys.list()})
		},
	})
}

export function markTaskReadMutationOptions() {
	return contextMutationOptions({
		mutationFn: async (id: number) => { await tasksMarkRead({path: {task: id}}) },
		onSuccess: (_data, id, client) => mapTaskEverywhere(client, id, task => ({...task, is_unread: false})),
		onSettled: (id, client) => invalidateTaskMembership(client, id),
	})
}

type AssigneeInput = {taskId: number, user: User & Required<Pick<User, 'id'>>}
export function addTaskAssigneeMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({taskId, user}: AssigneeInput) =>
			(await taskAssigneesCreate({path: {task: taskId}, body: {user_id: user.id}})).data,
		onSuccess: (_data, {taskId, user}, client) => mapTaskEverywhere(client, taskId, task => ({
			...task,
			assignees: [...task.assignees.filter(item => item.id !== user.id), user],
		})),
		onSettled: ({taskId}, client) => invalidateTaskMembership(client, taskId),
	})
}
export function removeTaskAssigneeMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({taskId, user}: AssigneeInput) => {
			await taskAssigneesDelete({path: {task: taskId, user: user.id}})
		},
		onSuccess: (_data, {taskId, user}, client) => mapTaskEverywhere(client, taskId, task => ({
			...task,
			assignees: task.assignees.filter(item => item.id !== user.id),
		})),
		onSettled: ({taskId}, client) => invalidateTaskMembership(client, taskId),
	})
}

type LabelInput = {taskId: number, label: Label & Required<Pick<Label, 'id'>>}
export function addTaskLabelMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({taskId, label}: LabelInput) =>
			(await taskLabelsCreate({path: {task: taskId}, body: {label_id: label.id}})).data,
		onSuccess: (_data, {taskId, label}, client) => mapTaskEverywhere(client, taskId, task => ({
			...task,
			labels: [...task.labels.filter(item => item.id !== label.id), label],
		})),
		onSettled: ({taskId}, client) => invalidateTaskMembership(client, taskId),
	})
}
export function removeTaskLabelMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({taskId, label}: LabelInput) => {
			await taskLabelsDelete({path: {task: taskId, label: label.id}})
		},
		onSuccess: (_data, {taskId, label}, client) => mapTaskEverywhere(client, taskId, task => ({
			...task,
			labels: task.labels.filter(item => item.id !== label.id),
		})),
		onSettled: ({taskId}, client) => invalidateTaskMembership(client, taskId),
	})
}

export function createTaskRelationMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({taskId, ...body}: TaskRelationWritable & {taskId: number}) =>
			(await tasksRelationsCreate({path: {task: taskId}, body})).data,
		onSettled: async ({taskId, other_task_id}, client) => {
			await invalidateTaskMembership(client, taskId, 'active')
			if (other_task_id) await invalidateTaskMembership(client, other_task_id, 'active')
		},
	})
}
export function deleteTaskRelationMutationOptions() {
	return contextMutationOptions({
		mutationFn: async (path: TasksRelationsDeleteData['path']) => {
			await tasksRelationsDelete({path})
		},
		onSettled: async ({task, otherTask}, client) => {
			await invalidateTaskMembership(client, task, 'active')
			await invalidateTaskMembership(client, otherTask, 'active')
		},
	})
}

export function updateTaskPositionMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({taskId, ...body}: TaskPositionWritable & {taskId: number}) =>
			(await tasksPositionUpdate({path: {task: taskId}, body})).data,
		onSuccess: (data, {taskId, project_view_id}, client) => {
			for (const [key, list] of client.getQueriesData<PaginatedTaskResponse>({queryKey: taskKeys.lists})) {
				const params = taskKeys.paramsOf(key)
				if (!list || !params || taskKeys.viewOf(key) !== project_view_id) continue
				const direction = params.order_by?.[0] === 'desc' ? -1 : 1
				const items = list.items.map(task => task.id === taskId
					? {...task, position: data.position ?? task.position}
					: task)
				client.setQueryData(key, {
					...list,
					items: params.sort_by?.[0] === 'position'
						? items.sort((a, b) => direction * (a.position - b.position))
						: items,
				})
			}
			for (const [key, board] of client.getQueriesData<BoardData>({queryKey: kanbanKeys.all})) {
				if (board && kanbanKeys.viewOf(key) === project_view_id) client.setQueryData(key, {
					...board,
					buckets: board.buckets.map(bucket => ({
						...bucket,
						tasks: bucket.tasks
							.map(task => task.id === taskId
								? {...task, position: data.position ?? task.position}
								: task)
							.sort((a, b) => a.position - b.position),
					})),
				})
			}
		},
		onSettled: ({taskId}, client) => invalidateTaskMembership(client, taskId),
	})
}

// The detail's buckets array is the only source of the bucket label and nothing refetches it.
function reconcileTaskBuckets(
	client: QueryClient,
	{project, view, bucket, task}: {project: number, view: number, bucket: number, task: number},
) {
	const target = cachedViewBuckets(client, project, view)?.find(item => item.id === bucket)
	if (!target) {
		void client.invalidateQueries({queryKey: [...taskKeys.details, task], refetchType: 'active'})
		return
	}
	const {tasks: _tasks, ...entry} = target
	mapTaskEverywhere(client, task, current => current.buckets
		? {
			...current,
			buckets: current.buckets.map(item => item.project_view_id === view
				? {...entry, project_view_id: view}
				: item),
		}
		: current)
}

export function moveTaskMutationOptions() {
	return contextMutationOptions({
		mutationFn: async ({project, view, bucket, task}: {
			project: number,
			view: number,
			bucket: number,
			task: Task,
		}) => (await taskBucketUpdate({path: {project, view, bucket}, body: {task_id: task.id}})).data,
		optimistic: {
			queryKeys: ({project, view}) => [kanbanKeys.view(project, view)],
			update: ({project, view, bucket, task}, client) => {
				// The status changes with the bucket, right away like the done state does.
				const status = statusForBucket(client, project, view, bucket, normalizeTask(task))
				const moved = normalizeTask(status === undefined ? task : {...task, ...status.show})
				if (status !== undefined && task.id !== undefined) {
					mapTaskEverywhere(client, task.id, current => normalizeTask({...current, ...status.show}))
				}
				return client.setQueriesData<BoardData>(
					{queryKey: kanbanKeys.view(project, view)},
					current => current ? {
						...current,
						buckets: moveTaskToBucket(current.buckets, moved, bucket).map(normalizeBucket),
					} : current,
				)
			},
		},
		onSuccess: (data, {project, view, bucket, task}, client) => {
			const target = data.bucket_id ?? bucket
			// The response still has the old status; the one that goes with the bucket stays on screen
			// until it is saved below.
			const status = statusForBucket(client, project, view, target, task)
			const withStatus = (item: Task): Task => status === undefined ? item : {...item, ...status.show}
			if (data.task) replaceTaskEverywhere(client, withStatus(data.task))
			client.setQueriesData<BoardData>(
				{queryKey: kanbanKeys.view(project, view)},
				current => current ? {
					...current,
					buckets: moveTaskToBucket(current.buckets, withStatus(data.task ?? task), target).map(normalizeBucket),
				} : current,
			)
			const id = data.task?.id ?? task.id
			if (id !== undefined) reconcileTaskBuckets(client, {project, view, bucket: target, task: id})

			// Saves the status that goes with the bucket, and takes the subtasks along when the task was finished.
			// Reopening it leaves them as they are. Slightly later, one step after the other, so it does not
			// write at the same moment as the position the board saves after a drop.
			const nowDone = data.task?.done ?? status?.show.done
			const toSave = status !== undefined && Object.keys(status.save).length > 0
			// A subtask that was moved changes how far its parent is: finished with its last subtask, and
			// reopened as soon as one of them is.
			const hasParent = (data.task?.related_tasks?.parenttask ?? task.related_tasks?.parenttask ?? []).length > 0
			if (id !== undefined && (toSave || nowDone === true || hasParent)) {
				setTimeout(() => {
					void (async () => {
						if (status !== undefined && toSave) {
							await patchTaskFields(client, id, status.save)
						}
						if (nowDone === true) {
							await finishSubtasks(client, normalizeTask({...withStatus(data.task ?? task), id}), stateOf(task))
						}
						if (hasParent) {
							await syncParentProgress(client, id)
						}
					})().catch(() => undefined)
				}, 800)
			}
		},
		onSettled: ({task}, client) => invalidateTaskMembership(client, task.id),
	})
}

export function useCreateTaskMutation() {
	return useMutation(createTaskMutationOptions())
}

export function useUpdateTaskMutation(optimistic = false) {
	return useMutation(updateTaskMutationOptions(optimistic))
}

export function useDeleteTaskMutation() {
	return useMutation(deleteTaskMutationOptions())
}

export function useBulkCreateTasksMutation() {
	return useMutation(bulkCreateTasksMutationOptions())
}

export function useDuplicateTaskMutation() {
	return useMutation(duplicateTaskMutationOptions())
}

export function useFavoriteTaskMutation() {
	return useMutation(favoriteTaskMutationOptions())
}

export function useMarkTaskReadMutation() {
	return useMutation(markTaskReadMutationOptions())
}

export function useAddTaskAssigneeMutation() {
	return useMutation(addTaskAssigneeMutationOptions())
}

export function useRemoveTaskAssigneeMutation() {
	return useMutation(removeTaskAssigneeMutationOptions())
}

export function useAddTaskLabelMutation() {
	return useMutation(addTaskLabelMutationOptions())
}

export function useRemoveTaskLabelMutation() {
	return useMutation(removeTaskLabelMutationOptions())
}

export function useCreateTaskRelationMutation() {
	return useMutation(createTaskRelationMutationOptions())
}

export function useDeleteTaskRelationMutation() {
	return useMutation(deleteTaskRelationMutationOptions())
}

export function useUpdateTaskPositionMutation() {
	return useMutation(updateTaskPositionMutationOptions())
}

export function useMoveTaskMutation() {
	return useMutation(moveTaskMutationOptions())
}
