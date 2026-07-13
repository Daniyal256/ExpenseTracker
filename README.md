# ExpenseTracker

ExpenseTracker is a simple trip and group expense tracker built with HTML, CSS, JavaScript, Node.js, and SQL Server.

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
- Uses SQL Server through the Node API.
- Starts empty, then saves your real trip data to the database.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the SQL Server database by running [database/schema.sql](/Users/mac/Documents/4th_Semester/Projects/ExpenseTracker/database/schema.sql) in SQL Server Management Studio or Azure Data Studio.

   The schema does not insert sample trips, members, categories, or expenses.

3. Copy `.env.example` to `.env`, then edit the SQL Server values.

   On macOS/Linux:

   ```bash
   cp .env.example .env
   ```

4. Start the project:

   ```bash
   npm start
   ```

5. Open:

   ```text
   http://localhost:3000
   ```

## Database Tables

- `Projects`: trip name and budget.
- `Members`: people participating in the trip.
- `Categories`: main expense groups.
- `ExpenseItems`: sub category expenses with amount, payment method, and payer.

## Deployment Notes

Deploy the Node.js app to a service that can run a persistent server process, such as Azure App Service, Render, Railway, or a VPS. Configure the same environment variables from `.env.example` in the host dashboard and point them to a reachable SQL Server or Azure SQL database.

For most hosting platforms, set:

```text
HOST=0.0.0.0
```

Keep `HOST=127.0.0.1` for local development.
