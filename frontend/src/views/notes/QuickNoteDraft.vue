<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {useAuthStore} from '@/stores/auth'
import {getApiRootUrl} from '@/helpers/apiUrl'
import {isRequestContextAbort} from '@/client/requestContext'
import {useCreateQuickNoteMutation, useSaveQuickNoteMutation, useTrashQuickNoteMutation, type QuickNoteResponse, type NoteWrite} from '@/client/queries/quickNotes'
import {createNoteSaveQueue, noteDraftKey} from '@/helpers/quickNotes'
import QuickNoteEditor from './QuickNoteEditor.vue'

const props = defineProps<{note: QuickNoteResponse}>()
const emit = defineEmits<{closed: [], restored: [], copied: [id: number]}>()
const auth = useAuthStore()
// eslint-disable-next-line vue/no-setup-props-reactivity-loss -- This keyed editor deliberately owns a snapshot, not a live server mirror.
const storageKey = noteDraftKey(getApiRootUrl(), auth.info?.id ?? 0, props.note.id)
// eslint-disable-next-line vue/no-setup-props-reactivity-loss -- This keyed editor deliberately owns a snapshot, not a live server mirror.
const content = ref(props.note.content)
// eslint-disable-next-line vue/no-setup-props-reactivity-loss -- This keyed editor deliberately owns a snapshot, not a live server mirror.
const pinned = ref(props.note.pinned)
// eslint-disable-next-line vue/no-setup-props-reactivity-loss -- This keyed editor deliberately owns a snapshot, not a live server mirror.
const version = ref(props.note.version)
// eslint-disable-next-line vue/no-setup-props-reactivity-loss -- This keyed editor deliberately owns a snapshot, not a live server mirror.
const trashed = ref(props.note.is_trashed)
const status = ref('已儲存')
const saveError = ref('')
const draftStored = ref(true)
const conflict = ref(false)
const uploading = ref(false)
const more = ref(false)
const saving = ref(false)
const copyMutation = useCreateQuickNoteMutation()
const mutation = useSaveQuickNoteMutation()
let allowLeave = false
const trash = useTrashQuickNoteMutation()
let timer: ReturnType<typeof setTimeout> | undefined
let alive = true
const snapshot = (): NoteWrite => ({id: props.note.id, content: content.value, pinned: pinned.value, is_trashed: trashed.value, version: version.value})
function persistDraft() {
	try {localStorage.setItem(storageKey, JSON.stringify(snapshot())); draftStored.value = true; return true}
	catch {draftStored.value = false; saveError.value = '無法保留本機草稿，請先不要關閉此頁。'; return false}
}
const queue = createNoteSaveQueue(snapshot, async draft => {
	if (conflict.value) throw new Error('conflict')
	saving.value = true; status.value = '儲存中…'
	try {
		const saved = await mutation.mutateAsync(draft)
		if (!alive) return
		version.value = saved.version
		persistDraft()
	} catch (error) {
		if (isRequestContextAbort(error)) throw error
		conflict.value = (error as {status?: number})?.status === 409
		saveError.value = conflict.value ? (draftStored.value ? '這則筆記已在其他地方修改；本機草稿已保留，請複製內容後重新開啟比較。' : '版本衝突，且本機草稿無法保存。請先複製內容。') : draftStored.value ? '尚未同步，內容已保留在這台裝置。連線恢復後可重試。' : '尚未同步，也無法保留本機草稿。請先複製內容，不要關閉此頁。'
		status.value = '尚未同步'
		throw error
	} finally {saving.value = false}
})
function recoverDraft() {
	try {
		const raw = localStorage.getItem(storageKey)
		if (raw) {
			const draft = JSON.parse(raw) as NoteWrite
			if (draft.content !== content.value || draft.pinned !== pinned.value) {
				content.value = draft.content; pinned.value = draft.pinned; queue.markChanged()
				conflict.value = draft.version !== version.value
				status.value = conflict.value ? '草稿與伺服器版本不同' : '已恢復本機草稿，尚未同步'
				if (conflict.value) saveError.value = '保留了這台裝置的草稿；伺服器已有新版本，請複製內容後重新開啟比較。'
			}
		}
	} catch {saveError.value = '本機草稿無法讀取，顯示伺服器版本。'}
}
recoverDraft()
async function flush() {
	if (allowLeave) return true
	clearTimeout(timer)
	if (uploading.value) {saveError.value = '圖片仍在上傳，請稍候。'; return false}
	if (!queue.dirty) return true
	const ok = await queue.flush()
	if (ok && alive) {
		status.value = '已儲存'; saveError.value = ''
		try {localStorage.removeItem(storageKey)} catch { /* Retaining an already saved draft is harmless. */ }
	}
	return ok
}
function changed(value?: string) {
	if (value !== undefined) content.value = value
	queue.markChanged(); persistDraft(); status.value = '尚未同步'
	clearTimeout(timer)
	if (!conflict.value) timer = setTimeout(() => {void flush()}, 650)
}
function setUploading(value: boolean) {
	uploading.value = value
	if (!value && queue.dirty && !conflict.value) {clearTimeout(timer); timer = setTimeout(() => {void flush()}, 650)}
}
function togglePin() {pinned.value = !pinned.value; changed()}
async function remove() {
	if (!await flush()) return
	try {await trash.mutateAsync(props.note.id); emit('closed')} catch { /* Mutation displays failure. */ }
}
async function restore() {
	trashed.value = false; changed()
	if (await flush()) emit('restored')
}
async function copyDraft() {
	try {await navigator.clipboard.writeText(content.value); status.value = '已複製草稿 HTML'}
	catch {saveError.value = '無法自動複製，請選取編輯區內容後複製。'}
}
async function saveAsNew() {
	try {
		const saved = await copyMutation.mutateAsync(content.value)
		allowLeave = true
		emit('copied', saved.id)
	} catch {saveError.value = '無法另存新筆記，草稿仍保留在這台裝置。'}
}
function leaveWithDraft() {if (!persistDraft()) return; allowLeave = true; emit('closed')}
onMounted(() => {if (queue.dirty && !conflict.value) timer = setTimeout(() => {void flush()}, 650)})
function beforeUnload(event: BeforeUnloadEvent) {
	if (queue.dirty || uploading.value) {event.preventDefault(); event.returnValue = ''}
}
function online() {if (!conflict.value) void flush()}
window.addEventListener('beforeunload', beforeUnload)
window.addEventListener('online', online)
const busy = computed(() => saving.value || uploading.value || trash.isPending.value || copyMutation.isPending.value)
onBeforeUnmount(() => {
	alive = false; clearTimeout(timer)
	window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('online', online)
})
defineExpose({flush})
</script>

