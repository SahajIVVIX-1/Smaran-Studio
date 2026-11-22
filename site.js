(function () {
  const root = document.documentElement;

  // ---------- light / dark ----------
  document.querySelector('.theme-toggle')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      next === 'light' ? '#faf9f5' : '#262624',
    );
    try {
      localStorage.setItem('smaran-theme', next);
    } catch {}
  });

  // ---------- reveal on scroll ----------
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('shown');
          io.unobserve(e.target);
        }
      }),
    { rootMargin: '0px 0px -8% 0px' },
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // ---------- notification cards ----------
  const X_ICON =
    '<svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  /** A card like the app's: dots, "Smaran" label, title, note, buttons, and the border light. */
  function makeCard({ title, note, label, important, dots, actions }) {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'Smaran notification');
    card.innerHTML = `
      <div class="card-body">
        <div class="card-main">
          <svg class="card-dots" data-dots="${dots}" data-hold="1.8"></svg>
          <div class="card-text">
            <div class="card-meta">
              <span class="app">Smaran</span>
              ${important ? '<span class="imp" title="Important"></span>' : ''}
              <span class="when"></span>
              <button class="card-close" type="button" aria-label="Dismiss">${X_ICON}</button>
            </div>
            <div class="card-title"></div>
            ${note ? '<div class="card-note"></div>' : ''}
          </div>
        </div>
        <div class="card-actions"></div>
      </div>
      <div class="ring glow" aria-hidden="true"></div>
      <div class="ring" aria-hidden="true"></div>`;
    card.querySelector('.card-title').innerHTML = title;
    if (note) card.querySelector('.card-note').innerHTML = note;
    card.querySelector('.when').textContent = label;
    window.SmaranDots?.mount(card.querySelector('.card-dots'));
    setActions(card, actions);
    return card;
  }

  function setActions(card, actions) {
    const row = card.querySelector('.card-actions');
    row.replaceChildren(
      ...actions.map(([text, onClick, primary]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = primary ? 'act primary' : 'act';
        b.textContent = text;
        b.addEventListener('click', onClick);
        return b;
      }),
    );
  }

  function leave(card, then) {
    if (card.classList.contains('leaving')) return;
    card.classList.add('leaving');
    setTimeout(() => {
      card.remove();
      then?.();
    }, 260);
  }

  // Reminders from the app's own examples.
  const REMINDERS = [
    {
      title: 'Stand up and stretch',
      note: 'Roll your shoulders back',
      dots: 'dance,smark',
    },
    { title: 'Drink some water', note: 'A full glass, then back to it.', dots: 'bell,dance' },
    {
      title: '<strong>Call mom</strong>',
      note: 'She wanted to hear about the <em>trip</em>.',
      important: true,
      dots: 'heart,dance',
    },
    {
      title: 'Look at something far away',
      note: '20 seconds, for your eyes.',
      dots: 'clock,dance',
    },
  ];

  const host = document.getElementById('demo-cards');
  let n = 0;
  function nextReminder() {
    if (!host) return;
    const r = REMINDERS[n++ % REMINDERS.length];
    let hideTimer;
    const done = () => {
      clearTimeout(hideTimer);
      leave(card, () => setTimeout(nextReminder, 900));
    };
    const card = makeCard({
      ...r,
      label: 'now',
      actions: [
        ['Done', done, true],
        [
          'Snooze',
          () =>
            setActions(
              card,
              ['5 min', '15 min', '1 hour', 'Tomorrow'].map((t) => [
                t,
                () => {
                  card.querySelector('.when').textContent = `Snoozed ${t}`;
                  setTimeout(done, 450);
                },
              ]),
            ),
        ],
      ],
    });
    card.querySelector('.card-close').addEventListener('click', done);
    // Normal reminders hide themselves; pointing at one keeps it.
    const arm = () => {
      clearTimeout(hideTimer);
      if (!r.important) hideTimer = setTimeout(done, 9000);
    };
    card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    card.addEventListener('mouseleave', arm);
    arm();
    host.appendChild(card);
  }
  nextReminder();

  // ---------- automation countdown ----------
  const cdHost = document.getElementById('demo-countdown');
  function countdown() {
    if (!cdHost) return;
    let left = 30;
    let timer;
    const finish = (message) => {
      clearInterval(timer);
      leave(card, () => {
        const note = document.createElement('p');
        note.className = 'stage-label';
        note.style.margin = '18px 0 0';
        note.textContent = message;
        cdHost.appendChild(note);
        setTimeout(() => {
          note.remove();
          countdown();
        }, 2600);
      });
    };
    const card = makeCard({
      title: 'Smaran will shut down this PC',
      note: '“Bedtime” · in 30 s. Press Cancel to stop it.',
      label: `in ${left} s`,
      important: true,
      dots: 'clock',
      actions: [
        ['Cancel', () => finish('Cancelled. Nothing happened.'), true],
        ['Run Now', () => finish('In the app, the PC would shut down now.')],
      ],
    });
    card.querySelector('.card-close').addEventListener('click', () =>
      finish('Cancelled. Nothing happened.'),
    );
    timer = setInterval(() => {
      left -= 1;
      card.querySelector('.when').textContent = `in ${left} s`;
      if (left <= 0) finish('Time’s up. In the app, the PC would shut down now.');
    }, 1000);
    cdHost.appendChild(card);
  }
  countdown();
})();
