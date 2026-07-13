const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = __dirname;

let pool;
let schemaReady;

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Add a PostgreSQL database on Railway and attach its DATABASE_URL variable.');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function getReadyPool() {
  const db = getPool();
  if (!schemaReady) {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    schemaReady = db.query(schemaSql);
  }
  await schemaReady;
  return db;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body is too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function cleanText(value, fieldName) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${fieldName} is required.`);
  return text.slice(0, 160);
}

function cleanAmount(value, fieldName) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${fieldName} must be a valid amount.`);
  return amount;
}

function cleanId(value, fieldName) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${fieldName} is required.`);
  return id;
}

async function getState(requestPath = '/api/state') {
  const db = await getReadyPool();
  const requestedUrl = new URL(requestPath, `http://${HOST}:${PORT}`);
  const requestedProjectId = Number(requestedUrl.searchParams.get('projectId'));
  const projects = await getProjects(db);
  const projectId = Number.isInteger(requestedProjectId) && requestedProjectId > 0
    ? requestedProjectId
    : projects[0]?.id;

  if (!projectId) {
    return {
      projects,
      project: null,
      members: [],
      categories: [],
      expenses: []
    };
  }

  const [projectResult, memberResult, categoryResult, itemResult] = await Promise.all([
    db.query(
      'SELECT project_id AS id, name, budget FROM projects WHERE project_id = $1',
      [projectId]
    ),
    db.query(
      'SELECT member_id AS id, name FROM members WHERE project_id = $1 ORDER BY member_id',
      [projectId]
    ),
    db.query(
      'SELECT category_id AS id, name FROM categories WHERE project_id = $1 ORDER BY category_id',
      [projectId]
    ),
    db.query(`
      SELECT e.expense_item_id AS id,
             e.category_id AS "categoryId",
             e.member_id AS "memberId",
             e.name,
             e.amount,
             e.payment_method AS "paymentMethod"
      FROM expense_items e
      INNER JOIN categories c ON c.category_id = e.category_id
      WHERE c.project_id = $1
      ORDER BY e.expense_item_id
    `, [projectId])
  ]);

  return {
    projects,
    project: projectResult.rows[0] || null,
    members: memberResult.rows,
    categories: categoryResult.rows,
    expenses: itemResult.rows
  };
}

async function getProjects(db) {
  const result = await db.query(`
    SELECT p.project_id AS id,
           p.name,
           p.budget,
           COALESCE(SUM(e.amount), 0) AS spent,
           COUNT(e.expense_item_id)::int AS "itemCount"
    FROM projects p
    LEFT JOIN categories c ON c.project_id = p.project_id
    LEFT JOIN expense_items e ON e.category_id = c.category_id
    GROUP BY p.project_id, p.name, p.budget, p.created_at
    ORDER BY p.created_at DESC, p.project_id DESC
  `);

  return result.rows;
}

async function updateBudget(payload) {
  const db = await getReadyPool();
  const name = cleanText(payload.name, 'Project name');
  const budget = cleanAmount(payload.budget, 'Budget');
  const projectId = Number(payload.projectId);

  if (Number.isInteger(projectId) && projectId > 0) {
    const result = await db.query(
      'UPDATE projects SET name = $1, budget = $2 WHERE project_id = $3',
      [name, budget, projectId]
    );
    if (!result.rowCount) throw new Error('Expense card was not found.');
    return projectId;
  }

  const result = await db.query(
    'INSERT INTO projects (name, budget) VALUES ($1, $2) RETURNING project_id AS id',
    [name, budget]
  );
  return result.rows[0].id;
}

async function addMember(payload) {
  const db = await getReadyPool();
  const projectId = cleanId(payload.projectId, 'Project');
  const name = cleanText(payload.name, 'Member name');

  await db.query(
    'INSERT INTO members (project_id, name) VALUES ($1, $2)',
    [projectId, name]
  );
}

