export const PAGE_SIZE = 12;

export async function fetchTours(page, signal) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
    sort: 'price,_id',
  });
  const response = await fetch(`/api/v1/tours?${params}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  });
  if (!response.ok) throw new Error('Unable to load tours.');
  const payload = await response.json();
  const tours = payload?.data?.data;
  if (payload.status !== 'success' || !Array.isArray(tours) || tours.some(
    (tour) => !tour || typeof tour._id !== 'string' || typeof tour.name !== 'string',
  )) throw new Error('Unexpected tour response.');
  return tours;
}
