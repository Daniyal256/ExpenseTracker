# ExpenseTracker

ExpenseTracker is a trip and group expense tracker built with HTML, CSS, JavaScript, Node.js, and PostgreSQL.

## Features

- Set a trip name and total budget.
- Create multiple expense cards and click a card to open its details.
- Add trip members.
- Add categories such as transport, food, stay, shopping, or tickets.
- Edit and delete categories.
- Add sub category expense items with amount, payment method, and member who paid.
- Delete individual expense items.
- View total budget, total spent, remaining amount, and member count.
- Click a category to expand its sub category details.
- See a final summary of how much each member spent.
- Starts empty, then saves your real trip data to PostgreSQL.

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

## Database Tables

- `projects`: trip name and budget.
- `members`: people participating in the trip.
- `categories`: main expense groups.
- `expense_items`: sub category expenses with amount, payment method, and payer.
