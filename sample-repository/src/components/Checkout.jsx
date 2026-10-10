import { useState } from 'react'
import Cart, { getCartTotal } from './Cart.jsx'
import { authorizePayment } from '../services/PaymentService.js'

export default function Checkout({ items, paymentToken, onOrderComplete }) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const total = getCartTotal(items)

  async function submitOrder() {
    setStatus('submitting')
    setError('')
    try {
      const payment = await authorizePayment({ amount: total, paymentToken })
      setStatus('complete')
      onOrderComplete?.({ payment, items })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment could not be processed.')
      setStatus('error')
    }
  }

  return (
    <main>
      <h1>Review your order</h1>
      <Cart items={items} />
      <p>Amount due: ${total.toFixed(2)}</p>
      {error && <p role="alert">{error}</p>}
      {status === 'complete' ? (
        <p role="status">Payment authorized. Your order is confirmed.</p>
      ) : (
        <button disabled={status === 'submitting' || items.length === 0} onClick={submitOrder}>
          {status === 'submitting' ? 'Processing…' : 'Place order'}
        </button>
      )}
    </main>
  )
}
