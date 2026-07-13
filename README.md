# ExpenseTracker

ExpenseTracker is a trip and group expense tracker built with HTML, CSS, JavaScript, Node.js, and PostgreSQL.

## Features

- Set a trip name and total budget.
- Create multiple expense cards and click a card to open its details.
- Share a viewer code for read-only access or a modifier code for edit access.
- Remember joined expense cards on each device.
- Add trip members.
- Add categories such as transport, food, stay, shopping, or tickets.
- Edit and delete categories.
- Add sub category expense items with amount, payment method, and member who paid.
- Delete individual expense items.
- View total budget, total spent, remaining amount, and member count.
- Click a category to expand its sub category details.
- See a final summary of how much each member spent.
- Starts empty, then saves your real trip data to PostgreSQL.
- Opens registered cards without signal after they have been opened online once.
- Queues offline edits on the device and syncs them to PostgreSQL when signal returns.

## Offline Use on a Trip

Before leaving an area with signal:

1. Open the Railway URL on the phone you will use.
2. Join or create the expense card and open it at least once.
3. Optionally use the browser menu to install **ExpenseTracker** on the home screen.

After that, the same Railway URL or installed home-screen app can open without signal. Existing registered cards, members, categories, totals, and expenses are loaded from the device. Changes show an **Offline** status and remain queued on that phone. When the browser detects signal again, it sends the queued changes to PostgreSQL in their original order.

Creating a brand-new card and joining a card for the first time still require signal because the server must issue or verify its access code. Do not clear the browser's site data, because that removes the offline copy and its unsynced queue.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a PostgreSQL database.

3. Run [database/schema.sql](/Users/mac/Documents/4th_Semester/Projects/ExpenseTracker/database/schema.sql) in your PostgreSQL query editor.

4. Copy `.env.example` to `.env`, then edit `DATABASE_URL`.

   ```bash
   cp .env.example .env
   ```

5. Start the project:

   ```bash
   npm start
   ```

6. Open:

   ```text
   http://localhost:3000
   ```

## Railway Deployment

Use this setup so your laptop does not need to stay on:

```text
Samsung phone -> Railway app -> Railway PostgreSQL
```

1. In Railway, add a PostgreSQL database to the same project.

2. Open the PostgreSQL database service and copy its public or internal `DATABASE_URL`.

3. Open the ExpenseTracker web service -> Variables.

4. Delete old SQL Server variables if Railway suggested them:

   ```text
   DB_USER
   DB_PASSWORD
   DB_SERVER
   DB_DATABASE
   DB_PORT
   DB_ENCRYPT
   DB_TRUST_SERVER_CERTIFICATE
   ```

5. Add these variables:

   ```env
   HOST=0.0.0.0
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ```

   If your PostgreSQL service has a different name, use that service name in the reference variable.

6. Redeploy the ExpenseTracker service. The app runs [database/schema.sql](/Users/mac/Documents/4th_Semester/Projects/ExpenseTracker/database/schema.sql) automatically when it first connects to PostgreSQL.

7. Open the Railway public domain on your phone.

## Sharing Expense Cards

When you create an expense card, the app shows two 7-character codes.

- Send the viewer code to people who should only see the expense card.
- Send the modifier code to people who can add, edit, or delete data.
- They open the same Railway URL.
- They enter the code in **Expense code** and click **Join**.
- Their browser remembers the card after joining once.

Anyone with the modifier code can edit that expense card. Anyone with only the viewer code can view it.

## Database Tables

- `projects`: trip name, budget, viewer code, and modifier code.
- `members`: people participating in the trip.
- `categories`: main expense groups.
- `expense_items`: sub category expenses with amount, payment method, and payer.
