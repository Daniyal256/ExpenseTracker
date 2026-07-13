const formatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0
});

let activeProjectId = null;
let creatingNewProject = false;
const codeStoreKey = 'expenseTrackerCodes';
let state = {
  projects: [],
  project: null,
  members: [],
  categories: [],
  expenses: []
};

const els = {
  budgetForm: document.querySelector('#budgetForm'),
  budgetButton: document.querySelector('#budgetButton'),
  projectName: document.querySelector('#projectName'),
  budgetInput: document.querySelector('#budgetInput'),
  newProjectButton: document.querySelector('#newProjectButton'),
  joinForm: document.querySelector('#joinForm'),
  joinCode: document.querySelector('#joinCode'),
  shareCodeBox: document.querySelector('#shareCodeBox'),
  shareCodeText: document.querySelector('#shareCodeText'),
  modifierCodeGroup: document.querySelector('#modifierCodeGroup'),
  modifierCodeText: document.querySelector('#modifierCodeText'),
  shareExpenseButton: document.querySelector('#shareExpenseButton'),
  shareModifierButton: document.querySelector('#shareModifierButton'),
  copyCodeButton: document.querySelector('#copyCodeButton'),
  copyModifierButton: document.querySelector('#copyModifierButton'),
  projectList: document.querySelector('#projectList'),
  memberForm: document.querySelector('#memberForm'),
  memberName: document.querySelector('#memberName'),
  categoryForm: document.querySelector('#categoryForm'),
  categoryName: document.querySelector('#categoryName'),
  expenseForm: document.querySelector('#expenseForm'),
  expenseCategory: document.querySelector('#expenseCategory'),
  expenseName: document.querySelector('#expenseName'),
  expenseAmount: document.querySelector('#expenseAmount'),
  expenseMember: document.querySelector('#expenseMember'),
  budgetTotal: document.querySelector('#budgetTotal'),
  spentTotal: document.querySelector('#spentTotal'),
  remainingTotal: document.querySelector('#remainingTotal'),
  memberCount: document.querySelector('#memberCount'),
  categoryList: document.querySelector('#categoryList'),
  summaryList: document.querySelector('#summaryList'),
  toast: document.querySelector('#toast')
};

