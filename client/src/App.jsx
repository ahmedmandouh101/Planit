import React, { useEffect, useState } from 'react';
import TourCard from './components/TourCard.jsx';
import { fetchTours, PAGE_SIZE } from './api/tours.js';

export default function App() {
  const [tours, setTours] = useState([]);
  const [page, setPage] = useState(1);
  const [difficulty, setDifficulty] = useState('');
  const [priceOrder, setPriceOrder] = useState('price');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading');
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');

    async function loadTours() {
      try {
        const nextTours = await fetchTours(page, controller.signal, difficulty, priceOrder, search);
        // Ignore results from a request that has already been cleaned up.
        if (controller.signal.aborted) return;
        setTours((previous) => page === 1 ? nextTours : [
          ...previous,
          ...nextTours.filter((tour) => !previous.some((item) => item._id === tour._id)),
        ]);
        setHasMore(nextTours.length === PAGE_SIZE);
        setStatus('success');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }

    loadTours();
    return () => controller.abort();
  }, [page, attempt, difficulty, priceOrder, search]);

  function applySearch(value) {
    const term = value.trim();
    setSearchInput(term);
    if (term === search) return;
    setSearch(term);
    resetCatalog();
  }

  function resetCatalog() {
    setPage(1);
    setTours([]);
    setHasMore(false);
    setStatus('loading');
  }

  let noResultsMessage = 'No experiences available yet. Please check back soon.';
  if (search) noResultsMessage = 'No experiences match your search. Try another tour or destination.';
  else if (difficulty) noResultsMessage = 'No experiences match this level. Try another difficulty.';

  return (
    <div className="page">
      <header className="header">
        <a className="brand" href="/react/">planit ↗</a>
        <span className="badge">React preview</span>
      </header>
      <main>
        <p className="eyebrow">YOUR NEXT EGYPT STORY</p>
        <h1>Find your next adventure.</h1>
        <p className="intro">Explore experiences from our tour catalog. Tours marked Demo are fictional development data.</p>
        <form role="search" onSubmit={(event) => {
          event.preventDefault();
          applySearch(searchInput);
        }}>
          <label>Tour or destination{' '}
            <input type="search" maxLength={100} value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)} />
          </label>
          {' '}<button type="submit">Search</button>
          {search && <button type="button" onClick={() => applySearch('')}>Clear search</button>}
        </form>
        <label>
          Difficulty{' '}
          <select value={difficulty} onChange={(event) => {
            setDifficulty(event.target.value);
            resetCatalog();
          }}>
            <option value="">All levels</option>
            <option value="easy">Easy</option>
            <option value="medium">Moderate</option>
            <option value="difficult">Challenging</option>
          </select>
        </label>
        {' '}
        <label>
          Price order{' '}
          <select value={priceOrder} onChange={(event) => {
            setPriceOrder(event.target.value);
            resetCatalog();
          }}>
            <option value="price">Lowest first</option>
            <option value="-price">Highest first</option>
          </select>
        </label>
        <section aria-label="Tour catalog" aria-busy={status === 'loading'}>
          <p className="catalog-status" role="status">
            {status === 'loading'
              ? 'Loading experiences…'
              : status === 'success' && tours.length === 0
                ? noResultsMessage
                : tours.length > 0 ? `${tours.length} experiences loaded` : ''}
          </p>
          <div className="tour-grid">
            {tours.map((tour) => <TourCard key={tour._id} tour={tour} />)}
          </div>
          {status === 'error' && (
            <div className="catalog-error" role="alert">
              <p>We couldn’t load {tours.length ? 'more ' : ''}experiences. Please try again.</p>
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
            </div>
          )}
          {status === 'success' && hasMore && (
            <button className="load-more" type="button" onClick={() => setPage((value) => value + 1)}>Load more experiences</button>
          )}
        </section>
      </main>
      <footer>Planit · Explore Egypt, one experience at a time.</footer>
    </div>
  );
}
