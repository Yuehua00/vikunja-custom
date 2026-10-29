<script setup lang="ts">
import {computed, ref} from 'vue'
import {onBeforeRouteLeave} from 'vue-router'
import {useQuery} from '@tanstack/vue-query'
import {useAuthStore} from '@/stores/auth'
import {getApiRootUrl} from '@/helpers/apiUrl'
import {quickNoteQuery, quickNotesQuery, useCreateQuickNoteMutation} from '@/client/queries/quickNotes'
import {useTitle} from '@/composables/useTitle'
import QuickNoteDraft from './QuickNoteDraft.vue'

useTitle('隨手記')
const auth = useAuthStore()
const selectionKey = `vikunja:quick-note-selection:${getApiRootUrl()}:${auth.info?.id ?? 0}`
const selected = ref(0)
try {selected.value = Math.max(0, Number(localStorage.getItem(selectionKey)) || 0)} catch { /* Optional selection memory. */ }
const trash = ref(false)
const searchInput = ref('')
const search = ref('')
const page = ref(1)
const mobileEditor = ref(false)
const expanded = ref(false)
const draft = ref<InstanceType<typeof QuickNoteDraft>>()
const create = useCreateQuickNoteMutation()
const list = useQuery(computed(() => quickNotesQuery(trash.value, search.value, page.value)))
const detail = useQuery(computed(() => quickNoteQuery(selected.value)))
const items = computed(() => list.data.value?.items ?? [])
const error = ref('')
async function flush() {return !draft.value || await draft.value.flush()}
async function open(id: number) {
	if (!await flush()) return
	selected.value = id; mobileEditor.value = true; expanded.value = false
	try {localStorage.setItem(selectionKey, String(id))} catch { /* Optional selection memory. */ }
}
async function newNote() {
	if (!await flush()) return
	try {
		const note = await create.mutateAsync('')
		trash.value = false; search.value = ''; searchInput.value = ''; page.value = 1
		await open(note.id)
	} catch {error.value = '無法建立筆記，請確認連線後重試。'}
}
async function changeList(showTrash: boolean) {
	if (!await flush()) return
	trash.value = showTrash; selected.value = 0; page.value = 1; mobileEditor.value = false; expanded.value = false
}
async function find() {if (!await flush()) return; search.value = searchInput.value.trim(); page.value = 1}
async function goPage(change: number) {if (await flush()) page.value += change}
async function back() {if (await flush()) mobileEditor.value = false}
function closed() {
	selected.value = 0; mobileEditor.value = false; expanded.value = false
	try {localStorage.removeItem(selectionKey)} catch { /* Optional selection memory. */ }
}
function restored() {trash.value = false; selected.value = 0; mobileEditor.value = false; expanded.value = false; page.value = 1}
onBeforeRouteLeave(async () => await flush())
</script>

