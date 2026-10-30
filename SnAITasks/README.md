# AI Task Export (Supernote plugin)

Turn handwritten to-dos on a Supernote into tasks with AI. Pick the AI service (**Claude** or **OpenAI**) and the
task app (**Amazing Marvin**, **Todoist** or **TickTick**) once in Settings. New tasks land in the app's Inbox, due today by default.

## Requirements

- **An AI API account and key**, one of:
  - Anthropic: <https://console.anthropic.com/settings/keys>
  - OpenAI: <https://platform.openai.com/api-keys>

  API use is pay-per-use and billed separately from a Claude or ChatGPT subscription.
- **A task app account and API token**, one of:
  - Amazing Marvin: Marvin → Features → API (the regular *API Token*, not the full-access token)
  - Todoist: Settings → Integrations → Developer → API token
  - TickTick: an API token for the TickTick Open API (`api.ticktick.com`; not the China-region Dida365)
- **A Supernote with plugin support.** Built and tested on the Manta (A5 X2). Plugins need firmware Chauvet 3.29.44 or
  later on Manta/Nomad; this build uses sn-plugin-lib 0.2.3, which may need 3.30.45+.
- **Wi-Fi** when sending.

## What it does

| Where | Button | What it does |
|---|---|---|
| Note sidebar | **AI Task Export** | Menu: **This page**, **Whole note**, **Choose pages…** (e.g. `1-3, 5`), **Marked headings**, **Instructions**. |
| Note lasso toolbar | **Export Tasks** | Sends the selection right away; **everything selected becomes a task**. |
| PDF text-selection toolbar | **Export Tasks** | Sends the selected text the same way. |

**This page, Whole note, Choose pages:** the AI *finds* the to-dos: checkboxes, bullets, "todo", and action phrases.
Checked-off and crossed-out items are skipped, as are plain notes. Sends over 10 pages ask first, with a time and cost
estimate. Pages go 5 per AI request, and tasks found so far are kept if a later batch fails.

**Marked headings:** the AI finds all tasks, but only from text inside headings with the diagonal-line style, across
the whole note. To mark an item, lasso it, tap **H** and choose the diagonal-line style. The tablet reads the heading
handwriting itself and sends text, which is faster and cheaper than images. A page is sent as an image only if that
recognition fails.

**Lasso is literal:** use it when you already know what the task is. Everything you select becomes a task, even if it
isn't worded like one, and nothing else on the page is sent. Your wording is kept, including places, times and
names; only a date word such as "today" or "Fri" moves to the due date. A lassoed list becomes one task per line. It's
the way to add one more item from a page you've already exported without creating duplicates. The tablet's own
handwriting recognition is sent along as a hint, and becomes the title if the AI returns nothing.

**Due dates, times and reminders:**
- A date written next to a task becomes its due date. Otherwise Marvin uses the title text from Settings (`+today` by
  default); Todoist and TickTick use the default due ("today"; TickTick also takes "tomorrow").
- A written time (e.g. "2pm") becomes the task time, with a reminder **30 minutes before**:
  - Marvin gets `taskTime` and its reminder fields.
  - Todoist gets a due date-time plus a 30-minute reminder. That reminder is a paid-plan feature; on a free plan
    Todoist reminds at the due time instead.
  - TickTick gets a timed due date plus a 30-minute reminder; dates without a time are all-day.
- A time with no date means today.
- **Settings → Create reminders from task times** (on by default) turns this off; the time then goes in the note.

**Results:** when it finishes, the plugin shows how many tasks were added, with each task's title, due date/time and
note.

**Instructions:** an on-device guide covering all of the above, keys and costs. Open it from the sidebar menu, or from
Settings (directly under the heading). The plugin's ⚙ in Settings → Apps → Plugins opens Settings.

## Setup

1. **Install.** Copy `SnAITasks-v<version>.snplg` into `MyStyle/` and install it from
   **Settings → Apps → Plugins → Add Plugin**.
