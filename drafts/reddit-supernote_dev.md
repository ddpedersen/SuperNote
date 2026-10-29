**Title:** [Plugin] AI Task Export: handwritten to-dos → Todoist / Amazing Marvin via Claude or OpenAI (BYO key, open source)

---

I built a plugin that turns handwritten to-dos into real tasks. Write your list as usual, tap a button, and the tasks land in your Todoist or Amazing Marvin inbox (due today by default).

**How it works**
- **Sidebar → AI Task Export:** this page, whole note, chosen pages (`1-3, 5`), or only text inside headings with the diagonal-line style. AI picks out the to-dos and skips checked-off and crossed-out items.
- **Lasso → Export Tasks:** what you select becomes the task(s), nothing else is sent. Good for adding one item from a page you already exported, without duplicates.
- **DOC:** select text → Export Tasks.
- Handwriting is recognized on the device and sent as **text** (cheap and fast). A page goes as an image only if recognition fails. Big sends (10+ pages) ask first, with a cost estimate.

**Privacy / permissions**
- Bring your own API key (Anthropic or OpenAI) plus your Todoist/Marvin token. No account, no middle server.
- Data goes only to the AI you choose and to your task app. Permissions: Internet, file read/write.
- Keys stay on the device (or come from a key file you drop in MyStyle, so there's no typing on e-ink).

**Devices:** developed on a Manta. v0.8.0 scales the UI for the Nomad / A5X / A6X screen size, but I don't have those devices. **If you try it on one, a photo of the "Show details" screen would help a lot.**

**Get it:** <GitHub release link>. Copy the `.snplg` to MyStyle → Settings → Apps → Plugins → Add Plugin.
Source: <GitHub repo link>

With Claude Haiku, a dozen pages costs under a cent.

Feedback welcome, especially on other task apps people would want (Things? TickTick? Notion?) and anything that breaks on your firmware. I'd also like to get it into InkHub once Ratta opens plugin submissions. If anyone knows the current submission path, please share.
