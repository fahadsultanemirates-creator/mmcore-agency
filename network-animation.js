// Signature hero element: subtle animated node network
// echoing the logo's hexagon/connection motif.

(function () {
  const canvas = document.getElementById('heroNetwork');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width, height, nodes, dpr;
  const NODE_COUNT_BASE = 46;
  const LINK_DIST = 130;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.offsetWidth;
    height = canvas.offsetHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function initNodes() {
    const count = window.innerWidth < 700 ? Math.floor(NODE_COUNT_BASE * 0.5) : NODE_COUNT_BASE;
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: Math.random() * 1.5 + 1,
      pulse: Math.random() * Math.PI * 2
    }));
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      n.pulse += 0.015;

      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
    }

    // links
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          const opacity = (1 - dist / LINK_DIST) * 0.18;
          ctx.strokeStyle = `rgba(229, 22, 154, ${opacity})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // nodes
    for (const n of nodes) {
      const glow = (Math.sin(n.pulse) + 1) / 2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + glow * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(229, 22, 154, ${0.35 + glow * 0.35})`;
      ctx.fill();
    }
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  resize();
  initNodes();

  let rafId = null;
  function loop() {
    step();
    rafId = requestAnimationFrame(loop);
  }
  function start() {
    if (rafId === null) rafId = requestAnimationFrame(loop);
  }
  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  if (!reduceMotion) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        start();
      } else {
        stop();
      }
    });
    observer.observe(canvas);
  } else {
    step(); // draw once, static
  }

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resize();
      initNodes();
    }, 200);
  });
})();
