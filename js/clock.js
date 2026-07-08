(function() {
    'use strict';

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function tick() {
        var els = document.querySelectorAll('.topbar-clock');
        if (!els.length) return;
        var now = new Date();
        var time = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
        for (var i = 0; i < els.length; i++) els[i].textContent = time;
    }

    tick();
    setInterval(tick, 1000);
})();
