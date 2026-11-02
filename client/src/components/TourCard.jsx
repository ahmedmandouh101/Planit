import React, { useId, useState } from 'react';

export default function TourCard({ tour }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();

  return (
    <article className="tour-card">
      <div className="tour-art" aria-hidden="true">△</div>
      <div className="tour-content">
        <p className="eyebrow">{tour.location} · Demo</p>
        <h2>{tour.name}</h2>
        <p>{tour.duration} day · ${tour.price} per person</p>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          onClick={() => setIsExpanded((previous) => !previous)}
        >
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
        <p id={detailsId} hidden={!isExpanded}>{tour.summary}</p>
      </div>
    </article>
  );
}
