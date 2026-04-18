// about.js — About page logic

// Smooth scroll animation via IntersectionObserver
const sections = document.querySelectorAll('.about-section');

const observer = new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity   = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, { threshold: 0.1, rootMargin: '0px 0px -100px 0px' });

sections.forEach(section => {
    section.style.opacity    = '0';
    section.style.transform  = 'translateY(20px)';
    section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(section);
});