2. **Enter keys**, one of three ways:
   - **From a note:** tap any plugin button. With no keys saved, Settings opens. Pick the AI service and task app,
     enter the key and token, tap **Test**, then **Save & send**; what you started with is sent right after.
   - **From the plugin list:** Settings → Apps → Plugins → AI Task Export → ⚙. **Save** tests both keys first.
     No note is open there, so the keys are held in memory until you **use the plugin once in a note**; do that
     before restarting. The easiest way is to tap **AI Task Export** in the sidebar, then ✕; the menu sends nothing.
   - **Key file** (no typing on the device): see below.
3. Allow the *file* and *network* permission prompts. "Always allow" avoids being asked again.

### Settings

- **AI service** + **Model**: defaults are `claude-opus-5-5` and `gpt-6-astra`; any model that reads images works.
- **API key** for the selected service.
- **Task app** + **Add to titles** (Marvin shortcuts such as `+today` or `#Project`) or **Default due** (Todoist
  wording such as `today`; TickTick `today` or `tomorrow`; or blank).
- **Token** for the selected task app.
- **Create reminders from task times**.
- **Test**, **Save**, **Import key file**, **Key file format**.

Keys for every service are kept when you switch, so you can switch back without re-entering them.

### Key file

Create a text file like this (also in `config.example.json`, and shown under **Key file format** in Settings), fill in
your keys, name it anything ending in `.json`, and put it anywhere in `MyStyle`, including subfolders. The Supernote
Partner app works for this. Fields you don't use can stay blank.

```json
{
  "aiProvider": "anthropic",
  "anthropicApiKey": "PASTE_ANTHROPIC_KEY",
  "anthropicModel": "claude-opus-5-5",
  "openaiApiKey": "",
  "openaiModel": "gpt-6-astra",
  "taskApp": "marvin",
  "marvinApiToken": "PASTE_MARVIN_TOKEN",
  "titleSuffix": "+today",
  "todoistApiToken": "",
  "todoistDefaultDue": "today",
  "ticktickApiToken": "",
  "ticktickDefaultDue": "today",
  "createReminders": true
}
```

- Use `"aiProvider": "openai"` and/or `"taskApp": "todoist"` / `"ticktick"` to switch services.
- Extra fields such as `"_comment"` are ignored.
- The file is used automatically while no keys are saved in Settings. **Import key file** + **Save** stores the keys
  so the file can be deleted.
- On a phone, use a plain-text editor (e.g. Runestone) or turn off Smart Punctuation so quotes stay straight; the
  plugin reports curly quotes if it finds them.

### Where settings are stored

Settings are saved in `MyStyle/SnMarvin/settings.note`, a small note used as storage because the plugin SDK has no
file-write API. They survive plugin updates. Keys are base64-obfuscated there, not encrypted, so treat device backups
accordingly. Saving needs a note to be open; it doesn't work from a PDF.

Internal identifiers keep the plugin's original name, so existing installs and saved keys carry over:
`pluginKey`/package name `SnMarvin`, `pluginID`, and the `MyStyle/SnMarvin/` folder.

## Costs

AI use is billed to your own API account. That's roughly 1 cent per page image with Claude Opus 5.5, much less with
smaller models, and less for lasso and marked headings, which send small images or text. Exports over 10 pages show an
estimate before sending.

## Data sent off-device

- **AI:** page or selection images, the tablet's recognized text, or selected PDF text go only to the AI service you
  select (`api.anthropic.com` or `api.openai.com`).
- **Task app:** task titles, notes, due dates and times go only to the task app you select
  (`serv.amazingmarvin.com`, `api.todoist.com` or `api.ticktick.com`).
- **Keys:** stay on the device, and each is sent only to its own service.

Nothing else leaves the device.

## Build

Requires Node 18+. It's JS-only, so no Android SDK or Gradle is needed:

