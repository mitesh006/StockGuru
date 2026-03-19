// login.js — Login page logic

const loginForm   = document.getElementById('login-form');
const errorMsg    = document.getElementById('error-msg');
const togglePwd   = document.getElementById('toggle-pwd');
const passwordInput = document.getElementById('password');

// Redirect if already logged in
if (localStorage.getItem('token')) {
    window.location.href = 'dashboard.html';
}

// Toggle password visibility
togglePwd.addEventListener('click', () => {
    const isText = passwordInput.type === 'text';
    passwordInput.type = isText ? 'password' : 'text';
    togglePwd.textContent = isText ? '👁' : '🙈';
});

// Form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('email').value.trim();
    const password = passwordInput.value;
    const btn      = document.getElementById('login-btn');

    btn.textContent = 'Signing in...';
    btn.disabled    = true;
    errorMsg.style.display = 'none';

    try {
        const response = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = 'dashboard.html';
        } else {
            errorMsg.textContent   = '⚠ ' + (data.message || 'Invalid email or password.');
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        errorMsg.textContent   = '⚠ Cannot connect to server. Running in demo mode.';
        errorMsg.style.display = 'block';
    } finally {
        btn.textContent = 'Sign In →';
        btn.disabled    = false;
    }
});

// Clear error on input
document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', () => { errorMsg.style.display = 'none'; });
});
