const adminPage = document.querySelector('#admin-page');
let adminVersion = 0;
let adminToursPage = 1;
let adminBookingsPage = 1;

async function adminRequest(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response
    .json()
    .catch(() => ({ message: 'The server could not complete this request.' }));
  if (!response.ok) throw new Error(result.message || 'Request failed.');
  return result;
}

function adminField(label, type = 'text', value = '') {
  const wrapper = element('label', '', label);
  const input = element('input');
  input.type = type;
  input.value = value;
  wrapper.append(input);
  return { wrapper, input };
}

function renderTourEditor(tour, version, reload) {
  const editor = element('form', 'auth-form admin-editor');
  editor.append(
    element('h3', '', tour ? 'Edit tour details' : 'Create a tour'),
  );
  const fields = {
    name: adminField('Tour name (10–40 characters)', 'text', tour?.name || ''),
    summary: adminField('Short summary', 'text', tour?.summary || ''),
    price: adminField('Price per person (USD)', 'number', tour?.price ?? 0),
    duration: adminField('Duration in days', 'number', tour?.duration ?? 1),
    MaxGroupSize: adminField(
      'Maximum guests per request',
      'number',
      tour?.MaxGroupSize ?? 12,
    ),
    imageCover: adminField(
      'Existing cover filename',
      'text',
      tour?.imageCover || 'demo-placeholder.svg',
    ),
  };
  fields.name.input.minLength = 10;
  fields.name.input.maxLength = 40;
  fields.summary.input.maxLength = 500;
  fields.price.input.min = '0';
  fields.price.input.max = '1000000';
  fields.price.input.step = '0.01';
  fields.duration.input.min = '1';
  fields.duration.input.max = '365';
  fields.duration.input.step = '1';
  fields.MaxGroupSize.input.min = '1';
  fields.MaxGroupSize.input.max = '1000';
  fields.MaxGroupSize.input.step = '1';
  for (const field of Object.values(fields)) {
    field.input.required = true;
    editor.append(field.wrapper);
  }
  const difficultyLabel = element('label', '', 'Activity level');
  const difficulty = element('select');
  for (const [value, label] of Object.entries(levels)) {
    const option = element('option', '', label);
    option.value = value;
    difficulty.append(option);
  }
  difficulty.value = tour?.difficulty || 'easy';
  difficultyLabel.append(difficulty);
  const hidden = adminField('Keep this tour hidden from customers', 'checkbox');
  hidden.input.checked = tour?.secretTour ?? true;
  const descriptionLabel = element('label', '', 'Description');
  const description = element('textarea');
  description.rows = 4;
  description.maxLength = 10000;
  description.value = tour?.description || '';
  descriptionLabel.append(description);
  const feedback = element('p');
  feedback.setAttribute('role', 'status');
  const save = element(
    'button',
    'button primary',
    tour ? 'Save tour details' : 'Create tour',
  );
  save.type = 'submit';
  editor.append(
    difficultyLabel,
    hidden.wrapper,
    descriptionLabel,
    element(
      'p',
      'booking-note',
      'A filename must refer to an existing uploaded image. The default is a demo illustration. Date schedules and image uploading are not edited in this form. Existing booking prices are snapshots and will not change.',
    ),
    feedback,
    save,
  );
  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [
        key,
        ['price', 'duration', 'MaxGroupSize'].includes(key)
          ? Number(field.input.value)
          : field.input.value.trim(),
      ]),
    );
    body.difficulty = difficulty.value;
    body.secretTour = hidden.input.checked;
    body.description = description.value.trim();
    save.disabled = true;
    feedback.textContent = 'Saving…';
    try {
      await adminRequest(
        `/api/v1/tours${tour ? `/${tour._id}` : ''}`,
        tour ? 'PATCH' : 'POST',
        body,
      );
      if (version !== adminVersion) return;
      editor.remove();
      await reload('Tour saved.');
    } catch (error) {
      if (version === adminVersion) feedback.textContent = error.message;
    } finally {
      if (version === adminVersion) save.disabled = false;
    }
  });
  const cancel = element('button', 'button secondary', 'Close editor');
  cancel.type = 'button';
  cancel.onclick = () => editor.remove();
  editor.append(cancel);
  return editor;
}

