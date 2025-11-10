// Role-based permissions configuration
export const ROLE_PERMISSIONS = {
  Drawing: {
    pages: ['project', 'settings', 'debug-user-role'],
    settingsTabs: ['profile', 'security']
  },
  CNC: {
    pages: ['dashboard', 'production', 'settings'],
    settingsTabs: ['profile', 'security']
  },
  Technician: {
    pages: ['production', 'debug-user-role'],
    settingsTabs: ['profile', 'security']
  },
  QC: {
    pages: ['qc', 'settings', 'debug-user-role'],
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

// Helper function to check if user has access to a page
export const hasPageAccess = (userRole, pagePath) => {
  console.log(`hasPageAccess called with: userRole=${userRole}, pagePath=${pagePath}`);
  
  if (!userRole) {
    console.log('No userRole provided');
    return false;
  }
  
  // Normalize role name (handle case sensitivity)
  // Convert to proper case: superadmin -> SuperAdmin, admin -> Admin, etc.
  let normalizedRole;
  switch (userRole.toLowerCase()) {
    case 'superadmin':
      normalizedRole = 'SuperAdmin';
      break;
    case 'admin':
      normalizedRole = 'Admin';
      break;
    case 'drawing':
      normalizedRole = 'Drawing';
      break;
    case 'cnc':
      normalizedRole = 'CNC';
      break;
    case 'technician':
      normalizedRole = 'Technician';
      break;
    case 'qc':
      normalizedRole = 'QC';
      break;
    default:
      normalizedRole = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase();
  }
  
  console.log(`Normalized role: ${userRole} -> ${normalizedRole}`);
  
  if (!ROLE_PERMISSIONS[normalizedRole]) {
    console.log(`Role ${userRole} (normalized to ${normalizedRole}) not found in permissions`);
    console.log('Available roles:', Object.keys(ROLE_PERMISSIONS));
    return false;
  }
  
  // Remove leading slash and get base path (handle undefined safely)
  const safePath = typeof pagePath === 'string' ? pagePath : '';
  const basePath = safePath.replace(/^\//, '').split('/')[0];
  const hasAccess = ROLE_PERMISSIONS[normalizedRole].pages.includes(basePath);
  
  console.log(`Checking access: Role=${userRole} (${normalizedRole}), Page=${basePath}, HasAccess=${hasAccess}`);
  console.log(`Available pages for ${normalizedRole}:`, ROLE_PERMISSIONS[normalizedRole].pages);
  return hasAccess;
};

// Helper function to check if user has access to settings tab
export const hasSettingsTabAccess = (userRole, tabKey) => {
  if (!userRole) {
    return false;
  }
  
  // Normalize role name (handle case sensitivity)
  let normalizedRole;
  switch (userRole.toLowerCase()) {
    case 'superadmin':
      normalizedRole = 'SuperAdmin';
      break;
    case 'admin':
      normalizedRole = 'Admin';
      break;
    case 'drawing':
      normalizedRole = 'Drawing';
      break;
    case 'cnc':
      normalizedRole = 'CNC';
      break;
    case 'technician':
      normalizedRole = 'Technician';
      break;
    case 'qc':
      normalizedRole = 'QC';
      break;
    default:
      normalizedRole = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase();
  }
  
  if (!ROLE_PERMISSIONS[normalizedRole]) {
    return false;
  }
  
  return ROLE_PERMISSIONS[normalizedRole].settingsTabs.includes(tabKey);
};

// Helper function to get allowed pages for a role
export const getAllowedPages = (userRole) => {
  if (!userRole) {
    return [];
  }
  
  // Normalize role name (handle case sensitivity)
  let normalizedRole;
  switch (userRole.toLowerCase()) {
    case 'superadmin':
      normalizedRole = 'SuperAdmin';
      break;
    case 'admin':
      normalizedRole = 'Admin';
      break;
    case 'drawing':
      normalizedRole = 'Drawing';
      break;
    case 'cnc':
      normalizedRole = 'CNC';
      break;
    case 'technician':
      normalizedRole = 'Technician';
      break;
    case 'qc':
      normalizedRole = 'QC';
      break;
    default:
      normalizedRole = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase();
  }
  
  if (!ROLE_PERMISSIONS[normalizedRole]) {
    return [];
  }
  
  return ROLE_PERMISSIONS[normalizedRole].pages;
};

// Helper function to get allowed settings tabs for a role
export const getAllowedSettingsTabs = (userRole) => {
  if (!userRole) {
    return [];
  }
  
  // Normalize role name (handle case sensitivity)
  let normalizedRole;
  switch (userRole.toLowerCase()) {
    case 'superadmin':
      normalizedRole = 'SuperAdmin';
      break;
    case 'admin':
      normalizedRole = 'Admin';
      break;
    case 'drawing':
      normalizedRole = 'Drawing';
      break;
    case 'technician':
      normalizedRole = 'Technician';
      break;
    case 'qc':
      normalizedRole = 'QC';
      break;
    default:
      normalizedRole = userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase();
  }
  
  if (!ROLE_PERMISSIONS[normalizedRole]) {
    return [];
  }
  
  return ROLE_PERMISSIONS[normalizedRole].settingsTabs;
};
