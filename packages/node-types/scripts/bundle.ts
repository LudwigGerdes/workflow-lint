// scripts/bundle.ts — usage: pnpm bundle <n8nAppVersion>...
//
// DEV-TIME ONLY. Writes a bundle into versions/, which ships inside the
// package. It uses the same download as `workflow-lint node-types install`, so the
// shipped copy and an installed one are produced identically. Ship one version
// — the current n8n release — and let users install others on demand.
import { fetchBundle } from '../src/fetch.js';

const versions = process.argv.slice(2);
if (!versions.length) {
	console.error('usage: bundle <n8nAppVersion>...');
	process.exit(2);
}

for (const app of versions) {
	const manifest = await fetchBundle(app, 'versions');
	console.log(
		`bundled n8n@${app} (base ${manifest.libs!['n8n-nodes-base']}, langchain ${manifest.libs!['@n8n/n8n-nodes-langchain']}, workflow pin ${manifest.libs!['n8n-workflow']})`,
	);
}
