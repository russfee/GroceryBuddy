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
