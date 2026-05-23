const apiClient = require('./api-client');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cachedDashboard() {
  return wx.getStorageSync('jiangleme.api-cache.mini_program_dashboard') || null;
}

function dashboardData() {
  const cached = cachedDashboard();
  if (!cached || typeof cached !== 'object') {
    return null;
  }
  return cached.data || null;
}

function writeDashboard(data) {
  apiClient.primeCache('mini_program_dashboard', data);
}

function patchResume(updater) {
  const dashboard = dashboardData();
  if (!dashboard || !dashboard.resume) {
    return;
  }
  const nextDashboard = clone(dashboard);
  const nextResume = updater(clone(nextDashboard.resume));
  if (!nextResume) {
    return;
  }
  nextDashboard.resume = nextResume;
  writeDashboard(nextDashboard);
  apiClient.primeCache('resume_portfolio', nextResume);
}

function patchEntitlements(updater) {
  const dashboard = dashboardData();
  if (!dashboard || !dashboard.entitlements) {
    return;
  }
  const nextDashboard = clone(dashboard);
  const nextEntitlements = updater(clone(nextDashboard.entitlements));
  if (!nextEntitlements) {
    return;
  }
  nextDashboard.entitlements = nextEntitlements;
  writeDashboard(nextDashboard);
  apiClient.primeCache('meeting_entitlements', nextEntitlements);
}

function patchActivation(updater) {
  const dashboard = dashboardData();
  if (!dashboard || !dashboard.activation) {
    return;
  }
  const nextDashboard = clone(dashboard);
  const nextActivation = updater(clone(nextDashboard.activation));
  if (!nextActivation) {
    return;
  }
  nextDashboard.activation = nextActivation;
  writeDashboard(nextDashboard);
  apiClient.primeCache('meeting_activation', nextActivation);
}

function primeOrders(orders) {
  apiClient.primeCache('payment_orders', orders);
}

function invalidateDashboardRelated() {
  apiClient.invalidateCaches([
    'mini_program_dashboard',
    'bootstrap',
    'resume_portfolio',
    'meeting_entitlements',
    'meeting_activation',
    'payment_orders',
    'resume_credentials',
    'resume_engagements',
  ]);
}

module.exports = {
  invalidateDashboardRelated,
  patchActivation,
  patchEntitlements,
  patchResume,
  primeOrders,
};
