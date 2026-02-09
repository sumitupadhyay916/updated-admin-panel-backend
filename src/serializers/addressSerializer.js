function serializeAddress(a) {
  return {
    id: a.id,
    userId: a.userId,
    type: a.type,
    street: a.street,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: a.country,
    isDefault: a.isDefault,
  };
}

module.exports = { serializeAddress };


