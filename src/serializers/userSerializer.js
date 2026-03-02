function serializeBaseUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    avatar: u.avatar || undefined,
    phone: u.phone || undefined,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

function serializeAdminUser(u) {
  return {
    ...serializeBaseUser(u),
    permissions: u.permissions || [],
    createdBy: u.createdById || undefined,
  };
}

function serializeSuperAdminUser(u) {
  return {
    ...serializeBaseUser(u),
    permissions: u.permissions || [],
  };
}

function serializeSellerUser(u) {
  const base = {
    ...serializeBaseUser(u),
    businessName: u.businessName || '',
    businessAddress: u.businessAddress || '',
    gstNumber: u.gstNumber || undefined,
    commissionRate: u.commissionRate ?? 15,
    totalEarnings: u.totalEarnings ?? 0,
    availableBalance: u.availableBalance ?? 0,
    pendingBalance: u.pendingBalance ?? 0,
    createdBy: u.createdById || undefined,
  };

  // Include admin information if available (for Super Admin view)
  if (u.admin) {
    base.admin = {
      id: u.admin.id,
      name: u.admin.name,
      email: u.admin.email,
    };
  }

  // Include creator information if available
  if (u.createdBy) {
    base.createdByUser = {
      id: u.createdBy.id,
      name: u.createdBy.name,
      email: u.createdBy.email,
      role: u.createdBy.role,
    };
  }

  return base;
}

function serializeConsumerUser(u, addresses = []) {
  return {
    ...serializeBaseUser(u),
    addresses,
  };
}

function serializeStaffUser(u) {
  return {
    ...serializeBaseUser(u),
    staffProfile: u.staffProfile ? {
      id: u.staffProfile.id,
      sellerId: u.staffProfile.sellerId,
      role: u.staffProfile.role,
      permissions: u.staffProfile.permissions,
    } : undefined
  };
}

module.exports = {
  serializeBaseUser,
  serializeAdminUser,
  serializeSuperAdminUser,
  serializeSellerUser,
  serializeConsumerUser,
  serializeStaffUser,
};


