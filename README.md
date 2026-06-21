# GroceryBuddy

Local and GitHub-backed helper for editing weekly grocery notes and turning them into a Superstore shopping plan.

## Local Use

Run it from this folder with:

```sh
npm start
```

Then open:

```text
http://localhost:4322
```

Files:

- `CommonList.md`: normal weekly staples.
- `WeeklyAddOns.md`: one-off requests for the next order.
- `ItemAliases.md`: shorthand mappings from Reminders to specific shopping intent.
- `Preferences.md`: durable shopping rules.
- `DoNotBuy.md`: exclusions and hard no items.
- `MealPlan.md`: meals or loose food plans for the week.
- `weeks/`: generated weekly snapshots.

Apple Reminders import uses the local macOS Reminders automation bridge. The first import may require granting permission. The importer reads active items from the top of the selected list and stops when completed items begin, which keeps long historical lists fast.

Local saves automatically commit and push the changed grocery file to GitHub. Set `GROCERYBUDDY_AUTO_PUSH=false` before `npm start` to turn that off.

## Siri Voice Capture

GroceryBuddy has a small voice-capture endpoint for Apple Shortcuts:

```text
POST /api/capture
```

It appends one item to `WeeklyAddOns.md` under `Siri captures:` or another source-specific capture heading, then saves the file through the active storage mode. In hosted mode, that means the item is written straight to GitHub.

Suggested iPhone Shortcut:

1. Add **Dictate Text**.
2. Add **Get Contents of URL**.
3. Set the URL to `https://grocery-buddy-six.vercel.app/api/capture`.
4. Set Method to `POST`.
5. Set Request Body to `JSON`.
6. Add `item` = the dictated text.
7. Add `source` = `Siri`.
8. Add header `x-grocerybuddy-password` = your `GROCERYBUDDY_PASSWORD`.
9. Optional: add **Show Result** with a short confirmation.

Then use Siri to run the Shortcut, for example: "Hey Siri, add grocery item."

The endpoint also accepts plain text or form-encoded bodies, so it is forgiving if Shortcuts changes how it sends the request.

## Weekly Rhythm

Use `Siri captures:` in `WeeklyAddOns.md` as the weekly inbox. When the grocery order is done, use **Finish Week** in the editor. It archives the current grocery files to `weeks/YYYY-MM-DD.md`, then clears the capture sections from `WeeklyAddOns.md` so the next week starts clean.

## Hosted Use

When deployed with GitHub storage, the app edits the markdown files in this repository instead of editing files on your Mac.

Set these environment variables on the host:

```text
GROCERYBUDDY_STORAGE=github
GROCERYBUDDY_GITHUB_REPO=russfee/GroceryBuddy
GROCERYBUDDY_GITHUB_BRANCH=main
GROCERYBUDDY_GITHUB_TOKEN=...
GROCERYBUDDY_PASSWORD=...
```

Use a fine-grained GitHub token with **Contents: Read and write** access for this repository. `GROCERYBUDDY_PASSWORD` protects the hosted editor so someone with the URL cannot edit the grocery files.

Apple Reminders import is local-only. The hosted app can edit the files and create weekly snapshots, then the local runner can sync them before shopping:

```sh
npm run sync
```

## Checks

```sh
npm run check
```
