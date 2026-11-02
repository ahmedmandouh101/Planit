import React, { useId, useState } from 'react';

export default function TourCard({ tour }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
  const [imageFailed, setImageFailed] = useState(false);
  const isDemo = tour.imageCover === 'demo-placeholder.svg';
  const imageUrl = tour.imageCover && !isDemo
    ? `/img/tours/${encodeURIComponent(tour.imageCover)}`
    : '/demo-placeholder.svg';

  return (
    <article className="tour-card">
      <div className="tour-art">
        {imageFailed ? <span aria-hidden="true">△</span> : (
          <img src={imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        )}
      </div>
      <div className="tour-content">
        <p className="eyebrow">{tour.startLocation?.address || 'Explore Egypt'}{isDemo ? ' · Demo' : ''}</p>
        <h2>{tour.name}</h2>
        <p>{tour.duration ? `${tour.duration} ${tour.duration === 1 ? 'day' : 'days'} · ` : ''}{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tour.price)} per person</p>
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