<template>
	<section class="note-draft">
		<header class="note-draft-header">
			<div><span class="note-kicker">NOTE 隨手記</span><h2>{{ note.title }}</h2></div>
			<div class="note-draft-actions">
				<button
					v-if="trashed"
					type="button"
					:disabled="busy"
					@click="restore"
				>
					還原筆記
				</button>
				<button
					v-else
					type="button"
					:aria-pressed="pinned"
					@click="togglePin"
				>
					{{ pinned ? '已釘選' : '釘選' }}
				</button>
				<button
					v-if="!trashed"
					type="button"
					:aria-expanded="more"
					@click="more = !more"
				>
					更多
				</button>
				<button
					v-if="more"
					type="button"
					:disabled="busy"
					@click="remove"
				>
					移到最近刪除
				</button>
			</div>
		</header>
		<p
			v-if="saveError"
			class="note-save-error"
			role="alert"
		>
			{{ saveError }} <button
				v-if="!conflict"
				type="button"
				@click="flush"
			>
				重試儲存
			</button><button
				v-else
				type="button"
				@click="copyDraft"
			>
				複製草稿
			</button>
		</p>
		<div
			v-if="saveError"
			class="note-recovery-actions"
		>
			<button
				v-if="conflict"
				type="button"
				:disabled="busy"
				@click="saveAsNew"
			>
				另存成新筆記
			</button>
			<button
				type="button"
				:disabled="busy"
				@click="leaveWithDraft"
			>
				保留草稿，返回列表
			</button>
		</div>
		<QuickNoteEditor
			:note-id="note.id"
			:content="content"
			:readonly="trashed"
			@change="changed"
			@uploading="setUploading"
		/>
		<footer
			class="note-save-status"
			role="status"
		>
			{{ uploading ? '圖片上傳中…' : status }}<span v-if="trashed">內容與圖片仍保留，可隨時還原。</span>
		</footer>
	</section>
</template>

<style scoped lang="scss">
.note-draft {
 padding: 1.25rem 1.5rem;
 background: var(--print-paper, var(--white));
 min-inline-size: 0;
 
}

.note-draft-header {
 display: flex;
 align-items: start;
 justify-content: space-between;
 gap: 1rem;
 padding-block-end: 1rem;
 border-block-end: 2px solid var(--print-green, var(--primary));
 
}

.note-kicker {
 font-size: .75rem;
 font-weight: 700;
 letter-spacing: .12em;
 color: var(--link);
 
}

.note-draft h2 {
 font-size: 1.35rem;
 margin-block: .3rem 0;
 overflow-wrap: anywhere;
 
}

.note-draft-actions {
 display: flex;
 justify-content: end;
 flex-wrap: wrap;
 gap: .4rem;
 
}

.note-draft button {
 background: transparent;
 color: var(--link);
 border: 1px solid var(--grey-200);
 padding: .35rem .6rem;
 white-space: nowrap;
 cursor: pointer;
 
}

.note-draft button[aria-pressed='true'] {
 background: var(--print-green, var(--primary));
 color: white;
 
}

.note-save-status {
 display: flex;
 flex-wrap: wrap;
 justify-content: space-between;
 gap: .4rem;
 font-size: .75rem;
 color: var(--text-muted);
 border-block-start: 1px solid var(--grey-200);
 padding-block-start: .8rem;
 
}

.note-save-error {
 color: var(--danger);
 font-size: .85rem;
 
}

</style>
