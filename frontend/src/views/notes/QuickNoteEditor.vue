<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {EditorContent, useEditor} from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import {Placeholder} from '@tiptap/extensions'
import {createNodeFromContent} from '@tiptap/core'
import {Fragment} from '@tiptap/pm/model'
import {marked} from 'marked'
import {htmlHasFormatting} from '@/components/input/editor/clipboardHtml'
import {fillRequiredContent} from '@/components/input/editor/contentRepair'
import {quickNoteImageBlob, useUploadQuickNoteImageMutation} from '@/client/queries/quickNotes'

const props = defineProps<{noteId: number, content: string, readonly?: boolean}>()
const emit = defineEmits<{change: [content: string], uploading: [busy: boolean]}>()
const upload = useUploadQuickNoteImageMutation()
const input = ref<HTMLInputElement>()
const uploadError = ref('')
const failedFiles = ref<File[]>([])
const zoom = ref<string>()
const lightbox = ref<HTMLElement>()
watch(zoom, value => {if (value) void nextTick(() => lightbox.value?.focus())})
let live = true
let busy = false
const noteImage = Image.extend({
	addAttributes() {return {...this.parent?.(), imageId: {default: null, parseHTML: element => Number(element.getAttribute('data-note-image-id')) || null, renderHTML: attrs => attrs.imageId ? {'data-note-image-id': attrs.imageId} : {}}}},
	addNodeView() {return ({node}) => {
		const dom = document.createElement('img')
		dom.alt = node.attrs.alt || '筆記圖片'
		dom.draggable = false
		let disposed = false; let objectUrl: string | undefined
		if (node.attrs.imageId) {
			void quickNoteImageBlob(props.noteId, node.attrs.imageId).then(blob => {
				if (disposed) return
				objectUrl = URL.createObjectURL(blob); dom.src = objectUrl
			}).catch(() => {if (!disposed) dom.alt = '圖片載入失敗，請重新開啟筆記'})
		}
		dom.addEventListener('click', () => {if (objectUrl) zoom.value = objectUrl})
		return {dom, destroy() {disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl)}}
	}},
}).configure({allowBase64: false})
// eslint-disable-next-line vue/no-setup-props-reactivity-loss -- A keyed TipTap editor intentionally owns its initial draft.
const editor = useEditor({
	 
	content: props.content,
	editable: !props.readonly,
	extensions: [StarterKit, noteImage, Placeholder.configure({placeholder: '想到什麼就記下來，也可以直接貼上圖片…'})],
	onUpdate: ({editor: instance}) => emit('change', instance.getHTML()),
	editorProps: {
		attributes: {'aria-label': '隨手記內容'},
		handlePaste: (_view, event) => {
			if (props.readonly) return false
			const files = Array.from(event.clipboardData?.files ?? [])
			if (files.length) {
				event.preventDefault(); void addImages(files); return true
			}
			const text = event.clipboardData?.getData('text/plain') || ''
			const instance = editor.value
			if (!instance || !text || instance.isActive('codeBlock') || htmlHasFormatting(event.clipboardData?.getData('text/html') || '')) return false
			if (!/[*`_[\]#-]|^\s*(?:\d+\.|>)\s/m.test(text)) return false
			// Parse through the editor schema, matching the shared editor's paste path.
			const html = marked.parse(text, {async: false})
			const parsed = createNodeFromContent(html, instance.schema, {parseOptions: {preserveWhitespace: 'full'}})
			event.preventDefault()
			instance.commands.insertContent(fillRequiredContent(Fragment.from(parsed)))
			return true
		},
		handleDrop: (_view, event) => {
			const files = Array.from(event.dataTransfer?.files ?? [])
			if (!files.length || props.readonly) return false
			event.preventDefault(); void addImages(files); return true
		},
	},
})
async function addImages(files: File[]) {
	if (props.readonly) return
	if (busy) {failedFiles.value.push(...files); uploadError.value = '上一批圖片仍在上傳，完成後請按重試上傳。'; return}
	busy = true; emit('uploading', true); uploadError.value = ''; failedFiles.value = []
	try {
		for (const file of files) {
			try {
				if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('請選擇 8 MB 以下的 PNG、JPEG、GIF 或 WebP 圖片')
				const image = await upload.mutateAsync({id: props.noteId, file})
				if (!live || editor.value?.isDestroyed) return
				editor.value?.chain().focus().insertContent({type: 'image', attrs: {src: '#', imageId: image.file_id, alt: file.name}}).run()
			} catch (error) {
				if (!live) return
				failedFiles.value.push(file)
				uploadError.value = error instanceof Error ? error.message : '圖片未上傳成功，請重試。'
			}
		}
	} finally {busy = false; if (live) emit('uploading', false)}
}
function selectedFiles(event: Event) {
	const target = event.target as HTMLInputElement
	void addImages(Array.from(target.files ?? [])); target.value = ''
}
onMounted(() => {if (!props.readonly) void nextTick(() => editor.value?.commands.focus('end'))})
onBeforeUnmount(() => {live = false})
</script>

<template>
	<div class="quick-note-editor">
		<div
			v-if="!readonly"
			class="note-format-tools"
			role="toolbar"
			aria-label="文字格式"
		>
			<button
				type="button"
				aria-label="粗體"
				@click="editor?.chain().focus().toggleBold().run()"
			>
				<strong>B</strong>
			</button>
			<button
				type="button"
				@click="editor?.chain().focus().toggleBulletList().run()"
			>
				清單
			</button>
			<button
				type="button"
				:disabled="upload.isPending.value"
				@click="input?.click()"
			>
				＋ 圖片
			</button>
			<input
				ref="input"
				type="file"
				accept="image/png,image/jpeg,image/gif,image/webp"
				multiple
				hidden
				@change="selectedFiles"
			>
		</div>
		<p
			v-if="uploadError"
			class="note-error"
			role="alert"
		>
			{{ uploadError }} <button
				type="button"
				@click="addImages([...failedFiles])"
			>
				重試上傳
			</button>
		</p>
		<EditorContent :editor="editor" />
		<Teleport to="body">
			<div
				v-if="zoom"
				ref="lightbox"
				class="note-image-lightbox"
				role="dialog"
				aria-modal="true"
				aria-label="筆記圖片"
				tabindex="0"
				@click="zoom = undefined"
				@keydown.esc="zoom = undefined"
			>
				<button
					type="button"
					aria-label="關閉圖片"
					@click="zoom = undefined"
				>
					關閉
				</button>
				<img
					:src="zoom"
					alt="放大的筆記圖片"
				>
			</div>
		</Teleport>
	</div>
</template>

<style scoped lang="scss">
.note-format-tools {
 display: flex;
 gap: .4rem;
 padding-block: .5rem;
 border-block-end: 1px solid var(--grey-200);
 
}

.note-format-tools button {
 border: 0;
 background: transparent;
 color: var(--link);
 padding: .35rem .6rem;
 cursor: pointer;
 
}

.quick-note-editor :deep(.tiptap) {
 min-block-size: 50vh;
 padding: 1rem 0;
 outline: none;
 overflow-wrap: anywhere;
 
}

.quick-note-editor :deep(.tiptap p) {
 margin-block: 0 .65rem;
 
}

.quick-note-editor :deep(.tiptap img) {
 max-inline-size: 100%;
 max-block-size: 55vh;
 object-fit: contain;
 display: block;
 margin-block: .8rem;
 border-radius: 3px;
 cursor: zoom-in;
 
}

.quick-note-editor :deep(.tiptap .is-editor-empty:first-child::before) {
 content: attr(data-placeholder);
 color: var(--grey-500);
 float: inline-start;
 block-size: 0;
 pointer-events: none;
 
}

.note-error {
 color: var(--danger);
 font-size: .85rem;
 
}

.note-image-lightbox {
 position: fixed;
 inset: 0;
 z-index: 1500;
 background: #122a30ed;
 display: flex;
 align-items: center;
 justify-content: center;
 padding: 3rem 1rem;
 
}

.note-image-lightbox img {
 max-inline-size: 95%;
 max-block-size: 90vh;
 object-fit: contain;
 
}

.note-image-lightbox button {
 position: absolute;
 inset-block-start: 1rem;
 inset-inline-end: 1rem;
 color: white;
 background: transparent;
 border: 1px solid white;
 padding: .5rem 1rem;
 cursor: pointer;
 
}

</style>
