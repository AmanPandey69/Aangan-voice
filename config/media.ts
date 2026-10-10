/**
 * Background media for the dashboard. All free for commercial use:
 *  - Video: Mixkit "Luxury hotel room panning shot" (#4196), Mixkit License, no attribution required.
 *    https://mixkit.co/free-stock-video/luxury-hotel-room-panning-shot-4196/
 *    720p (≈6 MB) on purpose: it sits under a colour overlay, and the 1080p file is ≈60 MB.
 *  - Photos: Pexels License (free, no attribution required).
 *    https://www.pexels.com/photo/teal-sofa-set-and-red-rug-7587820/
 *    https://www.pexels.com/photo/interior-design-of-living-room-20390760/
 *    https://www.pexels.com/photo/modern-interior-design-of-a-living-room-7851904/
 * Served from the providers' CDNs. If one is unavailable, the teal gradient underneath still shows.
 */
const pexels = (id: number, w = 2400) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}&dpr=1`;

/** Interior photos used as covers for enquiry cards (Pexels License). */
const ROOMS = [7587820, 20390760, 7851904, 28991200, 10168692, 15580493];
export function roomPhoto(seed: string, w = 800): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pexels(ROOMS[h % ROOMS.length], w);
}

export const MEDIA = {
  loginVideo: "https://assets.mixkit.co/videos/4196/4196-720.mp4",
  loginPoster: "https://assets.mixkit.co/videos/4196/4196-thumb-720-0.jpg",
  heroEnquiries: pexels(7587820),
  heroReview: pexels(20390760),
  heroCosts: pexels(7851904),
};
