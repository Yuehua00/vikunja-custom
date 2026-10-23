<template>
	<div
		v-cy="'collectView'"
		class="collect-view"
	>
		<h1 class="page-title">
			{{ $t('collect.title') }}
		</h1>
		<section class="collect-main">
			<div class="collect-options">
				<label class="collect-field">
					<span class="collect-field-label">{{ $t('collect.project') }}</span>
					<FormSelect
						:model-value="projectId"
						:options="projectOptions"
						:disabled="isSubmitting"
						@update:model-value="value => projectId = Number(value)"
					/>
				</label>
				<label class="collect-field">
					<span class="collect-field-label">{{ $t('collect.type') }}</span>
					<FormSelect
						:model-value="labelId"
						:options="labelOptions"
						:disabled="isSubmitting"
						@update:model-value="value => labelId = Number(value)"
					/>
				</label>
			</div>

			<textarea
				v-model="text"
				class="textarea collect-input"
				rows="8"
				:placeholder="$t('collect.placeholder')"
				:disabled="isSubmitting"
			/>

			<div
				v-if="entries.length > 0"
				class="collect-preview"
			>
				<p class="collect-preview-title">
					{{ $t('collect.preview', {count: entries.length}) }}
				</p>
				<ul class="collect-cards">
					<li
						v-for="(entry, index) in entries"
						:key="index"
						class="collect-card"
					>
						<span class="collect-card-title">
							{{ entry.title || entry.host }}
						</span>
						<span
							v-if="!entry.title"
							class="collect-card-hint"
						>
							{{ $t('collect.titleAuto') }}
						</span>
						<span
							v-for="url in entry.urls"
							:key="url"
							class="collect-card-url"
						>
							{{ url }}
						</span>
					</li>
				</ul>
			</div>

			<div class="collect-actions">
				<XButton
					:disabled="entries.length === 0 || projectId === 0"
					:loading="isSubmitting"
					@click="submit"
				>
					{{ $t('collect.create', {count: entries.length}) }}
				</XButton>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'

import XButton from '@/components/input/Button.vue'
import FormSelect from '@/components/input/FormSelect.vue'
import {useCreateTaskMutation, useAddTaskLabelMutation} from '@/client/queries/taskMutations'
import {fetchUrlTitle} from '@/client/queries/urlTitle'
import {useLabels} from '@/composables/useLabels'
import {useProjects} from '@/composables/useProjects'
import {createTaskDraft} from '@/helpers/task'
import {runWrites} from '@/helpers/runWrites'
import {useConfigStore} from '@/stores/config'
import {error, success} from '@/message'
import {useTitle} from '@/composables/useTitle'

interface Entry {
	raw: string
	title: string
	urls: string[]
	host: string
}

const LAST_PROJECT_KEY = 'collectProjectId'
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g
const BULLET_PATTERN = /^(?:[-*•]|\d+[.)])\s+/

const {t} = useI18n({useScope: 'global'})
useTitle(() => t('collect.title'))

const {projectsArray} = useProjects()
const {labels} = useLabels()
const config = useConfigStore()
const createTask = useCreateTaskMutation()
const addLabel = useAddTaskLabelMutation()

const text = ref('')
const projectId = ref(0)
const labelId = ref(0)
const isSubmitting = ref(false)

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

function parseLines(value: string): Entry[] {
	return value
		.split(/\r?\n/)
		.map(raw => raw.trim().replace(BULLET_PATTERN, '').trim())
		.filter(raw => raw !== '')
		.map(raw => {
			const urls = raw.match(URL_PATTERN) ?? []
			const title = raw.replace(URL_PATTERN, ' ').replace(/\s+/g, ' ').trim()
			return {raw, title, urls, host: urls[0] ? hostOf(urls[0]) : ''}
		})
}

const entries = computed(() => parseLines(text.value))

const selectableProjects = computed(() => projectsArray.value.filter(project => project.id > 0 && !project.is_archived))
const projectOptions = computed(() => selectableProjects.value.map(project => ({value: project.id, label: project.title})))
const labelOptions = computed(() => [
	{value: 0, label: t('collect.noType')},
	...labels.value.filter(label => label.id).map(label => ({value: label.id as number, label: label.title ?? ''})),
])

function readLastProject(): number {
	try {
		return Number(localStorage.getItem(LAST_PROJECT_KEY)) || 0
	} catch {
		return 0
	}
}

// Prefer the project used last time, then the first one that is available.
watch(selectableProjects, projects => {
	if (projects.some(project => project.id === projectId.value)) return
	const last = readLastProject()
	projectId.value = projects.find(project => project.id === last)?.id ?? projects[0]?.id ?? 0
}, {immediate: true})

async function resolveTitle(entry: Entry): Promise<string> {
	if (entry.title) return entry.title
	try {
		return (await fetchUrlTitle(entry.urls[0])) || entry.host
	} catch {
		return entry.host
	}
}

async function submit() {
	if (isSubmitting.value || entries.value.length === 0 || projectId.value === 0) return
	isSubmitting.value = true

	try {
		localStorage.setItem(LAST_PROJECT_KEY, String(projectId.value))
	} catch {
		// Remembering the project is a convenience only.
	}

	const label = labels.value.find(item => item.id === labelId.value)
	const failed: Entry[] = []

	await runWrites(entries.value, async entry => {
		try {
			const draft = createTaskDraft({
				title: await resolveTitle(entry),
				description: entry.urls.map(url => `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`).join(''),
			})
			const task = await createTask.mutateAsync({...draft, project_id: projectId.value})
			if (label?.id) {
				await addLabel.mutateAsync({taskId: task.id!, label: {...label, id: label.id}})
			}
		} catch {
			failed.push(entry)
		}
	}, config.concurrent_writes)

	const created = entries.value.length - failed.length
	// Only the lines that failed stay in the box, so a retry does not create duplicates.
	text.value = failed.map(entry => entry.raw).join('\n')
	isSubmitting.value = false

	if (created > 0) success({message: t('collect.created', {count: created})})
	if (failed.length > 0) error({message: t('collect.failed', {count: failed.length})})
}
</script>

<style lang="scss" scoped>
.collect-main {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	padding: 1.5rem 1.75rem;
	background: var(--white);
	border: 1px solid var(--grey-200);
	border-radius: 20px;
}

.collect-options {
	display: flex;
	flex-wrap: wrap;
	gap: .75rem 1.5rem;
}

.collect-field {
	display: flex;
	align-items: center;
	gap: .5rem;
}

.collect-field-label {
	font-size: .85rem;
	color: var(--grey-500);
}

.collect-input {
	min-block-size: 10rem;
	resize: vertical;
}

.collect-preview-title {
	margin-block-end: .5rem;
	font-size: .85rem;
	color: var(--grey-500);
}

.collect-cards {
	display: flex;
	flex-direction: column;
	gap: .5rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.collect-card {
	display: flex;
	flex-direction: column;
	gap: .15rem;
	padding: .6rem .9rem;
	background: var(--grey-100);
	border-radius: 12px;
}

.collect-card-title {
	font-weight: 600;
}

.collect-card-hint,
.collect-card-url {
	font-size: .8rem;
	color: var(--grey-500);
	overflow-wrap: anywhere;
}

.collect-actions {
	display: flex;
	justify-content: flex-end;
}
</style>