```bash
npm install
npm run package   # → build/outputs/SnAITasks-v<version>.snplg
                  #   (Windows: .\buildPlugin.ps1 → build\outputs\SnMarvin.snplg; rename it)
npm test          # unit tests (AI providers, task apps, settings storage, page parsing, selection logic)
```

- Keep `react-native` at **0.79.2** and `react` at **19.0.0**; the device's plugin host requires these versions.
- Never change `pluginID` in `PluginConfig.json`, or the device treats the plugin as a different one.

### Code layout

| Path | Purpose |
|---|---|
| `index.js` | Registers the sidebar, lasso and PDF buttons and the ⚙ settings button |
| `App.tsx` | Plugin screens: menu, page picker, confirm, progress, results, details |
| `src/job.ts` | Send flow: capture → AI → task app, state for the UI |
| `src/capture.ts` | Page/lasso PNG capture, on-device recognition, marked headings |
| `src/prompt.ts` | Shared AI prompt, JSON schema, due date/time helpers |
| `src/claude.ts`, `src/openai.ts` | AI providers (raw `fetch`; the Anthropic TS SDK doesn't support React Native) |
| `src/marvin.ts`, `src/todoist.ts`, `src/ticktick.ts` | Task apps |
| `src/providers.ts` | Registry behind the Settings dropdowns; add a provider or app here |
| `src/config.ts`, `src/store.ts` | Settings, key file search, `settings.note` storage |
| `src/SettingsScreen.tsx`, `src/HelpScreen.tsx` | Settings and Instructions screens |
| `src/log.ts` | On-screen diagnostic log (keys masked) |

## Debugging

**No computer needed:** tap **Show details** on the plugin screen. It lists every step of the last send:
- the button pressed, permissions, and settings (keys masked);
- capture results and recognized text;
- the AI request and response;
- each task's title, due date/time and note;
- the task app's response, including whether reminders were set.

A photo of that screen is usually enough to diagnose a problem. Each open of the plugin starts with details hidden.

ADB is optional, and Supernote may block `adb shell`/`logcat` on some firmware:

```bash
adb push build/outputs/SnAITasks-v*.snplg /storage/emulated/0/MyStyle/
adb logcat -c && adb logcat -s ReactNativeJS:V PluginHost:V   # plugin logs are tagged [SnMarvin]
```

When reinstalling over an existing build, use **Add Plugin** and pick the new file. Reinstalling the existing entry
reuses the host's managed copy in `MyStyle/Plugins/`. If a new icon or the ⚙ doesn't appear, uninstall and install
fresh; saved keys survive.

| Message | Fix |
|---|---|
| `Settings can only be saved with a note open` | Open a note (not a PDF), then open the plugin. |
| `File access was denied` / `Network access was denied` | Settings → Apps → Plugins → AI Task Export → permissions. |
| `… has curly quotes` / `… has a formatting error` | Fix the key file's quotes and commas; compare with **Key file format**. |
| `Claude rejected the API key (401)` / `OpenAI rejected the API key (401)` | Create a new key (keys can expire) and enter it in Settings. |
| `Your OpenAI account is out of credit` | Add credit at platform.openai.com. |
| `OpenAI … model "…" wasn't found` / `Claude … model … wasn't found` (Test) | Enter a current model name in Settings. |
| `Marvin rejected the API token` | Use the API Token from Marvin → Features → API. |
| `Todoist rejected the API token` | Copy the token from Todoist → Settings → Integrations → Developer. |
| `TickTick rejected the API token` | Check the TickTick token; tokens from the developer site can expire. |
| `todoist: reminder not set … Premium only` (details) | Normal on Todoist's free plan; it still reminds at the due time. |
| `No headings with the diagonal-line style were found` | Mark items as headings with the diagonal-line style (lasso → H). |
| `… failed: generateLassoPreview` / `generateNotePng` | Capture failed; send a photo of Show details. |

## Support

Report problems or ideas at <https://github.com/ddpedersen/SuperNote/issues>. A photo of **Show details** helps.

## License

MIT © Derek Pedersen. See [LICENSE](../LICENSE).
