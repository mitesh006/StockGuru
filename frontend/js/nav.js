/**
 * nav.js — Shared navigation auth state
 * Included on every page that has a nav with id="nav-auth"
 */
(function () {
    const token   = localStorage.getItem("token");
    const navAuth = document.getElementById("nav-auth");
    if (!navAuth) return;

    if (token) {
        // Replace the single <li> with two proper sibling <li> elements
        navAuth.outerHTML = `
            <li><a href="profile.html">Profile</a></li>
            <li><a href="#" id="logout-link">Logout</a></li>
        `;
        document.getElementById("logout-link").addEventListener("click", function (e) {
            e.preventDefault();
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "login.html";
        });
    } else {
        // Guest: show Login link (navAuth is already a <li>)
        navAuth.innerHTML = `<a href="login.html">Login</a>`;
    }
})();
