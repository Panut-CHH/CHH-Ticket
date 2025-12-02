// Role-based permissions configuration
export const ROLE_PERMISSIONS = {
  Drawing: {
    pages: ['project', 'settings', 'debug-user-role'],
    settingsTabs: ['profile', 'security']
  },
  CNC: {
    pages: ['production', 'settings'],
    settingsTabs: ['profile', 'security']
  },
  Production: {
    pages: ['production', 'debug-user-role'],
    settingsTabs: ['profile', 'security']
  },
  Painting: {
    pages: ['production', 'debug-user-role'],
    settingsTabs: ['profile', 'security']
  },
  Packing: {
    pages: ['production', 'debug-user-role'],
    settingsTabs: ['profile', 'security']
  },
  QC: {
    pages: ['qc', 'settings'],
    settingsTabs: ['profile', 'security']
  },
  DashboardView: {
    pages: ['dashboard'],
    settingsTabs: ['profile', 'security']
  },
  Admin: {
    pages: ['dashboard', 'project', 'tickets', 'production', 'qc', 'log', 'settings', 'debug-user-role'],
    settingsTabs: ['profile', 'security', 'users']
  },
  SuperAdmin: {
    pages: ['dashboard', 'project', 'tickets', 'production', 'qc', 'log', 'settings', 'debug-user-role'],
    settingsTabs: ['profile', 'security', 'users', 'erpTest']
  }
};

// Helper function to normalize roles (support both string and array)
const normalizeRoles = (roles) => {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles;
  return [roles];
};

// Helper function to normalize a single role name
const normalizeRoleName = (role) => {
  if (!role) return null;
  const roleStr = String(role).toLowerCase();
  switch (roleStr) {
    case 'superadmin':
      return 'SuperAdmin';
    case 'admin':
      return 'Admin';
    case 'drawing':
      return 'Drawing';
    case 'cnc':
      return 'CNC';
    case 'production':
      return 'Production';
    case 'painting':
      return 'Painting';
    case 'packing':
      return 'Packing';
    case 'qc':
      return 'QC';
    case 'dashboardview':
    case 'dashboard(view)':
      return 'DashboardView';
    default:
      return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  }
};

// Helper function to check if user has access to a page
export const hasPageAccess = (userRoles, pagePath) => {
  const roles = normalizeRoles(userRoles);
  console.log(`hasPageAccess called with: userRoles=${JSON.stringify(roles)}, pagePath=${pagePath}`);
  
  if (roles.length === 0) {
    console.log('No userRoles provided');
    return false;
  }
  
  // Remove leading slash and get base path (handle undefined safely)
  const safePath = typeof pagePath === 'string' ? pagePath : '';
  const basePath = safePath.replace(/^\//, '').split('/')[0];
  
  // Check if any role has access (OR logic)
  for (const role of roles) {
    const normalizedRole = normalizeRoleName(role);
    if (!normalizedRole || !ROLE_PERMISSIONS[normalizedRole]) {
      continue;
    }
    
    if (ROLE_PERMISSIONS[normalizedRole].pages.includes(basePath)) {
      console.log(`Access granted: Role=${role} (${normalizedRole}), Page=${basePath}`);
      return true;
    }
  }
  
  console.log(`Access denied: No role in ${JSON.stringify(roles)} has access to ${basePath}`);
  return false;
};

// Helper function to check if user has access to settings tab
export const hasSettingsTabAccess = (userRoles, tabKey) => {
  const roles = normalizeRoles(userRoles);
  
  if (roles.length === 0) {
    return false;
  }
  
  // Check if any role has access (OR logic)
  for (const role of roles) {
    const normalizedRole = normalizeRoleName(role);
    if (!normalizedRole || !ROLE_PERMISSIONS[normalizedRole]) {
      continue;
    }
    
    if (ROLE_PERMISSIONS[normalizedRole].settingsTabs.includes(tabKey)) {
      return true;
    }
  }
  
  return false;
};

// Helper function to get allowed pages for roles (union of all roles)
export const getAllowedPages = (userRoles) => {
  const roles = normalizeRoles(userRoles);
  
  if (roles.length === 0) {
    return [];
  }
  
  // Get unique pages from all roles (union)
  const allowedPagesSet = new Set();
  
  for (const role of roles) {
    const normalizedRole = normalizeRoleName(role);
    if (!normalizedRole || !ROLE_PERMISSIONS[normalizedRole]) {
      continue;
    }
    
    ROLE_PERMISSIONS[normalizedRole].pages.forEach(page => allowedPagesSet.add(page));
  }
  
  return Array.from(allowedPagesSet);
};

// Helper function to get allowed settings tabs for roles (union of all roles)
export const getAllowedSettingsTabs = (userRoles) => {
  const roles = normalizeRoles(userRoles);
  
  if (roles.length === 0) {
    return [];
  }
  
  // Get unique tabs from all roles (union)
  const allowedTabsSet = new Set();
  
  for (const role of roles) {
    const normalizedRole = normalizeRoleName(role);
    if (!normalizedRole || !ROLE_PERMISSIONS[normalizedRole]) {
      continue;
    }
    
    ROLE_PERMISSIONS[normalizedRole].settingsTabs.forEach(tab => allowedTabsSet.add(tab));
  }
  
  return Array.from(allowedTabsSet);
};

// Helper function to check if user can perform actions (not just view)
// QC, CNC, and DashboardView roles can view pages but cannot perform actions
export const canPerformActions = (userRoles) => {
  const roles = normalizeRoles(userRoles);
  
  if (roles.length === 0) {
    return false;
  }
  
  // If user has any role that can perform actions (not QC, CNC, or DashboardView), return true
  for (const role of roles) {
    const normalizedRole = normalizeRoleName(role);
    if (!normalizedRole) {
      continue;
    }
    
    // QC, CNC, and DashboardView roles can only view, not perform actions
    if (normalizedRole === 'QC' || normalizedRole === 'CNC' || normalizedRole === 'DashboardView') {
      continue;
    }
    
    // All other roles can perform actions
    return true;
  }
  
  // If all roles are QC, CNC, or DashboardView, cannot perform actions
  return false;
};

// Helper function to get display name for role (for UI display)
export const getRoleDisplayName = (role) => {
  if (!role) return '';
  const roleStr = String(role);
  
  // Map internal role names to display names
  const displayNames = {
    'DashboardView': 'Dashboard (View)',
    'dashboardview': 'Dashboard (View)',
    'dashboard(view)': 'Dashboard (View)',
  };
  
  return displayNames[roleStr] || roleStr;
};
