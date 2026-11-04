/**
 * dsh-plugin-custom-profile — host half.
 *
 * The feature is entirely browser-side: the sidebar account launcher is DOM
 * owned by the account client plugin, while the editor is a `settings.section`
 * slot contribution. Both live in `lib/client.js`.
 *
 * This half is deliberately import-free. It exists so the Loader has an entry
 * to mount and the host's client-module scanner can read `dsh.client` from
 * package.json and serve `./client`. It declares no services and does nothing.
 */

/** Loader-visible plugin name; must match the entry id in cordis.patch.yml. */
export const name = 'plugin-custom-profile';

/** No host services are required. */
export const inject = [];

/** Inert on purpose; `dsh.client.immediately` loads the browser half. */
export function apply() {}
