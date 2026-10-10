export function calculateTotal(items, { taxRate = 0.08, discountRate = 0 } = {}) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  )
  const discountedSubtotal = subtotal * (1 - discountRate)
  const tax = discountedSubtotal * taxRate

  return {
    subtotal: roundCurrency(subtotal),
    discount: roundCurrency(subtotal - discountedSubtotal),
    tax: roundCurrency(tax),
    total: roundCurrency(discountedSubtotal + tax),
  }
}

function roundCurrency(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}