async function renderAdmin() {
  document.querySelector('.admin-link')?.remove();
  if (currentUser?.role === 'admin') {
    const link = element('a', 'admin-link', 'Admin studio');
    link.href = '/admin';
    if (screenPath === '/admin') link.setAttribute('aria-current', 'page');
    document.querySelector('.app-nav').append(link);
  }
  if (screenPath !== '/admin') return;
  document.querySelector('.app-nav').after(adminPage);
  const version = ++adminVersion;
  document.body.dataset.screen = 'admin';
  document
    .querySelectorAll('main > section, main > .ticker, main > .journey-bar')
    .forEach((section) => {
      section.hidden = section !== adminPage;
    });
  adminPage.hidden = false;
  adminPage.replaceChildren(
    element('p', 'eyebrow', 'PLANIT / OPERATIONS'),
    element('h1', '', 'Behind the journey.'),
  );
  adminPage.querySelector('h1').id = 'admin-title';
  document.title = 'Admin studio — Planit';
  if (!currentUser) {
    adminPage.append(
      element(
        'p',
        '',
        'Log in with an administrator account to manage Planit.',
      ),
    );
    const login = element('button', 'button primary', 'Log in');
    login.onclick = () => accountButton.click();
    adminPage.append(login);
    return;
  }
  if (currentUser.role !== 'admin') {
    adminPage.append(
      element(
        'p',
        'admin-notice',
        'Access denied. Your account does not have administrator permissions.',
      ),
    );
    return;
  }
  adminPage.append(
    element(
      'p',
      'admin-intro',
      'Manage the collection. Publish departure capacity. Keep an eye on booking requests.',
    ),
  );
  const toursPanel = element('section', 'admin-panel');
  const bookingsPanel = element('section', 'admin-panel');
  const editorHost = element('div');
  const notice = element('p', 'admin-notice');
  notice.setAttribute('role', 'status');
  adminPage.append(notice, toursPanel, editorHost, bookingsPanel);

  async function loadAdminTours(message = '') {
    toursPanel.replaceChildren(
      element('h2', '', 'Tour collection'),
      element('p', '', 'Loading tours…'),
    );
    try {
      const result = await adminRequest(
        `/api/v1/admin/tours?page=${adminToursPage}`,
      );
      if (version !== adminVersion) return;
      notice.textContent = message;
      toursPanel.replaceChildren(element('h2', '', 'Tour collection'));
      const create = element('button', 'button primary', '+ Create tour');
      create.onclick = () => {
        editorHost.replaceChildren(
          renderTourEditor(null, version, loadAdminTours),
        );
        editorHost.scrollIntoView({ block: 'start' });
      };
      toursPanel.append(create);
      const rows = element('div', 'admin-tour-list');
      for (const tour of result.data.tours) {
        const row = element('article', 'admin-tour-row');
        const info = element('div');
        info.append(
          element('h3', '', tour.name),
          element(
            'p',
            '',
            `${tour.secretTour ? 'Hidden' : 'Published'} · ${price(tour.price)} / person · ${tour.duration || '—'} ${tour.duration === 1 ? 'day' : 'days'}`,
          ),
        );
        const edit = element('button', 'button secondary', 'Edit details');
        edit.onclick = () => {
          editorHost.replaceChildren(
            renderTourEditor(tour, version, loadAdminTours),
          );
          editorHost.scrollIntoView({ block: 'start' });
        };
        const departure = element(
          'button',
          'button secondary',
          'Manage departures',
        );
        departure.disabled = tour.secretTour;
        departure.onclick = () => {
          editorHost.replaceChildren(renderDepartureEditor(tour, version));
          editorHost.scrollIntoView({ block: 'start' });
        };
        row.append(info, edit, departure);
        rows.append(row);
      }
      if (!result.data.tours.length)
        rows.append(element('p', '', 'No tours on this page.'));
      toursPanel.append(rows);
      const pagination = element('div', 'account-actions');
      const previous = element('button', 'button secondary', 'Previous page');
      previous.disabled = adminToursPage === 1;
      previous.onclick = () => {
        adminToursPage -= 1;
        loadAdminTours();
      };
      const next = element('button', 'button secondary', 'Next page');
      next.disabled = !result.hasMore;
      next.onclick = () => {
        adminToursPage += 1;
        loadAdminTours();
      };
      pagination.append(
        previous,
        element('span', '', `Page ${adminToursPage}`),
        next,
      );
      toursPanel.append(pagination);
    } catch (error) {
      if (version === adminVersion) {
        toursPanel.replaceChildren(
          element('h2', '', 'Tour collection'),
          element('p', '', error.message),
        );
        const retry = element('button', 'button secondary', 'Retry tours');
        retry.onclick = () => loadAdminTours();
        toursPanel.append(retry);
      }
    }
  }

  async function loadAdminBookings() {
    bookingsPanel.replaceChildren(
      element('h2', '', 'Booking ledger'),
      element('p', '', 'Loading bookings…'),
    );
    try {
      const result = await adminRequest(
        `/api/v1/bookings?page=${adminBookingsPage}&limit=12&sort=-createdAt`,
      );
      if (version !== adminVersion) return;
      bookingsPanel.replaceChildren(
        element('h2', '', 'Booking ledger'),
        element(
          'p',
          'booking-note',
          'Read-only. Payment flags, cancellations, and seat counters cannot be changed here.',
        ),
      );
      for (const booking of result.data.data) {
        const row = element('article', 'admin-booking');
        row.append(
          element(
            'h3',
            '',
            booking.tourName || booking.tour?.name || 'Unavailable tour',
          ),
          element(
            'p',
            '',
            `${booking.departureDate ? new Date(booking.departureDate).toISOString().slice(0, 10) : 'Legacy date unavailable'} · ${booking.guests || '—'} guests · ${price(booking.price)}`,
          ),
          element(
            'p',
            'booking-state',
            `${booking.status || 'Legacy'} / ${booking.paid ? 'Paid' : booking.paymentStatus || 'Unpaid'} / ${booking.holdStatus || 'No hold'}`,
          ),
          element('small', '', `Booking reference: ${booking._id}`),
        );
        bookingsPanel.append(row);
      }
      if (!result.results)
        bookingsPanel.append(element('p', '', 'No bookings on this page.'));
      const previous = element(
        'button',
        'button secondary',
        'Previous bookings',
      );
      previous.disabled = adminBookingsPage === 1;
      previous.onclick = () => {
        adminBookingsPage -= 1;
        loadAdminBookings();
      };
      const next = element('button', 'button secondary', 'Next bookings');
      next.disabled = result.results < 12;
      next.onclick = () => {
        adminBookingsPage += 1;
        loadAdminBookings();
      };
      bookingsPanel.append(previous, next);
    } catch (error) {
      if (version === adminVersion) {
        bookingsPanel.append(element('p', '', error.message));
        const retry = element('button', 'button secondary', 'Retry bookings');
        retry.onclick = loadAdminBookings;
        bookingsPanel.append(retry);
      }
    }
  }
  await Promise.all([loadAdminTours(), loadAdminBookings()]);
}

