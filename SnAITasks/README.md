# AI Task Export (Supernote plugin)

Turn handwritten to-dos on a Supernote Manta into tasks with AI. Pick the AI (**Claude** or **OpenAI**) and the task
app (**Amazing Marvin** or **Todoist**) once in Settings; keys for each are kept when switching. New tasks land in the
app's Inbox, due today by default (Marvin `+today`, Todoist due "today"; both configurable).

The package is `SnAITasks-v<version>.snplg`. Internal identifiers (`pluginKey`/package name `SnMarvin`, `pluginID`,
and the `MyStyle/SnMarvin/` settings folder) keep the original name so existing installs and saved keys carry over.

| Where | Button | What it does |
|---|---|---|
| NOTE sidebar | **AI Task Export** | Menu: **This page**, **Whole note**, **Choose pages…** (e.g. `1-3, 5`), or **Marked headings**. |
| NOTE lasso toolbar | **Export Tasks** | Sends the selection right away; **everything selected becomes a task**. |
| DOC text-selection toolbar | **Export Tasks** | Sends the selected text the same way. |

The sidebar options use AI to *find* the to-dos: every To Do on the page, chosen pages, or the whole note.
**Marked headings** finds all tasks, but only from text inside headings with the diagonal-line style (whole note).
Their handwriting is recognized on the device and sent as text (cheap and fast); a page is sent as an image only
if recognition fails. Sends over 10 pages ask first, with a time and cost estimate; pages go 5 per request, and
tasks found so far are kept if a later batch fails. Checked-off and crossed-out items are skipped.

**Lasso is literal:** use it when you already know what the task is. Everything you select becomes a task, even if
it isn't worded like one (a lassoed list becomes one task per line), and nothing else on the page is sent. It's the
way to add one more item from a page you've already exported without creating duplicates, and it sends less to the
AI. The tablet's own handwriting recognition is sent along as a hint, and is used as the task title if the AI
returns nothing.

When it finishes, the plugin shows how many tasks were added, with their titles.

## Setup

1. **Keys** (one AI key plus your task app token)
   - Anthropic API key: <https://console.anthropic.com/settings/keys> (pay-per-use API billing, separate from a Claude.ai subscription), **or**
   - OpenAI API key: <https://platform.openai.com/api-keys> (pay-per-use API billing, separate from ChatGPT Plus).
   - Marvin API token: Marvin → Settings → API (use the regular *API Token*, not the full-access token), **or**
   - Todoist API token: Todoist → Settings → Integrations → Developer → API token.
2. **Install.** Copy `SnAITasks-v<version>.snplg` into `MyStyle/` and install it from **Settings → Apps → Plugins → Add Plugin**.
3. **Enter keys** either way:
   - **Before using it:** Settings → Apps → Plugins → AI Task Export → ⚙. Enter both keys and tap **Save**.
     Both are tested first. Because no note is open there, the keys are held in memory until you **go to a note
     and use the plugin once** (easiest: tap **AI Task Export** in the sidebar, then ✕; the menu sends nothing). Do that before restarting
     the device. The plugin also tries to save on your next pen stroke in any note.
   - **From a note:** tap any plugin button. With no keys saved, the Settings screen opens; enter both keys,
     tap **Test**, then **Save & send** (the page or selection you started with is sent right after).

   Allow the *file* and *network* permission prompts ("Always allow" avoids being asked again).
   Settings can be reopened from the gear or the **Settings** button on the plugin's result screen.
   If the gear doesn't appear after updating, uninstall the plugin and install it fresh.

**Key file (no typing on the device):** create a text file with the content shown under **Key file format** on
the Settings screen (same as `config.example.json`), fill in both keys, name it anything ending in `.json`, and put it
anywhere in `MyStyle` (subfolders too), e.g. with the Supernote Partner app. It's used automatically while no keys are
saved; **Import key file from MyStyle** + **Save** stores the keys so the file can be deleted. On a phone, use a
plain-text editor (e.g. Runestone) or turn off Smart Punctuation so quotes stay straight.

Settings are saved in `MyStyle/SnMarvin/settings.note` (a small note used as storage, since the plugin SDK has no
file-write API) and survive plugin updates. Keys are base64-obfuscated there, not encrypted, so treat device
backups accordingly. Saving needs a note to be open; it doesn't work from a PDF.

## Build

Requires Node 18+. JS-only, so no Android SDK/Gradle is needed:

```bash
npm install
npm run package           # → build/outputs/SnAITasks-v<version>.snplg
                          # (Windows: .\buildPlugin.ps1 → build\outputs\SnMarvin.snplg; rename it)
npm test                  # unit tests for the Claude/Marvin request code
```

Keep `react-native` at **0.79.2** and `react` at **19.0.0** (fixed by the device's plugin host). Never change
`pluginID` in `PluginConfig.json`, or the device treats the plugin as a different one.

## Debugging

**No computer needed:** tap **Show details** on the plugin screen. It lists every step of the last send:
button, permissions, config (keys masked), capture results, the Claude and Marvin HTTP status codes, and any error.
A photo of that screen is usually enough to diagnose a problem. Keys are never shown in full.

With ADB (optional; Supernote may block `adb shell`/`logcat` on some firmware):

```bash
adb push build/outputs/SnAITasks-v*.snplg /storage/emulated/0/MyStyle/
adb logcat -c && adb logcat -s ReactNativeJS:V PluginHost:V   # plugin logs are tagged [SnMarvin]
```

When reinstalling over an existing build, use **Add Plugin** and pick the new file (or overwrite
the host's managed copy in `MyStyle/Plugins/`). Reinstalling the existing entry reuses the old copy.

| Message | Fix |
|---|---|
| `Settings can only be saved with a note open` | Open a note (not a PDF), then open the plugin. |
| `File access was denied` / `Network access was denied` | Settings → Apps → Plugins → AI Task Export → permissions. |
| `Claude rejected the API key (401)` | Check `anthropicApiKey` and the Console billing status. |
| `Marvin rejected the API token` | Use the API token from Marvin's API settings. |
| `Todoist rejected the API token` | Copy the token from Todoist → Settings → Integrations → Developer. |
| `OpenAI … model "…" wasn't found` (Test) | Enter a current OpenAI model that reads images in Settings. |
| `… failed: generateLassoPreview` / `generateNotePng` | Capture failed. Grab `adb logcat` output and check for `PluginSec: DENY`. |

## Data sent off-device

The page or selection image (or the selected DOC text) goes to `api.anthropic.com`, and the extracted task
titles and notes go to `serv.amazingmarvin.com`. Nothing else leaves the device.
