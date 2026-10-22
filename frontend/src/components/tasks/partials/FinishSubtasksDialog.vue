<template>
	<Modal
		v-if="request"
		@close="request.resolve(false)"
	>
		<div
			v-cy="'finishSubtasksDialog'"
			class="finish-dialog"
		>
			<h2 class="finish-dialog-title">
				{{ $t('task.subtasks.finishTitle', {task: request.title}) }}
			</h2>
			<p class="finish-dialog-text">
				{{ $t('task.subtasks.finishText', {count: request.subtasks.length}) }}
			</p>
			<ul class="finish-dialog-list">
				<li
					v-for="subtask in request.subtasks"
					:key="subtask.id"
				>
					{{ subtask.title }}
				</li>
			</ul>
			<div class="finish-dialog-actions">
				<XButton
					variant="tertiary"
					@click="request.resolve(false)"
				>
					{{ $t('misc.cancel') }}
				</XButton>
				<XButton
					variant="primary"
					:shadow="false"
					@click="request.resolve(true)"
				>
					{{ $t('task.subtasks.finishConfirm') }}
				</XButton>
			</div>
		</div>
	</Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/misc/Modal.vue'
import {finishConfirmRequest as request} from '@/composables/useFinishConfirm'
</script>

<style lang="scss" scoped>
.finish-dialog {
	padding: 1.75rem 1.5rem 1.5rem;
	background: var(--white);
	color: var(--text);
	border-radius: 16px;
	text-align: start;
}

.finish-dialog-title {
	margin: 0 0 .5rem;
	font-size: 1.2rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.finish-dialog-text {
	margin: 0 0 .75rem;
	color: var(--grey-600);
}

.finish-dialog-list {
	max-block-size: 14rem;
	margin: 0 0 1.25rem;
	padding: .5rem .75rem .5rem 1.75rem;
	overflow-y: auto;
	background: var(--grey-100);
	border-radius: 10px;

	li {
		padding-block: .15rem;
		overflow-wrap: anywhere;
	}
}

.finish-dialog-actions {
	display: flex;
	justify-content: flex-end;
	gap: .5rem;
}
</style>