function renderDepartureEditor(tour, version) {
  const panel = element('section', 'admin-panel');
  panel.append(element('h2', '', `Departures / ${tour.name}`));
  const form = element('form', 'auth-form admin-editor');
  const date = adminField('Departure date (UTC)', 'date');
  date.input.required = true;
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  date.input.min = tomorrow.toISOString().slice(0, 10);
  const capacity = adminField('Total departure capacity', 'number', 12);
  capacity.input.min = '1';
  capacity.input.max = '1000';
  capacity.input.step = '1';
  capacity.input.required = true;
  const closed = adminField('Close this departure to new holds', 'checkbox');
  const feedback = element('p');
  feedback.setAttribute('role', 'status');
  const save = element('button', 'button primary', 'Save departure capacity');
  save.type = 'submit';
  form.append(
    date.wrapper,
    capacity.wrapper,
    closed.wrapper,
    element(
      'p',
      'booking-note',
      'Capacity includes all held and confirmed seats. It cannot be reduced below reserved seats. If the tour has offered dates, choose one of those dates.',
    ),
    feedback,
    save,
  );
  const availability = element('div');
  let request = 0;
  async function refresh() {
    const current = ++request;
    availability.textContent = 'Loading departures…';
    try {
      const result = await adminRequest(
        `/api/v1/departures?tourId=${tour._id}`,
      );
      if (version !== adminVersion || !panel.isConnected || current !== request)
        return;
      availability.replaceChildren();
      for (const departure of result.data.departures) {
        const day = new Date(departure.date).toISOString().slice(0, 10);
        const select = element(
          'button',
          'departure-choice',
          `${day} · ${departure.availableSeats}/${departure.capacity} available · ${departure.closed ? 'Closed' : 'Open'}`,
        );
        select.type = 'button';
        select.onclick = () => {
          date.input.value = day;
          capacity.input.value = departure.capacity;
          closed.input.checked = departure.closed;
        };
        availability.append(select);
      }
      if (!result.data.departures.length)
        availability.textContent =
          'No scheduled departures. Create one with the form above.';
    } catch (error) {
      if (version === adminVersion && current === request)
        availability.textContent = error.message;
    }
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    save.disabled = true;
    feedback.textContent = 'Saving…';
    try {
      await adminRequest('/api/v1/departures', 'PUT', {
        tourId: tour._id,
        date: date.input.value,
        capacity: Number(capacity.input.value),
        closed: closed.input.checked,
      });
      if (version !== adminVersion || !panel.isConnected) return;
      feedback.textContent = 'Departure saved.';
      await refresh();
    } catch (error) {
      if (version === adminVersion) feedback.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  };
  const reload = element('button', 'button secondary', 'Refresh departures');
  reload.onclick = refresh;
  panel.append(form, reload, availability);
  queueMicrotask(refresh);
  return panel;
}

document.addEventListener('planit:account-change', renderAdmin);
renderAdmin();
