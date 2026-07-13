const http = require('http');
const fs = require('fs');
const path = require('path');

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = __dirname;
let sql;

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

const normalizedDbServer = normalizeDbServer(process.env.DB_SERVER || 'localhost');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: normalizedDbServer.server,
  database: process.env.DB_DATABASE || 'ExpenseTracker',
  port: process.env.DB_INSTANCE || normalizedDbServer.instanceName ? undefined : Number(process.env.DB_PORT || 1433),
  options: {
    encrypt: String(process.env.DB_ENCRYPT || 'false') === 'true',
    trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE || 'true') === 'true',
    instanceName: process.env.DB_INSTANCE || normalizedDbServer.instanceName
  }
};

let poolPromise;

function normalizeDbServer(serverValue) {
  const [server, instanceName] = String(serverValue).split('\\');
  return { server, instanceName };
}

function getPool() {
  if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    throw new Error('Database credentials are missing. Copy .env.example values into your environment.');
  }

  if (!sql) {
    sql = require('mssql');
  }

  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig);
  }

  return poolPromise;
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

async function getState(requestPath = '/api/state') {
  const pool = await getPool();
  const requestedUrl = new URL(requestPath, `http://${HOST}:${PORT}`);
  const requestedProjectId = Number(requestedUrl.searchParams.get('projectId'));
  const projects = await getProjects(pool);
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
    pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT ProjectId AS id, Name AS name, Budget AS budget FROM dbo.Projects WHERE ProjectId = @projectId'),
    pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT MemberId AS id, Name AS name FROM dbo.Members WHERE ProjectId = @projectId ORDER BY MemberId'),
    pool.request()
      .input('projectId', sql.Int, projectId)
      .query('SELECT CategoryId AS id, Name AS name FROM dbo.Categories WHERE ProjectId = @projectId ORDER BY CategoryId'),
    pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`
        SELECT e.ExpenseItemId AS id,
               e.CategoryId AS categoryId,
               e.MemberId AS memberId,
               e.Name AS name,
               e.Amount AS amount,
               e.PaymentMethod AS paymentMethod
        FROM dbo.ExpenseItems e
        INNER JOIN dbo.Categories c ON c.CategoryId = e.CategoryId
        WHERE c.ProjectId = @projectId
        ORDER BY e.ExpenseItemId
      `)
  ]);

  return {
    projects,
    project: projectResult.recordset[0] || null,
    members: memberResult.recordset,
    categories: categoryResult.recordset,
    expenses: itemResult.recordset
  };
}

async function getProjects(pool) {
  const result = await pool.request().query(`
    SELECT p.ProjectId AS id,
           p.Name AS name,
           p.Budget AS budget,
           COALESCE(SUM(e.Amount), 0) AS spent,
           COUNT(e.ExpenseItemId) AS itemCount
    FROM dbo.Projects p
    LEFT JOIN dbo.Categories c ON c.ProjectId = p.ProjectId
    LEFT JOIN dbo.ExpenseItems e ON e.CategoryId = c.CategoryId
    GROUP BY p.ProjectId, p.Name, p.Budget, p.CreatedAt
    ORDER BY p.CreatedAt DESC, p.ProjectId DESC
  `);

  return result.recordset;
}

async function updateBudget(payload) {
  const pool = await getPool();
  const name = cleanText(payload.name, 'Project name');
  const budget = cleanAmount(payload.budget, 'Budget');
  const projectId = Number(payload.projectId);

  const request = pool.request()
    .input('name', sql.NVarChar(120), name)
    .input('budget', sql.Decimal(12, 2), budget);

  if (Number.isInteger(projectId) && projectId > 0) {
    await request
      .input('projectId', sql.Int, projectId)
      .query('UPDATE dbo.Projects SET Name = @name, Budget = @budget WHERE ProjectId = @projectId');
    return projectId;
  }

  const result = await request.query(`
    INSERT INTO dbo.Projects (Name, Budget)
    OUTPUT INSERTED.ProjectId AS id
    VALUES (@name, @budget)
  `);
  return result.recordset[0].id;
}

