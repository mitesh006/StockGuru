// register.js — Register page logic

// Toggle passwords
function setupToggle(btnId, inputId) {
    document.getElementById(btnId).addEventListener('click', () => {
        const input = document.getElementById(inputId);
        const isText = input.type === 'text';
        input.type = isText ? 'password' : 'text';
        document.getElementById(btnId).textContent = isText ? '👁' : '🙈';
    });
}
setupToggle('toggle-pwd',  'password');
setupToggle('toggle-pwd2', 'confirm-password');

// Password strength meter
document.getElementById('password').addEventListener('input', function () {
    const val = this.value;
    const bar  = document.getElementById('strength-bar');
    const text = document.getElementById('strength-text');
    let strength = 0;
    if (val.length >= 8)         strength++;
    if (/[A-Z]/.test(val))       strength++;
    if (/[0-9]/.test(val))       strength++;
    if (/[^A-Za-z0-9]/.test(val)) strength++;

    const colors  = ['', '#ff3366', '#ffd700', '#00d4ff', '#00ff88'];
    const widths  = ['0%', '25%', '50%', '75%', '100%'];
    const labels  = ['', '⚠ Weak', '● Fair', '◆ Good', '✔ Strong'];

    bar.style.width      = widths[strength];
    bar.style.background = colors[strength];
    text.textContent     = labels[strength];
    text.style.color     = colors[strength];
});

// Form submit
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name     = document.getElementById('fullname').value.trim();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm  = document.getElementById('confirm-password').value;
    const errorMsg   = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');
    const btn = document.getElementById('register-btn');

    errorMsg.style.display = 'none';
    let valid = true;

    if (!name) {
        document.getElementById('name-error').style.display = 'block';
        document.getElementById('fullname').classList.add('error');
        valid = false;
    } else {
        document.getElementById('name-error').style.display = 'none';
        document.getElementById('fullname').classList.remove('error');
    }

    if (password.length < 8) {
        document.getElementById('password-error').style.display = 'block';
        document.getElementById('password').classList.add('error');
        valid = false;
    } else {
        document.getElementById('password-error').style.display = 'none';
        document.getElementById('password').classList.remove('error');
    }

    if (password !== confirm) {
        document.getElementById('confirm-error').style.display = 'block';
        document.getElementById('confirm-password').classList.add('error');
        valid = false;
    } else {
        document.getElementById('confirm-error').style.display = 'none';
        document.getElementById('confirm-password').classList.remove('error');
    }

    if (!valid) return;

    btn.textContent = 'Creating Account...';
    btn.disabled    = true;

    try {
        const response = await fetch('http://localhost:5000/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            successMsg.style.display = 'block';
            setTimeout(() => window.location.href = 'login.html', 2000);
        } else {
            errorMsg.textContent   = '⚠ ' + (data.message || 'Registration failed. Please try again.');
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        errorMsg.textContent   = '⚠ Cannot connect to server. Please try again later.';
        errorMsg.style.display = 'block';
    } finally {
        btn.textContent = 'Create Account →';
        btn.disabled    = false;
    }
});

// Clear errors on input
document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', () => {
        document.getElementById('error-msg').style.display = 'none';
        input.classList.remove('error');
    });
});