<template>
	<div
		class="quick-notes-page"
		:class="{'mobile-editor-open': mobileEditor, 'notes-expanded': expanded}"
	>
		<header class="notes-page-heading">
			<div class="notes-heading-text"><span class="print-page-kicker">QUICK NOTES</span><h1 class="page-title">隨手記</h1></div><button
				type="button"
				:disabled="create.isPending.value"
				@click="newNote"
			>
				＋ 新增筆記
			</button>
		</header>
		<p
			v-if="error"
			role="alert"
		>
			{{ error }}
		</p>
		<div class="notes-layout">
			<aside
				class="notes-list"
				aria-label="筆記列表"
			>
				<form
					class="notes-search"
					role="search"
					@submit.prevent="find"
				>
					<input
						v-model="searchInput"
						type="search"
						placeholder="搜尋筆記…"
						aria-label="搜尋筆記"
					><button type="submit">
						搜尋
					</button>
				</form>
				<div class="notes-tabs">
					<button
						type="button"
						:aria-pressed="!trash"
						@click="changeList(false)"
					>
						全部筆記
					</button><button
						type="button"
						:aria-pressed="trash"
						@click="changeList(true)"
					>
						最近刪除
					</button>
				</div>
				<p
					v-if="list.isPending.value"
					class="notes-empty"
				>
					載入中…
				</p>
				<p
					v-else-if="list.isError.value"
					class="notes-empty"
					role="alert"
				>
					無法載入筆記。<button
						type="button"
						@click="list.refetch()"
					>
						重試
					</button>
				</p>
				<p
					v-else-if="!items.length"
					class="notes-empty"
				>
					{{ trash ? '最近沒有刪除筆記。' : search ? '沒有符合的筆記。' : '想到什麼，就先記一則。' }}
				</p>
				<ul v-else>
					<li
						v-for="note in items"
						:key="note.id"
					>
						<button
							type="button"
							class="note-list-item"
							:class="{'is-selected': selected === note.id}"
							@click="open(note.id)"
						>
							<strong>{{ note.pinned ? '置頂 · ' : '' }}{{ note.title }}</strong><span>{{ note.preview || '圖片或空白筆記' }}</span><small>{{ note.updated ? new Date(note.updated).toLocaleString('zh-TW', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '' }}</small>
						</button>
					</li>
				</ul>
				<nav
					v-if="(list.data.value?.total_pages ?? 0) > 1"
					class="notes-pagination"
					aria-label="筆記分頁"
				>
					<button
						type="button"
						:disabled="page <= 1"
						@click="goPage(-1)"
					>
						上一頁
					</button><span>{{ page }} / {{ list.data.value?.total_pages }}</span><button
						type="button"
						:disabled="page >= (list.data.value?.total_pages ?? 1)"
						@click="goPage(1)"
					>
						下一頁
					</button>
				</nav>
			</aside>
			<section
				class="notes-content"
				aria-label="編輯筆記"
			>
				<button
					v-if="selected"
					type="button"
					class="notes-expand-toggle"
					:aria-expanded="expanded"
					@click="expanded = !expanded"
				>
					{{ expanded ? '縮小預覽' : '展開筆記' }}
				</button>
				<button
					type="button"
					class="notes-mobile-back"
					@click="back"
				>
					‹ 回筆記列表
				</button>
				<p
					v-if="selected && detail.isPending.value"
					class="notes-empty"
				>
					開啟筆記中…
				</p>
				<p
					v-else-if="selected && detail.isError.value"
					class="notes-empty"
					role="alert"
				>
					無法開啟筆記。<button
						type="button"
						@click="detail.refetch()"
					>
						重試
					</button>
				</p>
				<QuickNoteDraft
					v-else-if="selected && detail.data.value"
					:key="selected"
					ref="draft"
					:note="detail.data.value"
					@closed="closed"
					@restored="restored"
					@copied="open"
				/>
				<div
					v-else
					class="notes-welcome"
				>
					<span>隨時記下，稍後整理。</span><p>文字、截圖、突然想到的點子，都放這裡。</p><button
						type="button"
						@click="newNote"
					>
						寫一則隨手記
					</button>
				</div>
			</section>
		</div>
	</div>
</template>

<style scoped lang="scss">
.quick-notes-page {
 inline-size: 100%;
 max-inline-size: 1400px;
 margin-inline: auto;
 color: var(--text);
 
}

.notes-page-heading {
 display: flex;
 align-items: center;
 justify-content: space-between;
 gap: 1rem;
 margin-block-end: 1.25rem;
 
}

.notes-heading-text {
 flex: 1;
 min-inline-size: 0;
}

.notes-page-heading .page-title {
 margin-block: .2rem 0;
}

.notes-page-heading .print-page-kicker { display: block; }

.notes-expand-toggle {
 display: block;
 margin: .75rem 1rem .25rem auto;
 padding: .35rem .7rem;
 border: 1px solid var(--grey-300);
 background: transparent;
 color: var(--link);
}

.quick-notes-page:not(.notes-expanded) .notes-content :deep(.tiptap) {
 min-block-size: 8rem;
 max-block-size: 14rem;
 overflow-y: auto;
}

.notes-expanded .notes-layout { grid-template-columns: minmax(0, 1fr); }
.notes-expanded .notes-list { display: none; }

.quick-notes-page button {
 cursor: pointer;
 
}

.notes-page-heading button, .notes-welcome button {
 background: var(--print-green, var(--primary));
 color: white;
 border: 0;
 padding: .65rem 1rem;
 font-weight: 700;
 
}

.notes-layout {
 display: grid;
 grid-template-columns: minmax(220px, 28%) minmax(0, 1fr);
 gap: 1rem;
 align-items: start;
 
}

.notes-list, .notes-content {
 background: var(--print-paper, var(--white));
 min-inline-size: 0;
 
}

.notes-list {
 border-block-start: 4px solid var(--print-green, var(--primary));
 
}

.notes-content {
 border-radius: 12px;
 overflow: hidden;
 border: 1px solid var(--grey-200);
 box-shadow: 0 3px 12px color-mix(in srgb, var(--print-blue) 7%, transparent);
}

.notes-search {
 display: flex;
 gap: .4rem;
 padding: .8rem;
 
}

.notes-search input {
 min-inline-size: 0;
 inline-size: 100%;
 border: 0;
 border-block-end: 1px solid var(--grey-300);
 padding: .4rem;
 background: transparent;
 color: inherit;
 
}

.notes-search button, .notes-tabs button, .notes-pagination button, .notes-mobile-back {
 border: 0;
 color: var(--link);
 background: transparent;
 padding: .35rem .5rem;
 
}

.notes-tabs {
 display: flex;
 padding: 0 .5rem .5rem;
 gap: .25rem;
 border-block-end: 1px solid var(--grey-200);
 
}

.notes-tabs button[aria-pressed='true'] {
 color: var(--text-strong);
 font-weight: 700;
 border-block-end: 2px solid var(--print-orange);
 
}

.notes-list ul {
 list-style: none;
 margin: 0;
 padding: 0;
 
}

.note-list-item {
 inline-size: 100%;
 text-align: start;
 display: flex;
 flex-direction: column;
 gap: .35rem;
 padding: .85rem 1rem;
 border: 0;
 border-block-end: 1px solid var(--grey-200);
 color: inherit;
 background: transparent;
 
}

.note-list-item.is-selected {
 background: var(--print-green-soft, var(--grey-100));
 box-shadow: inset 3px 0 var(--print-green, var(--primary));
 
}

.note-list-item strong, .note-list-item span {
 inline-size: 100%;
 overflow: hidden;
 text-overflow: ellipsis;
 white-space: nowrap;
 
}

.note-list-item span, .note-list-item small {
 font-size: .75rem;
 color: var(--text-muted);
 
}

.notes-pagination {
 display: flex;
 align-items: center;
 justify-content: space-between;
 padding: .6rem;
 font-size: .75rem;
 
}

.notes-empty {
 padding: 1.25rem;
 color: var(--text-muted);
 
}

.notes-welcome {
 padding: 4rem 1.5rem;
 text-align: center;
 min-block-size: 50vh;
 
}

.notes-welcome > span {
 font-size: 1.5rem;
 color: var(--print-green, var(--primary));
 font-weight: 700;
 
}

.notes-welcome p {
 color: var(--text-muted);
 margin-block: 1rem 1.5rem;
 
}

.notes-mobile-back {
 display: none;
 
}

@media (width <= 800px) {

	.notes-layout {
 display: block;
 
}

	.notes-content {
 display: none;
 
}

	.mobile-editor-open .notes-list {
 display: none;
 
}

	.mobile-editor-open .notes-content {
 display: block;
 
}

	.notes-mobile-back {
 display: block;
 
}



}

</style>
