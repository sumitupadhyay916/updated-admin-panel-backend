function serializePayout(p) {
  return {
    id: p.id,
    sellerId: p.sellerId,
    sellerName: p.seller?.name || '',
    amount: p.amount,
    commissionDeduction: p.commissionDeduction,
    finalAmount: p.finalAmount,
    status: p.status,
    paymentMethod: p.paymentMethod,
    accountDetails: p.accountDetails,
    transactionId: p.transactionId || undefined,
    requestedAt: p.requestedAt.toISOString(),
    processedAt: p.processedAt ? p.processedAt.toISOString() : undefined,
    processedBy: p.processedById || undefined,
    notes: p.notes || undefined,
  };
}

module.exports = { serializePayout };


