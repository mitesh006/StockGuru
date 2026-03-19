/**
 * nav.js — Shared navigation auth state
 * Included on every page that has a nav with id="nav-auth"
 */
(function () {
    const token = localStorage.getItem('token');
    const navAuth = document.getElementById('nav-auth');
    if (!navAuth) return;

    if (token) {
        navAuth.innerHTML = '<a href="#" id="logout-link">Logout</a>';
        document.getElementById('logout-link').addEventListener('click', function (e) {
            e.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        });
    } else {
        navAuth.innerHTML = '<a href="login.html">Login</a>';
    }
})();
