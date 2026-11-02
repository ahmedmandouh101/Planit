import React from 'react';
import TourCard from './components/TourCard.jsx';

// Teaching data only. The next feature will load tours from the API.
const sampleTour = {
  id: 'learning-giza',
  name: 'A day at the pyramids',
  location: 'Giza, Egypt',
  duration: 1,
  price: 75,
  summary: 'Discover the pyramids and explore the stories of ancient Egypt.',
};

export default function App() {
  return (
    <div className="page">
      <header className="header">
        <a className="brand" href="/react/">planit ↗</a>
        <span className="badge">React preview</span>
      </header>
      <main>
        <p className="eyebrow">YOUR NEXT EGYPT STORY</p>
        <h1>Small steps. New adventures.</h1>
        <p className="intro">Our new experience starts here. This sample tour is for demonstration only and cannot be booked.</p>
        <TourCard tour={sampleTour} />
      </main>
      <footer>Planit · Explore Egypt, one experience at a time.</footer>
    </div>
  );
}
