document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('img').forEach((img) => {
        if (!img.loading) {
            img.loading = 'lazy';
        }
    });
});
