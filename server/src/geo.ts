// Approximate county headquarters coordinates. Good enough for straight-line distance estimates,
// not for routing. Road distance is approximated with ROAD_FACTOR.
export const COUNTIES: Record<string, { name: string; town: string; lat: number; lng: number }> = Object.fromEntries(([
  ['Mombasa', 'Mombasa', -4.0435, 39.6682], ['Kwale', 'Kwale', -4.1816, 39.4606], ['Kilifi', 'Kilifi', -3.6305, 39.8499],
  ['Tana River', 'Hola', -1.5, 40.03], ['Lamu', 'Lamu', -2.2717, 40.902], ['Taita-Taveta', 'Voi', -3.3961, 38.5561],
  ['Garissa', 'Garissa', -0.4532, 39.6461], ['Wajir', 'Wajir', 1.7471, 40.0573], ['Mandera', 'Mandera', 3.9373, 41.8569],
  ['Marsabit', 'Marsabit', 2.3284, 37.9899], ['Isiolo', 'Isiolo', 0.3546, 37.5822], ['Meru', 'Meru', 0.047, 37.6498],
  ['Tharaka-Nithi', 'Chuka', -0.3333, 37.65], ['Embu', 'Embu', -0.5389, 37.4596], ['Kitui', 'Kitui', -1.3667, 38.0106],
  ['Machakos', 'Machakos', -1.5177, 37.2634], ['Makueni', 'Wote', -1.7833, 37.6333], ['Nyandarua', 'Ol Kalou', -0.2667, 36.3833],
  ['Nyeri', 'Nyeri', -0.4201, 36.9476], ['Kirinyaga', 'Kerugoya', -0.4989, 37.2803], ["Murang'a", "Murang'a", -0.721, 37.1526],
  ['Kiambu', 'Kiambu', -1.1714, 36.8356], ['Turkana', 'Lodwar', 3.1191, 35.5973], ['West Pokot', 'Kapenguria', 1.2389, 35.1119],
  ['Samburu', 'Maralal', 1.0968, 36.698], ['Trans Nzoia', 'Kitale', 1.0157, 35.0062], ['Uasin Gishu', 'Eldoret', 0.5143, 35.2698],
  ['Elgeyo-Marakwet', 'Iten', 0.6703, 35.5081], ['Nandi', 'Kapsabet', 0.2039, 35.105], ['Baringo', 'Kabarnet', 0.4919, 35.743],
  ['Laikipia', 'Nanyuki', 0.0167, 37.0667], ['Nakuru', 'Nakuru', -0.3031, 36.08], ['Narok', 'Narok', -1.0833, 35.8667],
  ['Kajiado', 'Kajiado', -1.8524, 36.7768], ['Kericho', 'Kericho', -0.3677, 35.2831], ['Bomet', 'Bomet', -0.7813, 35.3416],
  ['Kakamega', 'Kakamega', 0.2827, 34.7519], ['Vihiga', 'Mbale', 0.0667, 34.7167], ['Bungoma', 'Bungoma', 0.5635, 34.5606],
  ['Busia', 'Busia', 0.4608, 34.1115], ['Siaya', 'Siaya', 0.0612, 34.2881], ['Kisumu', 'Kisumu', -0.0917, 34.768],
  ['Homa Bay', 'Homa Bay', -0.5273, 34.4571], ['Migori', 'Migori', -1.0634, 34.4731], ['Kisii', 'Kisii', -0.6817, 34.7667],
  ['Nyamira', 'Nyamira', -0.5633, 34.9358], ['Nairobi', 'Nairobi', -1.2864, 36.8172]
] as const).map(([name, town, lat, lng]) => [countyKey(name), { name, town, lat, lng }]));

export const ROAD_FACTOR = 1.3;

/** Normalises spellings such as "Uasin-Gishu", "uasin gishu" and "Muranga". */
export function countyKey(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export function findCounty(name: string) {
  return COUNTIES[countyKey(name)];
}

export function roadKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * ROAD_FACTOR);
}
