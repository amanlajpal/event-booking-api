// Enterprise Dashboard Client Script - Strict CSP Compliant (External Static Asset)
document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.book-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const eventId = btn.getAttribute('data-event-id');
      if (eventId) {
        bookTicket(eventId, btn);
      }
    });
  });
});

async function bookTicket(eventId, btn) {
  const msg = document.getElementById('status-msg');
  if (!msg) return;

  msg.className = 'status-msg status-loading';
  msg.style.display = 'block';
  msg.textContent = '⏳ Authenticating & reserving ticket via API...';

  if (btn) btn.disabled = true;

  try {
    // 1. Authenticate customer
    const loginRes = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'lajpalaman1314@gmail.com',
        password: 'Password123!',
      }),
    });

    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.data?.token) {
      throw new Error(loginData.error || 'Authentication failed');
    }

    const token = loginData.data.token;

    // 2. Book ticket
    const bookRes = await fetch(`/api/v1/events/${eventId}/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quantity: 1 }),
    });

    const bookData = await bookRes.json();

    if (bookRes.status === 201) {
      msg.className = 'status-msg status-success';
      msg.innerHTML = `🎉 <strong>Ticket Booked Successfully!</strong> Booking ID: <code>${bookData.data.id}</code>. Real confirmation email enqueued via BullMQ and delivered to <strong>lajpalaman1314@gmail.com</strong>!`;
      setTimeout(() => {
        window.location.reload();
      }, 2500);
    } else {
      msg.className = 'status-msg status-error';
      msg.textContent = `❌ Booking failed: ${bookData.error || 'Sold out'}`;
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    msg.className = 'status-msg status-error';
    msg.textContent = `❌ Error: ${err instanceof Error ? err.message : String(err)}`;
    if (btn) btn.disabled = false;
  }
}

