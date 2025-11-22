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

const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userRole = req.user.role;
    const userPermissions = permissions[userRole] || [];

    if (userPermissions.includes(requiredPermission)) {
      next();
    } else {
      res.status(403).json({ 
        message: 'Access denied. You do not have permission to perform this action.' 
      });
    }
  };
};

const hasPermission = (role, permission) => {
  const userPermissions = permissions[role] || [];
  return userPermissions.includes(permission);
};

module.exports = {
  checkPermission,
  hasPermission,
  permissions
};