async function addCategory(payload) {
  const db = await getReadyPool();
  const projectId = cleanId(payload.projectId, 'Project');
  const name = cleanText(payload.name, 'Category name');

  await db.query(
    'INSERT INTO categories (project_id, name) VALUES ($1, $2)',
    [projectId, name]
  );
}

async function addExpense(payload) {
  const db = await getReadyPool();
  const projectId = cleanId(payload.projectId, 'Project');
  const categoryId = cleanId(payload.categoryId, 'Category');
  const memberId = cleanId(payload.memberId, 'Member');
  const name = cleanText(payload.name, 'Sub category');
  const amount = cleanAmount(payload.amount, 'Amount');
  const paymentMethod = payload.paymentMethod === 'online' ? 'online' : 'cash';

  const validation = await db.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM categories WHERE project_id = $1 AND category_id = $2
      ) AS "categoryExists",
      EXISTS (
        SELECT 1 FROM members WHERE project_id = $1 AND member_id = $3
      ) AS "memberExists"
  `, [projectId, categoryId, memberId]);

  if (!validation.rows[0]?.categoryExists || !validation.rows[0]?.memberExists) {
    throw new Error('Selected category or member does not belong to this trip.');
  }

  await db.query(`
    INSERT INTO expense_items (category_id, member_id, name, amount, payment_method)
    VALUES ($1, $2, $3, $4, $5)
  `, [categoryId, memberId, name, amount, paymentMethod]);
}

async function updateCategory(payload) {
  const db = await getReadyPool();
  const projectId = cleanId(payload.projectId, 'Project');
  const categoryId = cleanId(payload.categoryId, 'Category');
  const name = cleanText(payload.name, 'Category name');

  const result = await db.query(
    'UPDATE categories SET name = $1 WHERE project_id = $2 AND category_id = $3',
    [name, projectId, categoryId]
  );

  if (!result.rowCount) throw new Error('Category was not found.');
}

async function deleteCategory(payload) {
  const db = await getReadyPool();
  const projectId = cleanId(payload.projectId, 'Project');
  const categoryId = cleanId(payload.categoryId, 'Category');

  const result = await db.query(
    'DELETE FROM categories WHERE project_id = $1 AND category_id = $2',
    [projectId, categoryId]
  );

  if (!result.rowCount) throw new Error('Category was not found.');
}

async function deleteExpense(payload) {
  const db = await getReadyPool();
  const projectId = cleanId(payload.projectId, 'Project');
  const expenseId = cleanId(payload.expenseId, 'Expense');

  const result = await db.query(`
    DELETE FROM expense_items e
    USING categories c
    WHERE c.category_id = e.category_id
      AND c.project_id = $1
      AND e.expense_item_id = $2
  `, [projectId, expenseId]);

  if (!result.rowCount) throw new Error('Expense was not found.');
}

async function handleApi(req, res) {
  try {
    const route = req.url.split('?')[0];

    if (req.method === 'GET' && route === '/api/state') {
      sendJson(res, 200, await getState(req.url));
      return;
    }

    if (req.method === 'POST') {
      const payload = await readBody(req);
      let selectedProjectId = payload.projectId;
      if (route === '/api/budget') selectedProjectId = await updateBudget(payload);
      else if (route === '/api/members') await addMember(payload);
      else if (route === '/api/categories') await addCategory(payload);
      else if (route === '/api/categories/update') await updateCategory(payload);
      else if (route === '/api/categories/delete') await deleteCategory(payload);
      else if (route === '/api/expenses') await addExpense(payload);
      else if (route === '/api/expenses/delete') await deleteExpense(payload);
      else {
        sendJson(res, 404, { error: 'API route not found.' });
        return;
      }

      const statePath = selectedProjectId ? `/api/state?projectId=${selectedProjectId}` : '/api/state';
      sendJson(res, 200, await getState(statePath));
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`ExpenseTracker is running at http://${HOST}:${PORT}`);
});
