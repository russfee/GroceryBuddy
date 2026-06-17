# GroceryBuddy

Local helper for editing weekly grocery notes and turning them into a Superstore shopping plan.

Run it with:

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
- `Preferences.md`: durable shopping rules.
- `DoNotBuy.md`: exclusions and hard no items.
- `MealPlan.md`: meals or loose food plans for the week.
- `weeks/`: generated weekly snapshots.

Apple Reminders import uses the local macOS Reminders automation bridge. The first import may require granting permission.
