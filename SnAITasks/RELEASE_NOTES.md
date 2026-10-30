# AI Task Export v1.0.0

First public release. AI Task Export is a Supernote plugin that turns handwritten to-dos into tasks in your task app.
It reads them with the AI you choose and uses your own API keys.

## Download

`SnAITasks-v1.0.0.snplg`, attached below. Copy it into `MyStyle/` on the Supernote, then install it from
**Settings → Apps → Plugins → Add Plugin**.

## Features

- **AI:** Claude (Anthropic) or OpenAI.
- **Task apps:** Amazing Marvin, Todoist or TickTick.
- **Sidebar menu:**
  - **This page**, **Whole note**, **Choose pages** (e.g. `1-3, 5`): the AI finds every to-do.
  - **Marked headings:** the AI uses only text inside headings drawn in the diagonal-line style.
  - **Instructions**.
- **Lasso → Export Tasks:** everything you select becomes a task, word for word. Use it to add one more item without
  re-sending a page.
- **PDFs:** select text, then tap **Export Tasks**.
- **Due dates and reminders:**
  - Written dates become due dates.
  - Written times (e.g. "2pm") become task times with a reminder 30 minutes before. This can be turned off in Settings.
- **Large sends:** sends over 10 pages ask first, with a time and cost estimate.
- **Settings:**
  - Test your keys before saving.
  - Or load them from a key file placed anywhere in `MyStyle`.
- **Show details:** a step-by-step log of the last send, with keys masked. A photo of it is enough to report a problem.

## Requirements

- An Anthropic or OpenAI API key. API use is billed separately from a Claude or ChatGPT subscription.
- An API token for one of the task apps:
  - Amazing Marvin: Features → API.
  - Todoist: Settings → Integrations → Developer.
  - TickTick: Settings → Account → API Keys.
- Plugin-capable firmware (Chauvet 3.29.44 or later) and Wi-Fi.

## Tested

- **Supernote Manta:** tested with every AI service and task app listed above. This includes reminders in Marvin,
  Todoist and TickTick (Todoist's 30-minute reminder needs a paid plan).
- **Supernote Nomad:** not tested yet. It should work on firmware 3.29.44 or later. Reports are welcome.
- **Not supported:**
  - China-region TickTick (Dida365) accounts.
  - Supernote's own To-Do list, which the plugin SDK has no API for.

## Privacy

- Your keys stay on the device, in `MyStyle/SnMarvin/settings.note`.
- Note images and text go only to the AI service you select.
- Task titles, notes and dates go only to your task app.
- Nothing else leaves the device.

## Feedback

Report problems or ideas in [Issues](https://github.com/ddpedersen/SuperNote/issues). A photo of **Show details** helps.

MIT License.