async function apiRequest(path, payload) {
  const response = await fetch(path, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function syncFromServer(projectId = activeProjectId) {
  try {
    const codes = getStoredCodes();
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (codes.length) params.set('codes', codes.join(','));
    const path = `/api/state${params.toString() ? `?${params}` : ''}`;
    state = await apiRequest(path);
    activeProjectId = state.project?.id || null;
    creatingNewProject = false;
    render();
  } catch (error) {
    render();
    showToast(`Database is not connected: ${error.message}`);
  }
}

async function mutate(path, payload) {
  state = await apiRequest(path, payload);
  activeProjectId = state.project?.id || null;
  rememberCode(state.project?.modifierCode || state.project?.viewerCode);
  creatingNewProject = false;
  render();
}

function getStoredCodes() {
  try {
    const codes = JSON.parse(localStorage.getItem(codeStoreKey) || '[]');
    return Array.isArray(codes) ? codes.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function rememberCode(code) {
  if (!code) return;
  const nextCodes = [code, ...getStoredCodes().filter(savedCode => savedCode !== code)].slice(0, 30);
  localStorage.setItem(codeStoreKey, JSON.stringify(nextCodes));
}

function getActiveAccessCode() {
  return state.project?.modifierCode || state.project?.viewerCode || null;
}

function canModify() {
  return state.project?.accessLevel === 'modifier';
}

function getSharePayload(code, accessLabel) {
  const tripName = state.project?.name || 'ExpenseTracker trip';
  const url = window.location.origin;
  const text = `Join my ExpenseTracker card "${tripName}" as ${accessLabel} with code ${code}. Open ${url} and enter the code.`;

  return {
    title: tripName,
    text,
    url
  };
}

function activeProjectPayload() {
  if (!activeProjectId) throw new Error('Open or create an expense card first.');
  return { projectId: activeProjectId, accessCode: getActiveAccessCode() };
}

function categoryTotal(categoryId) {
  return state.expenses
    .filter(expense => Number(expense.categoryId) === Number(categoryId))
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
}

function totalSpent() {
  return state.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
}

function memberPaid(memberId) {
  return state.expenses
    .filter(expense => Number(expense.memberId) === Number(memberId))
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
}

function memberName(memberId) {
  return state.members.find(member => Number(member.id) === Number(memberId))?.name || 'Unknown';
}

function render() {
  const spent = totalSpent();
  const budget = Number(state.project?.budget || 0);
  const remaining = budget - spent;

  els.projectName.value = creatingNewProject ? '' : state.project?.name || '';
  els.budgetInput.value = creatingNewProject ? '' : budget || '';
  els.budgetButton.textContent = state.project && !creatingNewProject ? 'Save expense' : 'Create expense';
  els.shareCodeText.textContent = state.project?.viewerCode || '';
  els.modifierCodeText.textContent = state.project?.modifierCode || '';
  els.shareCodeBox.hidden = !state.project?.viewerCode || creatingNewProject;
  els.modifierCodeGroup.hidden = !state.project?.modifierCode || !canModify();
  els.modifierActions.hidden = !state.project?.modifierCode || !canModify();
  els.budgetTotal.textContent = formatter.format(budget);
  els.spentTotal.textContent = formatter.format(spent);
  els.remainingTotal.textContent = formatter.format(remaining);
  els.remainingTotal.style.color = remaining < 0 ? 'var(--coral)' : 'inherit';
  els.memberCount.textContent = state.members.length;

  renderProjects();
  renderSelects();
  renderCategories();
  renderSummary();
  setFormAvailability();
}

function renderProjects() {
  if (!state.projects.length) {
    els.projectList.innerHTML = '<div class="empty">No expense cards yet. Create your first one from the budget panel.</div>';
    return;
  }

  els.projectList.innerHTML = state.projects.map(project => {
    const spent = Number(project.spent || 0);
    const budget = Number(project.budget || 0);
    const remaining = budget - spent;
    const isActive = Number(project.id) === Number(activeProjectId) && !creatingNewProject;

    return `
      <button class="project-card ${isActive ? 'active' : ''}" type="button" data-project-id="${project.id}">
        <span>
          <strong>${escapeHtml(project.name)}</strong>
          <small>${escapeHtml(project.accessLevel)} · ${escapeHtml(project.viewerCode)} · ${Number(project.itemCount || 0)} ${Number(project.itemCount || 0) === 1 ? 'expense item' : 'expense items'}</small>
        </span>
        <span class="project-card-metrics">
          <b>${formatter.format(spent)}</b>
          <small>${formatter.format(remaining)} left</small>
        </span>
      </button>
    `;
  }).join('');
}

function renderSelects() {
  els.expenseCategory.innerHTML = state.categories.length
    ? state.categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')
    : '<option value="">Add a category first</option>';

  els.expenseMember.innerHTML = state.members.length
    ? state.members.map(member => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join('')
    : '<option value="">Add a member first</option>';
}

function renderCategories() {
  if (!state.project || creatingNewProject) {
    els.categoryList.innerHTML = '<div class="empty">Create or open an expense card to manage categories.</div>';
    return;
  }

  if (!state.categories.length) {
    els.categoryList.innerHTML = '<div class="empty">No categories yet. Add one to begin tracking.</div>';
    return;
  }

  els.categoryList.innerHTML = state.categories.map(category => {
    const expenses = state.expenses.filter(expense => Number(expense.categoryId) === Number(category.id));
    const expenseActions = expense => canModify()
      ? `<button class="icon-button danger" type="button" data-action="delete-expense" data-expense-id="${expense.id}" aria-label="Delete expense">Delete</button>`
      : '';
    const categoryActions = canModify()
      ? `
          <div class="row-actions">
            <button class="icon-button" type="button" data-action="edit-category" data-category-id="${category.id}" data-category-name="${escapeHtml(category.name)}">Edit</button>
            <button class="icon-button danger" type="button" data-action="delete-category" data-category-id="${category.id}">Delete</button>
          </div>
        `
      : '';
    const rows = expenses.length
      ? expenses.map(expense => `
          <div class="expense-row">
            <div>
              <strong>${escapeHtml(expense.name)}</strong>
              <div class="expense-meta">
                <span class="pill">${escapeHtml(memberName(expense.memberId))}</span>
                <span class="pill">${expense.paymentMethod === 'online' ? 'Online' : 'Cash'}</span>
              </div>
            </div>
            <span class="amount">${formatter.format(Number(expense.amount))}</span>
            ${expenseActions(expense)}
          </div>
        `).join('')
      : '<div class="empty">No sub categories added here yet.</div>';

    return `
      <article class="category-item">
        <div class="category-row">
          <button class="category-button" type="button" aria-expanded="false">
            <span class="category-name">
              <strong>${escapeHtml(category.name)}</strong>
              <small>${expenses.length} sub ${expenses.length === 1 ? 'category' : 'categories'}</small>
            </span>
            <span class="category-total">${formatter.format(categoryTotal(category.id))}</span>
            <span class="chevron" aria-hidden="true">⌄</span>
          </button>
          ${categoryActions}
        </div>
        <div class="expense-list">${rows}</div>
      </article>
    `;
  }).join('');
}

function renderSummary() {
  if (!state.project || creatingNewProject) {
    els.summaryList.innerHTML = '<div class="empty">Member totals appear after you open an expense card.</div>';
    return;
  }

  if (!state.members.length) {
    els.summaryList.innerHTML = '<div class="empty">Add members to see who paid what.</div>';
    return;
  }

  const maxPaid = Math.max(1, ...state.members.map(member => memberPaid(member.id)));
  els.summaryList.innerHTML = state.members.map(member => {
    const paid = memberPaid(member.id);
    const width = Math.round((paid / maxPaid) * 100);

    return `
      <div class="summary-row">
        <span class="summary-member">
          <strong>${escapeHtml(member.name)}</strong>
          <small>${paid ? 'Contributed to trip spend' : 'No payments yet'}</small>
        </span>
        <span class="amount">${formatter.format(paid)}</span>
        <span class="summary-bar" aria-hidden="true"><span style="--width: ${width}%"></span></span>
      </div>
    `;
  }).join('');
}

function setFormAvailability() {
  const tripReady = Boolean(state.project) && !creatingNewProject && canModify();
  const canAddExpense = tripReady && state.categories.length > 0 && state.members.length > 0;

  setDisabled(els.memberForm, !tripReady);
  setDisabled(els.categoryForm, !tripReady);
  setDisabled(els.expenseForm, !canAddExpense);
}

function setDisabled(form, disabled) {
  form.querySelectorAll('input, select, button').forEach(control => {
    control.disabled = disabled;
  });
  form.classList.toggle('is-disabled', disabled);
}

function startNewProject() {
  creatingNewProject = true;
  activeProjectId = null;
  state.project = null;
  state.members = [];
  state.categories = [];
  state.expenses = [];
  render();
  els.projectName.focus();
}

async function handleCategoryAction(action, categoryId, categoryName) {
  if (action === 'edit-category') {
    const nextName = window.prompt('Rename category', categoryName || '');
    if (!nextName || !nextName.trim()) return;
    await mutate('/api/categories/update', {
      ...activeProjectPayload(),
      categoryId,
      name: nextName.trim()
    });
    showToast('Category updated.');
  }

  if (action === 'delete-category') {
    const ok = window.confirm('Delete this category and all expenses inside it?');
    if (!ok) return;
    await mutate('/api/categories/delete', {
      ...activeProjectPayload(),
      categoryId
    });
    showToast('Category deleted.');
  }
}

async function handleExpenseAction(expenseId) {
  const ok = window.confirm('Delete this expense item?');
  if (!ok) return;
  await mutate('/api/expenses/delete', {
    ...activeProjectPayload(),
    expenseId
  });
  showToast('Expense deleted.');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => els.toast.classList.remove('show'), 5200);
}

els.newProjectButton.addEventListener('click', startNewProject);

els.joinForm.addEventListener('submit', async event => {
  event.preventDefault();
  const code = els.joinCode.value.trim();
  if (!code) return;

  try {
    await mutate('/api/join', { code });
    els.joinForm.reset();
    showToast('Expense card joined.');
  } catch (error) {
    showToast(`Could not join expense: ${error.message}`);
  }
});

els.copyCodeButton.addEventListener('click', async () => {
  const code = state.project?.viewerCode;
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    showToast('Expense code copied.');
  } catch {
    showToast(`Expense code: ${code}`);
  }
});

els.shareExpenseButton.addEventListener('click', async () => {
  const code = state.project?.viewerCode;
  if (!code) return;

  const payload = getSharePayload(code, 'viewer');
  try {
    if (navigator.share) {
      await navigator.share(payload);
      return;
    }

    await navigator.clipboard.writeText(payload.text);
    showToast('Share message copied.');
  } catch (error) {
    if (error.name !== 'AbortError') {
      showToast(`Expense code: ${code}`);
    }
  }
});

els.copyModifierButton.addEventListener('click', async () => {
  const code = state.project?.modifierCode;
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    showToast('Modifier code copied.');
  } catch {
    showToast(`Modifier code: ${code}`);
  }
});

els.shareModifierButton.addEventListener('click', async () => {
  const code = state.project?.modifierCode;
  if (!code) return;

  const payload = getSharePayload(code, 'modifier');
  try {
    if (navigator.share) {
      await navigator.share(payload);
      return;
    }

    await navigator.clipboard.writeText(payload.text);
    showToast('Modifier share message copied.');
  } catch (error) {
    if (error.name !== 'AbortError') {
      showToast(`Modifier code: ${code}`);
    }
  }
});

els.projectList.addEventListener('click', event => {
  const card = event.target.closest('.project-card');
  if (!card) return;
  syncFromServer(Number(card.dataset.projectId));
});

els.categoryList.addEventListener('click', async event => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    try {
      const action = actionButton.dataset.action;
      if (action === 'delete-expense') await handleExpenseAction(Number(actionButton.dataset.expenseId));
      else await handleCategoryAction(action, Number(actionButton.dataset.categoryId), actionButton.dataset.categoryName);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  const categoryButton = event.target.closest('.category-button');
  if (!categoryButton) return;
  const item = categoryButton.closest('.category-item');
  const isOpen = item.classList.toggle('open');
  categoryButton.setAttribute('aria-expanded', String(isOpen));
});

els.budgetForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    projectId: creatingNewProject ? null : activeProjectId,
    accessCode: creatingNewProject ? null : getActiveAccessCode(),
    name: els.projectName.value.trim(),
    budget: Number(els.budgetInput.value)
  };

  try {
    await mutate('/api/budget', payload);
    showToast(payload.projectId ? 'Expense card saved.' : 'Expense card created.');
  } catch (error) {
    showToast(`Could not save expense card: ${error.message}`);
  }
});

els.memberForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = { ...activeProjectPayload(), name: els.memberName.value.trim() };
  if (!payload.name) return;

  try {
    await mutate('/api/members', payload);
    els.memberForm.reset();
  } catch (error) {
    showToast(`Could not add member: ${error.message}`);
  }
});

els.categoryForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = { ...activeProjectPayload(), name: els.categoryName.value.trim() };
  if (!payload.name) return;

  try {
    await mutate('/api/categories', payload);
    els.categoryForm.reset();
  } catch (error) {
    showToast(`Could not add category: ${error.message}`);
  }
});

els.expenseForm.addEventListener('submit', async event => {
  event.preventDefault();

  const payload = {
    ...activeProjectPayload(),
    categoryId: Number(els.expenseCategory.value),
    memberId: Number(els.expenseMember.value),
    name: els.expenseName.value.trim(),
    amount: Number(els.expenseAmount.value),
    paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').value
  };

  try {
    await mutate('/api/expenses', payload);
    els.expenseName.value = '';
    els.expenseAmount.value = '';
  } catch (error) {
    showToast(`Could not add expense: ${error.message}`);
  }
});

syncFromServer();
