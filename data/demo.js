exports.tours = [
  {
    name: 'Demo Cairo Heritage Walk',
    duration: 1,
    MaxGroupSize: 12,
    difficulty: 'easy',
    price: 40,
    summary: 'Sample walking tour through historic Cairo.',
    description: 'Fictional demonstration itinerary for local development.',
    imageCover: 'demo-placeholder.svg',
    startLocation: { type: 'Point', coordinates: [31.262, 30.045], address: 'Cairo, Egypt' },
  },
  {
    name: 'Demo Luxor Discovery Tour',
    duration: 3,
    MaxGroupSize: 10,
    difficulty: 'medium',
    price: 180,
    summary: 'Sample multi-day trip exploring Luxor.',
    description: 'Fictional demonstration itinerary for local development.',
    imageCover: 'demo-placeholder.svg',
    startLocation: { type: 'Point', coordinates: [32.6396, 25.6872], address: 'Luxor, Egypt' },
  },
];

exports.places = [
  { name: 'Demo Nile Hotel', type: 'hotel', town: 'Cairo', avgRate: 4.5, avgPrice: 80, about: 'Fictional hotel for development.', imageCover: '/demo-placeholder.svg' },
  { name: 'Demo Alexandria Kitchen', type: 'restaurant', town: 'Alexandria', avgRate: 4.2, avgPrice: 15, about: 'Fictional restaurant for development.', imageCover: '/demo-placeholder.svg' },
  { name: 'Demo Luxor Culture Centre', type: 'entertainment', town: 'Luxor', avgRate: 4.7, avgPrice: 20, about: 'Fictional venue for development.', imageCover: '/demo-placeholder.svg' },
];
