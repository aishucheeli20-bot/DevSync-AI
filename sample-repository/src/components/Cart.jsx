import { calculateTotal } from '../utils/calculateTotal.js'

export function getCartTotal(items, pricingOptions) {
  return calculateTotal(items, pricingOptions).total
}

export default function Cart({ items, onQuantityChange, pricingOptions }) {
  const totals = calculateTotal(items, pricingOptions)

  return (
    <section aria-label="Shopping cart">
      <h2>Your cart</h2>
      {items.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <label>
                Quantity
                <input
                  min="1"
                  type="number"
                  value={item.quantity}
                  onChange={(event) =>
                    onQuantityChange(item.id, Number(event.target.value))
                  }
                />
              </label>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
      <p>Subtotal: ${totals.subtotal.toFixed(2)}</p>
      <p>Tax: ${totals.tax.toFixed(2)}</p>
      <strong>Total: ${totals.total.toFixed(2)}</strong>
    </section>
  )
}
