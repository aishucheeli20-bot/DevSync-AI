export async function authorizePayment({ amount, paymentToken }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero.')
  }
  if (!paymentToken) {
    throw new Error('A payment token is required.')
  }

  // Deterministic local demo response; no payment provider or credentials required.
  return {
    authorizationId: `demo_${Date.now()}`,
    amount: Math.round(amount * 100) / 100,
    status: 'authorized',
  }
}
