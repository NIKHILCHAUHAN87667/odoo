const permissions = {
  admin: [
    'view_dashboard', 'view_products', 'add_products', 'edit_products', 'delete_products',
    'view_stock', 'adjust_stock', 'create_receipt', 'validate_receipt', 'create_delivery',
    'validate_delivery', 'create_transfer', 'validate_transfer', 'view_ledger',
    'manage_warehouses', 'manage_users', 'manage_settings', 'run_reports'
  ],
  manager: [
    'view_dashboard', 'view_products', 'add_products', 'edit_products',
    'view_stock', 'adjust_stock', 'create_receipt', 'validate_receipt', 'create_delivery',
    'validate_delivery', 'create_transfer', 'validate_transfer', 'view_ledger',
    'run_reports'
  ],
  staff: [
    'view_dashboard', 'view_products', 'view_stock', 'create_receipt',
    'create_delivery', 'create_transfer', 'view_ledger'
  ]
};

export const hasPermission = (userRole, permission) => {
  if (!userRole) return false;
  const userPermissions = permissions[userRole] || [];
  return userPermissions.includes(permission);
};

export const canAddProducts = (role) => hasPermission(role, 'add_products');
export const canEditProducts = (role) => hasPermission(role, 'edit_products');
export const canDeleteProducts = (role) => hasPermission(role, 'delete_products');
export const canAdjustStock = (role) => hasPermission(role, 'adjust_stock');
export const canValidateReceipt = (role) => hasPermission(role, 'validate_receipt');
export const canValidateDelivery = (role) => hasPermission(role, 'validate_delivery');
export const canValidateTransfer = (role) => hasPermission(role, 'validate_transfer');
export const canManageWarehouses = (role) => hasPermission(role, 'manage_warehouses');
export const canManageUsers = (role) => hasPermission(role, 'manage_users');
export const canRunReports = (role) => hasPermission(role, 'run_reports');

export default permissions;

