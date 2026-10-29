import {queryOptions, useMutation} from '@tanstack/vue-query'
import {quickNotesList, quickNotesRead, quickNotesCreate, quickNotesUpdate, quickNotesDelete, quickNoteImagesUpload, quickNoteImagesDownload, type QuickNote} from '@/client/generated'
import {contextMutationOptions} from './contextMutation'
import {expectBlob} from './blobResponse'

export const quickNoteKeys = {
	all: ['quick-notes'] as const,
	lists: ['quick-notes', 'list'] as const,
	list: (trashed: boolean, search: string, page: number) => ['quick-notes', 'list', trashed, search, page] as const,
	detail: (id: number) => ['quick-notes', 'detail', id] as const,
}
export type QuickNoteResponse = Required<Pick<QuickNote, 'id' | 'title' | 'preview' | 'content' | 'version' | 'pinned' | 'is_trashed'>> & QuickNote
export function normalizeQuickNote(note: QuickNote): QuickNoteResponse {
	if (!note.id) throw new Error('Note response is missing its id')
	return {...note, id: note.id, title: note.title ?? '', preview: note.preview ?? '', content: note.content ?? '', version: note.version ?? 1, pinned: note.pinned ?? false, is_trashed: note.is_trashed ?? false}
}
export function quickNotesQuery(trashed = false, search = '', page = 1) {
	return queryOptions({queryKey: quickNoteKeys.list(trashed, search, page), queryFn: async ({signal}) => {
		const {data} = await quickNotesList({query: {trashed, q: search, page}, signal})
		return {...data, items: (data.items ?? []).map(normalizeQuickNote)}
	}, meta: {handlesError: true}})
}
export function quickNoteQuery(id: number) {
	return queryOptions({queryKey: quickNoteKeys.detail(id), queryFn: async ({signal}) => normalizeQuickNote((await quickNotesRead({path: {id}, signal})).data), enabled: id > 0, meta: {handlesError: true}})
}
export function createQuickNoteMutationOptions() {
	return contextMutationOptions({mutationFn: async (content: string = '') => normalizeQuickNote((await quickNotesCreate({body: {content, version: 1, pinned: false, is_trashed: false}})).data),
		onSuccess: (note, _input, client) => {client.setQueryData(quickNoteKeys.detail(note.id), note)},
		onSettled: (_input, client) => client.invalidateQueries({queryKey: quickNoteKeys.lists}),
	})
}
export type NoteWrite = Pick<QuickNoteResponse, 'id' | 'content' | 'pinned' | 'is_trashed' | 'version'>
export function saveQuickNoteMutationOptions() {
	return contextMutationOptions({mutationFn: async (note: NoteWrite) => normalizeQuickNote((await quickNotesUpdate({path: {id: note.id}, body: note})).data),
		onSuccess: (note, _input, client) => {client.setQueryData(quickNoteKeys.detail(note.id), note)},
		onSettled: (_input, client) => client.invalidateQueries({queryKey: quickNoteKeys.lists}),
		toastError: () => false,
	})
}
export function trashQuickNoteMutationOptions() {
	return contextMutationOptions({mutationFn: async (id: number) => {await quickNotesDelete({path: {id}})},
		onSuccess: (_data, id, client) => {client.removeQueries({queryKey: quickNoteKeys.detail(id), exact: true})},
		onSettled: (_input, client) => client.invalidateQueries({queryKey: quickNoteKeys.lists}),
	})
}
export function uploadQuickNoteImageMutationOptions() {
	return contextMutationOptions({mutationFn: async ({id, file}: {id: number, file: File}) => (await quickNoteImagesUpload({path: {id}, body: {file}})).data, toastError: () => false})
}
export async function quickNoteImageBlob(id: number, file: number) {
	const {data} = await quickNoteImagesDownload({path: {id, file}, parseAs: 'blob'})
	return expectBlob(data, 'Note image')
}
export const useCreateQuickNoteMutation = () => useMutation(createQuickNoteMutationOptions())
export const useSaveQuickNoteMutation = () => useMutation(saveQuickNoteMutationOptions())
export const useTrashQuickNoteMutation = () => useMutation(trashQuickNoteMutationOptions())
export const useUploadQuickNoteImageMutation = () => useMutation(uploadQuickNoteImageMutationOptions())
