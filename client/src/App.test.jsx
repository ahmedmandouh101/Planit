import React, { StrictMode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

afterEach(cleanup);

function tour(index, extra = {}) {
  return { _id: `tour-${index}`, name: `Egypt experience ${index}`, price: 75,
    duration: 2, summary: 'Discover ancient Egypt.', imageCover: 'cover.jpeg',
    startLocation: { address: 'Giza, Egypt' }, ...extra };
}

function response(tours) {
  return { ok: true, json: async () => ({ status: 'success', data: { data: tours } }) };
}

test('loads API tours, keeps real tours unlabelled, and toggles details', async () => {
  let resolve;
  const fetch = vi.fn(() => new Promise((done) => { resolve = done; }));
  vi.stubGlobal('fetch', fetch);
  render(<App />);
  expect(screen.getByRole('status').textContent).toContain('Loading');
  resolve(response([tour(1), tour(2, { imageCover: 'demo-placeholder.svg' })]));
  await screen.findByRole('heading', { name: 'Egypt experience 1' });
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/tours?page=1&limit=12&sort=price%2C_id');
  expect(screen.getAllByText('Giza, Egypt · Demo')).toHaveLength(1);
  const button = screen.getAllByRole('button', { name: 'Show details' })[0];
  expect(button.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('false');
});

test('shows an empty state without demo fallback or a load-more button', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));
  render(<App />);
  await screen.findByText(/No experiences available yet/);
  expect(screen.queryByRole('article')).toBeNull();
  expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
});

test('recovers from an HTTP failure with an explicit retry', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce(response([tour(1)]));
  vi.stubGlobal('fetch', fetch);
  render(<App />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'Egypt experience 1' });
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each([
  { status: 'success', data: { data: 'invalid' } },
  { status: 'success', data: { data: [null] } },
  { status: 'success', data: { data: [{ name: 'Missing identifier' }] } },
])('handles malformed API results without crashing', async (payload) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
  render(<App />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('article')).toBeNull();
});

test('keeps existing cards after a later-page failure and retries the same page', async () => {
  const firstPage = Array.from({ length: 12 }, (_, index) => tour(index));
  const fetch = vi.fn().mockResolvedValueOnce(response(firstPage))
    .mockRejectedValueOnce(new TypeError('Network unavailable'))
    .mockResolvedValueOnce(response([tour(11), tour(12)]));
  vi.stubGlobal('fetch', fetch);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more experiences' }));
  await screen.findByRole('alert');
  expect(screen.getAllByRole('article')).toHaveLength(12);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'Egypt experience 12' });
  expect(screen.getAllByRole('article')).toHaveLength(13);
  expect(fetch.mock.calls[1][0]).toContain('page=2');
  expect(fetch.mock.calls[2][0]).toContain('page=2');
  expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
});

test('ignores a stale StrictMode request and aborts the active request on unmount', async () => {
  const requests = [];
  vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve) => {
    requests.push({ resolve, signal: options.signal });
  })));
  const view = render(<StrictMode><App /></StrictMode>);
  expect(requests).toHaveLength(2);
  expect(requests[0].signal.aborted).toBe(true);
  requests[1].resolve(response([tour(2)]));
  await screen.findByRole('heading', { name: 'Egypt experience 2' });
  requests[0].resolve(response([tour(1)]));
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
  expect(screen.queryByRole('heading', { name: 'Egypt experience 1' })).toBeNull();
  view.unmount();
  expect(requests[1].signal.aborted).toBe(true);
});

test('falls back to artwork if the cover image fails to load', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([tour(1)])));
  const view = render(<App />);
  await screen.findByRole('article');
  const image = view.container.querySelector('img');
  expect(image.getAttribute('src')).toBe('/img/tours/cover.jpeg');
  fireEvent.error(image);
  expect(view.container.querySelector('img')).toBeNull();
});