async function addMember(payload) {
  const pool = await getPool();
  const name = cleanText(payload.name, 'Member name');
  const projectId = cleanId(payload.projectId, 'Project');

  await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('name', sql.NVarChar(120), name)
    .query('INSERT INTO dbo.Members (ProjectId, Name) VALUES (@projectId, @name)');
}

async function addCategory(payload) {
  const pool = await getPool();
  const name = cleanText(payload.name, 'Category name');
  const projectId = cleanId(payload.projectId, 'Project');

  await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('name', sql.NVarChar(120), name)
    .query('INSERT INTO dbo.Categories (ProjectId, Name) VALUES (@projectId, @name)');
}

async function addExpense(payload) {
  const pool = await getPool();
  const projectId = cleanId(payload.projectId, 'Project');

  const name = cleanText(payload.name, 'Sub category');
  const amount = cleanAmount(payload.amount, 'Amount');
  const categoryId = Number(payload.categoryId);
  const memberId = Number(payload.memberId);
  const paymentMethod = payload.paymentMethod === 'online' ? 'online' : 'cash';

  if (!Number.isInteger(categoryId) || !Number.isInteger(memberId)) {
    throw new Error('Category and member are required.');
  }

  const validation = await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('categoryId', sql.Int, categoryId)
    .input('memberId', sql.Int, memberId)
    .query(`
      SELECT
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.Categories WHERE ProjectId = @projectId AND CategoryId = @categoryId
        ) THEN 1 ELSE 0 END AS categoryExists,
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.Members WHERE ProjectId = @projectId AND MemberId = @memberId
        ) THEN 1 ELSE 0 END AS memberExists
    `);

  if (!validation.recordset[0]?.categoryExists || !validation.recordset[0]?.memberExists) {
    throw new Error('Selected category or member does not belong to this trip.');
  }

  await pool.request()
    .input('categoryId', sql.Int, categoryId)
    .input('memberId', sql.Int, memberId)
    .input('name', sql.NVarChar(160), name)
    .input('amount', sql.Decimal(12, 2), amount)
    .input('paymentMethod', sql.NVarChar(20), paymentMethod)
    .query(`
      INSERT INTO dbo.ExpenseItems (CategoryId, MemberId, Name, Amount, PaymentMethod)
      VALUES (@categoryId, @memberId, @name, @amount, @paymentMethod)
    `);
}

function cleanId(value, fieldName) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${fieldName} is required.`);
  return id;
}

async function updateCategory(payload) {
  const pool = await getPool();
  const projectId = cleanId(payload.projectId, 'Project');
  const categoryId = cleanId(payload.categoryId, 'Category');
  const name = cleanText(payload.name, 'Category name');

  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('categoryId', sql.Int, categoryId)
    .input('name', sql.NVarChar(120), name)
    .query('UPDATE dbo.Categories SET Name = @name WHERE ProjectId = @projectId AND CategoryId = @categoryId');

  if (!result.rowsAffected[0]) throw new Error('Category was not found.');
}

async function deleteCategory(payload) {
  const pool = await getPool();
  const projectId = cleanId(payload.projectId, 'Project');
  const categoryId = cleanId(payload.categoryId, 'Category');

  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('categoryId', sql.Int, categoryId)
    .query('DELETE FROM dbo.Categories WHERE ProjectId = @projectId AND CategoryId = @categoryId');

  if (!result.rowsAffected[0]) throw new Error('Category was not found.');
}

async function deleteExpense(payload) {
  const pool = await getPool();
  const projectId = cleanId(payload.projectId, 'Project');
  const expenseId = cleanId(payload.expenseId, 'Expense');

  const result = await pool.request()
    .input('projectId', sql.Int, projectId)
    .input('expenseId', sql.Int, expenseId)
    .query(`
      DELETE e
      FROM dbo.ExpenseItems e
      INNER JOIN dbo.Categories c ON c.CategoryId = e.CategoryId
      WHERE c.ProjectId = @projectId AND e.ExpenseItemId = @expenseId
    `);

  if (!result.rowsAffected[0]) throw new Error('Expense was not found.');
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
