<template>
	<div class="field-group">
		<FormCheckbox
			v-model="settings.enabled"
			:label="$t('nightMode.enable')"
		/>
		<p class="help">
			{{ $t('nightMode.help') }}
		</p>
		<FormField
			:label="$t('nightMode.start')"
			layout="two-col"
		>
			<FormInput
				v-model="settings.start"
				type="time"
				:disabled="!settings.enabled"
			/>
		</FormField>
		<FormField
			:label="$t('nightMode.end')"
			layout="two-col"
		>
			<FormInput
				v-model="settings.end"
				type="time"
				:disabled="!settings.enabled"
			/>
		</FormField>
		<FormField
			:label="$t('nightMode.remind')"
			layout="two-col"
		>
			<FormInput
				v-model="settings.remind"
				type="time"
				:disabled="!settings.enabled"
			/>
		</FormField>
	</div>
</template>

<script setup lang="ts">
import FormCheckbox from '@/components/input/FormCheckbox.vue'
import FormField from '@/components/input/FormField.vue'
import FormInput from '@/components/input/FormInput.vue'

import {useNightMode} from '@/composables/useNightMode'

// Saved in this browser as soon as it changes, so it does not take part in the save button of the page.
const {settings} = useNightMode()
</script>
