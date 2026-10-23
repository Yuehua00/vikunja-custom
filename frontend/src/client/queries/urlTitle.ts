import {client} from '@/client/generated/client.gen'

type UrlTitleResponses = {
	200: {title: string}
}

// Not part of the generated SDK: the operation was added after the last client generation, so it goes
// through the shared client (base URL, bearer token and request-context fence) by hand.
export async function fetchUrlTitle(url: string): Promise<string> {
	const {data} = await client.get<UrlTitleResponses, unknown, true>({
		url: '/url-title',
		query: {url},
	})
	return data.title
}
