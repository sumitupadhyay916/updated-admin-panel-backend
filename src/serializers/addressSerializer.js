function serializeAddress(a, user = null) {
  return {
    id: a.id,
    userId: a.userId,
    type: a.type,
    // Map street to 'address' for frontend compatibility
    address: a.street,
    street: a.street,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: a.country,
    isDefault: a.isDefault,
    // Include user name and phone if available
    name: user?.name || '',
    phone: user?.phone || '',
  };
}

module.exports = { serializeAddress };


